const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { addScrapingJob, getQueueStats, getJobById, removeJob } = require('../queues/setup');
const { runQuery, getAll, getOne } = require('../database/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const startScrapingSchema = Joi.object({
  clientName: Joi.string().required(),
  businessTypes: Joi.array().items(Joi.string()).min(1).required(),
  zipCodes: Joi.array().items(Joi.string()).min(1).required(),
  states: Joi.array().items(Joi.string()).optional(),
  priority: Joi.number().integer().min(0).max(10).default(0)
});

const queryGenerationSchema = Joi.object({
  businessTypes: Joi.array().items(Joi.string()).min(1).required(),
  locations: Joi.array().items(Joi.string()).min(1).required()
});

// Start scraping job
router.post('/start', async (req, res) => {
  try {
    const { error, value } = startScrapingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { clientName, businessTypes, zipCodes, states, priority } = value;
    const jobId = uuidv4();

    // Generate search queries
    const queries = generateSearchQueries(businessTypes, zipCodes);
    
    // Create scraping job record in database
    await runQuery(
      'INSERT INTO scraping_jobs (job_id, client_name, business_types, zip_codes, states, queries_generated, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        jobId,
        clientName,
        JSON.stringify(businessTypes),
        JSON.stringify(zipCodes),
        JSON.stringify(states || []),
        queries.length,
        'waiting'
      ]
    );

    // Add job to queue
    const job = await addScrapingJob({
      jobId,
      clientName,
      businessTypes,
      zipCodes,
      states,
      queries
    }, { priority });

    logger.info(`Started scraping job ${jobId} for client ${clientName}`, {
      businessTypes,
      zipCodes: zipCodes.length,
      queriesGenerated: queries.length
    });

    res.status(201).json({
      success: true,
      jobId,
      queueJobId: job.id,
      queriesGenerated: queries.length,
      message: 'Scraping job started successfully'
    });

  } catch (error) {
    logger.error('Error starting scraping job:', error);
    res.status(500).json({ 
      error: 'Failed to start scraping job',
      message: error.message
    });
  }
});

// Generate search queries without starting scraping
router.post('/generate-queries', async (req, res) => {
  try {
    const { error, value } = queryGenerationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { businessTypes, locations } = value;
    const queries = generateSearchQueries(businessTypes, locations);

    res.json({
      success: true,
      queries,
      count: queries.length
    });

  } catch (error) {
    logger.error('Error generating queries:', error);
    res.status(500).json({ 
      error: 'Failed to generate queries',
      message: error.message
    });
  }
});

// Get scraping job status
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Get job from database
    const job = await getOne(
      'SELECT * FROM scraping_jobs WHERE job_id = ?',
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Parse JSON fields
    job.business_types = JSON.parse(job.business_types || '[]');
    job.zip_codes = JSON.parse(job.zip_codes || '[]');
    job.states = JSON.parse(job.states || '[]');

    res.json({
      success: true,
      job
    });

  } catch (error) {
    logger.error('Error getting job status:', error);
    res.status(500).json({ 
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

// Get all scraping jobs
router.get('/jobs', async (req, res) => {
  try {
    const { status, clientName, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM scraping_jobs';
    const params = [];
    let conditions = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    } else {
      // If no specific status is requested, default to queued and processing jobs
      conditions.push("(status = 'pending' OR status = 'waiting' OR status = 'active' OR status = 'processing')");
    }

    if (clientName) {
      conditions.push('client_name LIKE ?');
      params.push(`%${clientName}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const jobs = await getAll(query, params);

    // Parse JSON fields for each job
    const processedJobs = jobs.map(job => ({
      ...job,
      business_types: JSON.parse(job.business_types || '[]'),
      zip_codes: JSON.parse(job.zip_codes || '[]'),
      states: JSON.parse(job.states || '[]')
    }));

    res.json({
      success: true,
      jobs: processedJobs,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: processedJobs.length
      }
    });

  } catch (error) {
    logger.error('Error getting scraping jobs:', error);
    res.status(500).json({ 
      error: 'Failed to get scraping jobs',
      message: error.message
    });
  }
});

// Cancel scraping job
router.delete('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Get job from database
    const job = await getOne(
      'SELECT * FROM scraping_jobs WHERE job_id = ?',
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'processing') {
      return res.status(400).json({ 
        error: 'Cannot cancel job that is currently processing' 
      });
    }

    // Remove from queue if still pending
    if (job.status === 'pending') {
      // Note: This would require finding the Bull job ID, which we'd need to store
      // For now, we'll just update the database status
    }

    // Update job status
    await runQuery(
      'UPDATE scraping_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
      ['cancelled', jobId]
    );

    logger.info(`Cancelled scraping job ${jobId}`);

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    logger.error('Error cancelling job:', error);
    res.status(500).json({ 
      error: 'Failed to cancel job',
      message: error.message
    });
  }
});

// Get queue statistics
router.get('/queue/stats', async (req, res) => {
  try {
    const stats = await getQueueStats();
    
    res.json({
      success: true,
      stats
    });

  } catch (error) {
    logger.error('Error getting queue stats:', error);
    res.status(500).json({ 
      error: 'Failed to get queue stats',
      message: error.message
    });
  }
});

// Helper function to generate search queries
function generateSearchQueries(businessTypes, locations) {
  const queries = [];

  businessTypes.forEach(businessType => {
    locations.forEach(location => {
      // Clean and format the location for search
      const cleanLocation = location.trim();
      
      // Generate different query formats
      const queryFormats = [
        `${businessType} near ${cleanLocation}`,
        `${businessType} in ${cleanLocation}`,
        `${businessType} ${cleanLocation}`
      ];

      // Use the first format for consistency with existing system
      queries.push({
        businessType,
        location: cleanLocation,
        query: queryFormats[0]
      });
    });
  });

  return queries;
}

module.exports = router; 