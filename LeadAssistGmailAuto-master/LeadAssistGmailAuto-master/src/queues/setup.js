const Bull = require('bull');
const Redis = require('ioredis');
const { queueLogger } = require('../utils/logger');
const db = require('../database/setup'); // Assuming db.js exports runQuery

// Import processors
const scraperProcessor = require('./processors/scraperProcessor');
const processingProcessor = require('./processors/processingProcessor'); // Ensure this is correctly imported

const SCRAPER_CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY, 10) || 1;
const PROCESSING_CONCURRENCY = parseInt(process.env.PROCESSING_CONCURRENCY, 10) || 5;

// Standard Redis connection options
const redisOptions = {
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || '127.0.0.1',
  // For Bull, specific options like maxRetriesPerRequest and enableReadyCheck
  // are best handled in the createClient function based on client type.
};

// Store the primary client used for Bull's general operations if needed, though Bull creates its own.
let regularBullClient;

// Function to create Bull-compatible Redis clients
function createClient(type) {
  queueLogger.info(`Bull requested Redis ${type} instance.`);
  let client;
  const clientOptions = {
    ...redisOptions,
    maxRetriesPerRequest: null, // Recommended for Bull >= 3.7.0 with ioredis >= 4.x
    enableReadyCheck: false,    // Recommended for Bull >= 3.7.0 with ioredis >= 4.x
    // connectTimeout: 10000, // Optional: time out for connection attempts
  };

  switch (type) {
    case 'client':
      // This client is used for general queue operations.
      // Bull might reuse this or create new ones as needed.
      // if (!regularBullClient || regularBullClient.status === 'end') {
      regularBullClient = new Redis(clientOptions);
      client = regularBullClient;
      // } else {
      //   client = regularBullClient;
      // }
      break;
    case 'subscriber':
      // Subscribers should always be new connections as per Bull's recommendation.
      client = new Redis(clientOptions);
      break;
    case 'bclient':
      // Blocking clients should also be new connections.
      client = new Redis(clientOptions);
      break;
    default:
      queueLogger.error(`Unknown Redis client type requested by Bull: ${type}`);
      throw new Error(`Unknown Redis client type: ${type}`);
  }

  client.on('error', (err) => queueLogger.error(`Redis '${type}' client error: ${err.message}`, { error: err, type }));
  client.on('connect', () => queueLogger.info(`Redis '${type}' client connected.`));
  client.on('ready', () => queueLogger.info(`Redis '${type}' client ready.`));
  return client;
}

let scraperQueue;
let processingQueue;
let useRedis = false; // Tracks if Redis is being used or fallback to mock
let processorsReady = false; // Flag to indicate if processors are setup

// Function to test Redis connection before setting up Bull queues
async function connectToRedis() {
  return new Promise((resolve) => {
    queueLogger.info('Attempting initial Redis connection test...');
    const testClient = new Redis({
      ...redisOptions, // Base options
      maxRetriesPerRequest: 1,   // Only try once or twice for the initial check
      enableReadyCheck: true,    // Make sure it's truly ready for the check
      connectTimeout: 3000       // Shorter timeout for this initial check
    });

    testClient.on('ready', () => {
      queueLogger.info('Initial Redis connection test successful.');
      testClient.quit();
      resolve(true);
    });

    testClient.on('error', (err) => {
      queueLogger.error(`Initial Redis connection test failed: ${err.message}. Check Redis server.`, { error: err });
      testClient.quit();
      resolve(false);
    });
  });
}

// Mock Bull Queue Implementation (simplified)
class MockBullQueue {
  constructor(name, opts, ...processors) {
    this.name = name;
    this.opts = opts || {};
    this.jobs = [];
    this.jobIdCounter = 0;
    this.eventHandlers = {};
    this.processors = {}; // Store processors by job type (name)

    // Simplified processor registration for mock
    if (name === 'scraper queue' && processors.length > 0 && typeof processors[0] === 'function') {
        this.processors['scrape'] = processors[0];
        queueLogger.info(`Mock queue: Setup processor for ${name} with job type 'scrape' and concurrency ${this.opts.concurrency || 1}`);
    } else if (name === 'processing queue' && processors.length > 0) {
        const jobTypes = ['format', 'findleads', 'generate_queries'];
        processors.slice(0, jobTypes.length).forEach((proc, index) => {
            if (typeof proc === 'function') {
                this.processors[jobTypes[index]] = proc;
                queueLogger.info(`Mock queue: Setup processor for ${name} with job type '${jobTypes[index]}' and concurrency ${this.opts.concurrency || 5}`);
            }
        });
    }
     queueLogger.info(`Mock queue created: ${name}`);
  }

