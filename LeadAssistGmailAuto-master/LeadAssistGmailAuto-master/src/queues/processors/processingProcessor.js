const formatProcessor = require('./formatProcessor');
const findleadsProcessor = require('./findleadsProcessor');
const queryGeneratorProcessor = require('./queryGeneratorProcessor');
const logger = require('../../utils/logger');

// Combined processing processor that handles different job types
const processingProcessor = {
  // Format processor
  processFormatJob: async (job) => {
    logger.info(`Processing format job ${job.id}`, { jobId: job.id, data: job.data });
    return await formatProcessor(job);
  },

  // Find leads processor  
  processFindLeadsJob: async (job) => {
    logger.info(`Processing findleads job ${job.id}`, { jobId: job.id, data: job.data });
    return await findleadsProcessor(job);
  },

  // Query generator processor
  processGenerateQueriesJob: async (job) => {
    logger.info(`Processing generate_queries job ${job.id}`, { jobId: job.id, data: job.data });
    return await queryGeneratorProcessor(job);
  }
};

module.exports = processingProcessor; 