  async add(jobTypeOrData, dataOrOptions, options) {
    let jobType = typeof jobTypeOrData === 'string' ? jobTypeOrData : (this.name === 'scraper queue' ? 'scrape' : 'format');
    let jobData = typeof jobTypeOrData === 'string' ? dataOrOptions : jobTypeOrData;
    let jobOptions = options || (typeof dataOrOptions === 'object' && !Array.isArray(dataOrOptions) ? dataOrOptions : {});
    
    if (typeof jobTypeOrData === 'object' && dataOrOptions === undefined) { // Bull's add(data, opts) signature
      jobData = jobTypeOrData;
      jobOptions = dataOrOptions || {};
      jobType = this.name === 'scraper queue' ? 'scrape' : 'format'; // Default job type for this signature
    }


    this.jobIdCounter++;
    const job = {
      id: this.jobIdCounter.toString(),
      data: jobData,
      name: jobType, // Bull specific: name of the job for named processors
      opts: jobOptions,
      timestamp: new Date(),
      progress: 0,
      updateProgress: async (progress) => { 
        job.progress = progress; 
        this.emit('progress', job, progress);
        queueLogger.info(`Mock job ${job.id} progress: ${progress}%`);
      },
      log: (message) => {
        queueLogger.info(`Mock job ${job.id} log: ${message}`);
      },
      remove: async () => {
        this.jobs = this.jobs.filter(j => j.id !== job.id);
        this.emit('removed', job);
        queueLogger.info(`Mock job ${job.id} removed.`);
      }
    };
    this.jobs.push(job);
    queueLogger.info(`Mock queue ${this.name}: Added job ${job.id} of type '${jobType}' with data:`, { data: jobData });
    this.emit('waiting', job.id);

    if (this.processors[jobType]) {
      queueLogger.info(`Mock queue ${this.name}: Found processor for ${jobType}, processing job ${job.id} immediately.`);
      this.emit('active', job);
      try {
        const result = await this.processors[jobType](job);
        this.emit('completed', job, result);
        queueLogger.info(`Mock queue ${this.name}: Job ${job.id} (${jobType}) completed.`, { result });
      } catch (error) {
        this.emit('failed', job, error);
        queueLogger.error(`Mock queue ${this.name}: Job ${job.id} (${jobType}) failed.`, { error: error.message });
      }
    } else {
      queueLogger.warn(`Mock queue ${this.name}: No processor registered for job type '${jobType}'. Job ${job.id} will remain in queue.`);
    }
    return job;
  }

  process(jobType, concurrency, processorFn) {
    if (typeof jobType === 'function') {
      processorFn = jobType;
      concurrency = typeof concurrency === 'number' ? concurrency : 1;
      jobType = this.name === 'scraper queue' ? 'scrape' : (this.name === 'processing queue' ? 'format' : 'default');
    }
    
    if (typeof processorFn !== 'function') {
      queueLogger.error(`Mock queue ${this.name}: Processor for ${jobType} is not a function.`);
      return;
    }
    this.processors[jobType] = processorFn;
    queueLogger.info(`Mock queue ${this.name}: Registered processor for job type '${jobType}' with concurrency ${concurrency}.`);
  }

  on(event, callback) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
  }

  emit(event, ...args) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(...args));
    }
  }

  async getJobCounts() {
    const counts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    // Simplified: just count all jobs as waiting for mock
    counts.waiting = this.jobs.length;
    return counts;
  }

  async empty() {
    this.jobs = [];
    queueLogger.info(`Mock queue ${this.name} emptied.`);
  }

  async close() {
    queueLogger.info(`Mock queue ${this.name} closed.`);
  }
}


function setupMockQueues() {
  queueLogger.info('Setting up MOCK queues...');
  // Pass the actual processor functions to the mock queue constructor
  scraperQueue = new MockBullQueue('scraper queue', { concurrency: SCRAPER_CONCURRENCY }, scraperProcessor);
  processingQueue = new MockBullQueue('processing queue', { concurrency: PROCESSING_CONCURRENCY }, 
    processingProcessor.processFormatJob, 
    processingProcessor.processFindLeadsJob, 
    processingProcessor.processGenerateQueriesJob
  );
  useRedis = false;

  // Setup processors and event listeners for these mock queues
  setupQueueEventListeners(scraperQueue);
  setupQueueEventListeners(processingQueue);
  setupScraperProcessor(scraperQueue); // This will use the .process method of MockBullQueue
  setupProcessingProcessors(processingQueue); // This will use the .process method of MockBullQueue
  
  queueLogger.info('Mock queues setup completed.');
  processorsReady = true; // Mock processors are also "ready"
}

async function setupQueues() {
  const redisIsActuallyConnected = await connectToRedis();

  if (redisIsActuallyConnected) {
    queueLogger.info('Attempting to set up queues using Redis...');
    try {
      scraperQueue = new Bull('scraper queue', { // Note: Name for Bull Queue
        createClient, // Use the new createClient function
        // redis: redisOptions, // Bull's createClient will use redisOptions internally
        defaultJobOptions: {
          removeOnComplete: 1000, // Keep last 1000 completed jobs
          removeOnFail: 5000,   // Keep last 5000 failed jobs
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000, // 10 seconds
          },
        },
        settings: {
          lockDuration: 1800000, // 30 minutes — Docker scraper can take 15-20 min for large query sets
          stalledInterval: 60000, // Check for stalled jobs every 60s (default is 30s)
          maxStalledCount: 0,    // Never mark as stalled — the job is just slow, not dead
        }
      });
      queueLogger.info('✅ Scraper queue created successfully using Bull and Redis.');

      processingQueue = new Bull('processing queue', { // Note: Name for Bull Queue
        createClient,
        // redis: redisOptions,
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5 seconds
          },
        },
         settings: {
          lockDuration: 300000, // 5 minutes for processing
          maxStalledCount: 1,
        }
      });
      queueLogger.info('✅ Processing queue created successfully using Bull and Redis.');

      await Promise.all([scraperQueue.isReady(), processingQueue.isReady()]);
      queueLogger.info('✅ Both Bull queues are ready and connected to Redis.');

      setupQueueEventListeners(scraperQueue);
      setupQueueEventListeners(processingQueue);
      await setupScraperProcessor(scraperQueue);
      await setupProcessingProcessors(processingQueue);
      
      queueLogger.info('Queues setup completed (using Redis). All processors configured.');
      useRedis = true; // Confirm Redis is being used
      processorsReady = true; // Processors are setup with Redis-backed queues

    } catch (error) {
      queueLogger.error('Error setting up Bull queues with Redis, falling back to mock queues:', { message: error.message, stack: error.stack });
      if (scraperQueue) await scraperQueue.close().catch(e => queueLogger.error('Error closing scraper queue during fallback', e));
      if (processingQueue) await processingQueue.close().catch(e => queueLogger.error('Error closing processing queue during fallback', e));
      setupMockQueues(); // Fallback to mock queues
    }
  } else {
    queueLogger.warn('Redis not available (initial test failed), setting up mock queues.');
    setupMockQueues();
  }
}


function setupQueueEventListeners(queue) {
  if (!queue || typeof queue.on !== 'function') {
    queueLogger.error(`Cannot set up event listeners: queue is invalid or does not have an 'on' method. Queue: ${queue ? queue.name : 'undefined'}`);
    return;
  }
  queueLogger.info(`👂 Setting up event listeners for ${queue.name}...`);

  queue.on('error', (error) => {
    queueLogger.error(`Queue Error in ${queue.name}:`, { message: error.message, stack: error.stack, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('waiting', (jobId) => {
    queueLogger.info(`Job ${jobId} is waiting in ${queue.name}`, { jobId, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('active', (job, jobPromise) => {
    queueLogger.info(`Job ${job.id} has started in ${queue.name}`, { jobId: job.id, data: job.data, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('completed', (job, result) => {
    queueLogger.info(`Job ${job.id} in ${queue.name} completed successfully.`, { jobId: job.id, result, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('failed', (job, err) => {
    queueLogger.error(`Job ${job.id} in ${queue.name} failed.`, { jobId: job.id, error: err.message, stack: err.stack, data: job.data, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('progress', (job, progress) => {
    queueLogger.info(`Job ${job.id} in ${queue.name} progress: ${progress}%`, { jobId: job.id, progress, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('stalled', (job) => {
    queueLogger.warn(`Job ${job.id} in ${queue.name} has stalled.`, { jobId: job.id, data: job.data, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
   queue.on('cleaned', function (jobs, type) {
    queueLogger.info(`Cleaned ${jobs.length} ${type} jobs from ${queue.name}`, { count: jobs.length, type, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('drained', function () {
    queueLogger.info(`Queue ${queue.name} is drained (no more waiting jobs).`, { queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
   queue.on('paused', function () {
    queueLogger.info(`Queue ${queue.name} is paused.`, { queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
  queue.on('resumed', function (job /* could be undefined */) {
    queueLogger.info(`Queue ${queue.name} is resumed. Job: ${job ? job.id : 'N/A'}`, { queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
   queue.on('removed', function (job) {
    queueLogger.info(`Job ${job.id} was removed from ${queue.name}.`, { jobId: job.id, queue: queue.name, component: 'queue', label: 'QUEUE_EVENT' });
  });
}

async function setupScraperProcessor(queue) {
  if (!queue || typeof queue.process !== 'function') {
    queueLogger.error('Cannot setup scraper processor: Scraper queue is not valid or process function missing.');
    return;
  }
  queueLogger.info(`🔧 Setting up scraper processor for queue: ${queue.name}...`);
  try {
    // scraperProcessor is already imported
    if (typeof scraperProcessor !== 'function') {
      queueLogger.error(`❌ Failed to load scraper processor or it's not a function. Type: ${typeof scraperProcessor}`);
      throw new Error('Scraper processor is not a function.');
    }
    queueLogger.info(`✅ Scraper processor loaded successfully: type ${typeof scraperProcessor}`);

    const jobType = 'scrape'; // Consistent job type

    const wrappedProcessor = async (job) => {
      const { clientName, jobId: jobUUID, queries } = job.data; // job.id is Bull's internal ID, jobUUID is our ID
      const queriesCount = queries ? queries.length : 'N/A';
      const logMeta = { jobId: job.id, jobUUID, clientName, queriesCount, component: 'scraper', label: 'SCRAPER_PROCESSOR' };
      
      queueLogger.info(`🎯 SCRAPER PROCESSOR STARTING for job in ${queue.name}`, logMeta);
      
      try {
        const result = await scraperProcessor(job); // Actual call to the processor
        queueLogger.info(`✅ SCRAPER PROCESSOR COMPLETED for job in ${queue.name}`, { ...logMeta, result });
        return result;
      } catch (error) {
        queueLogger.error(`❌ SCRAPER PROCESSOR FAILED for job in ${queue.name}`, { ...logMeta, errorMessage: error.message, stack: error.stack, jobData: job.data });
        if (jobUUID && db && typeof db.runQuery === 'function') {
            try {
                await db.runQuery('UPDATE scraping_jobs SET status = ?, finished_at = ?, error_message = ? WHERE job_id = ?', ['failed', new Date().toISOString(), error.message.substring(0, 255), jobUUID]);
            } catch (dbError) {
                queueLogger.error(`Failed to update job ${jobUUID} status to failed in DB for ${queue.name}`, { dbErrorMessage: dbError.message });
            }
        }
        throw error; 
      }
    };
    
    queue.process(jobType, SCRAPER_CONCURRENCY, wrappedProcessor);
    queueLogger.info(`✅ Scraper processor attached to ${queue.name} for job type '${jobType}' with concurrency ${SCRAPER_CONCURRENCY}.`);
    // processorsReady flag handled in setupQueues after all processors are setup

  } catch (error) {
    queueLogger.error(`❌ Error setting up scraper processor for ${queue.name}:`, { message: error.message, stack: error.stack });
    // No specific fallback here, setupQueues handles overall fallback to mock.
  }
}

async function setupProcessingProcessors(queue) {
  if (!queue || typeof queue.process !== 'function') {
    queueLogger.error('Cannot setup processing processors: Processing queue is not valid or process function missing.');
    return;
  }
  queueLogger.info(`🔧 Setting up processing processors for queue: ${queue.name}...`);
  try {
    // processingProcessor is already imported
    if (!processingProcessor || typeof processingProcessor.processFormatJob !== 'function' || 
        typeof processingProcessor.processFindLeadsJob !== 'function' || 
        typeof processingProcessor.processGenerateQueriesJob !== 'function') {
      queueLogger.error('❌ Failed to load processing processor or its methods are not functions.');
      throw new Error('Processing processor or its methods are not functions.');
    }
    queueLogger.info(`✅ Processing processor module loaded successfully with required methods for ${queue.name}.`);

    const wrapProcessorMethod = (methodName, methodFunction) => async (job) => {
      const logMeta = { jobId: job.id, jobType: methodName, component: 'processor', label: 'PROCESSING_PROCESSOR', queueName: queue.name };
      queueLogger.info(`🎯 PROCESSING (${methodName}) STARTING for job in ${queue.name}`, { ...logMeta, jobData: job.data });
      try {
        const result = await methodFunction(job);
        queueLogger.info(`✅ PROCESSING (${methodName}) COMPLETED for job in ${queue.name}`, { ...logMeta, result });
        return result;
      } catch (error) {
        queueLogger.error(`❌ PROCESSING (${methodName}) FAILED for job in ${queue.name}`, { ...logMeta, errorMessage: error.message, stack: error.stack, jobData: job.data });
        // Add DB update for failed processing jobs if necessary
        throw error;
      }
    };

    queue.process('format', PROCESSING_CONCURRENCY, wrapProcessorMethod('format', processingProcessor.processFormatJob));
    queue.process('findleads', PROCESSING_CONCURRENCY, wrapProcessorMethod('findleads', processingProcessor.processFindLeadsJob));
    queue.process('generate_queries', PROCESSING_CONCURRENCY, wrapProcessorMethod('generate_queries', processingProcessor.processGenerateQueriesJob));
    
    queueLogger.info(`✅ Processing queue processors attached to ${queue.name} with concurrency: ${PROCESSING_CONCURRENCY}`);
  } catch (error) {
    queueLogger.error(`❌ Error setting up processing processors for ${queue.name}:`, { message: error.message, stack: error.stack });
  }
}

function addScrapingJob(data) {
  if (!scraperQueue) {
    queueLogger.error('Scraper queue is not initialized. Cannot add job.');
    throw new Error('Scraper queue not available');
  }
  if (!processorsReady && useRedis) { // Only hold back if using Redis and processors aren't ready
     queueLogger.warn('Scraper processors not ready yet (Redis mode), job will be queued but may not process immediately.');
     // Allow job to be added, Bull will pick it up once processor is live.
  }
  const jobName = 'scrape'; // Named job type
  queueLogger.info(`Adding scraping job to ${scraperQueue.name}:`, { data, jobName });
  return scraperQueue.add(jobName, data); // Pass job name for named processor
}

function addProcessingJob(jobType, data) {
  if (!processingQueue) {
    queueLogger.error('Processing queue is not initialized. Cannot add job.');
    throw new Error('Processing queue not available');
  }
   if (!processorsReady && useRedis) {
     queueLogger.warn('Processing processors not ready yet (Redis mode), job will be queued but may not process immediately.');
   }
  queueLogger.info(`Adding processing job of type '${jobType}' to ${processingQueue.name}:`, { data });
  return processingQueue.add(jobType, data); // Pass job type for named processor
}

function getScraperQueue() {
  if (!scraperQueue) {
     queueLogger.warn('Scraper queue accessed before full setup or after a failure. This might be a mock queue or null.');
  }
  return scraperQueue;
}

function getProcessingQueue() {
  if (!processingQueue) {
    queueLogger.warn('Processing queue accessed before full setup or after a failure. This might be a mock queue or null.');
  }
  return processingQueue;
}

function areProcessorsReady() {
    return processorsReady;
}

async function getQueueStats() {
  try {
    if (!scraperQueue || !processingQueue) {
      queueLogger.warn('Queue stats requested but queues not initialized, returning mock stats');
      return {
        scraper: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0
        },
        processing: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0
        }
      };
    }

    // Get queue job counts
    const scraperCounts = await scraperQueue.getJobCounts();
    const processingCounts = await processingQueue.getJobCounts();

    return {
      scraper: {
        waiting: scraperCounts.waiting || 0,
        active: scraperCounts.active || 0,
        completed: scraperCounts.completed || 0,
        failed: scraperCounts.failed || 0,
        delayed: scraperCounts.delayed || 0,
        paused: scraperCounts.paused || 0
      },
      processing: {
        waiting: processingCounts.waiting || 0,
        active: processingCounts.active || 0,
        completed: processingCounts.completed || 0,
        failed: processingCounts.failed || 0,
        delayed: processingCounts.delayed || 0,
        paused: processingCounts.paused || 0
      }
    };
  } catch (error) {
    queueLogger.error('Error getting queue stats:', { message: error.message, stack: error.stack });
    // Return default stats on error
    return {
      scraper: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0
      },
      processing: {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0
      }
    };
  }
}

async function gracefulShutdown() {
  queueLogger.info('Attempting graceful shutdown of queues...');
  try {
    const closers = [];
    if (scraperQueue) closers.push(scraperQueue.close());
    if (processingQueue) closers.push(processingQueue.close());
    
    // Close the primary Bull client if it was created and is active
    if (regularBullClient && regularBullClient.status === 'ready') {
      closers.push(regularBullClient.quit()); // Use quit for graceful disconnect
    }
    
    await Promise.all(closers);
    queueLogger.info('All queues and Redis connections closed gracefully.');
  } catch (error) {
    queueLogger.error('Error during graceful shutdown of queues:', { message: error.message, stack: error.stack });
  }
}

module.exports = {
  setupQueues,
  addScrapingJob,
  addProcessingJob,
  getScraperQueue,
  getProcessingQueue,
  getQueueStats,
  gracefulShutdown,
  areProcessorsReady,
  connectToRedis // Exporting for potential external checks if ever needed
}; 