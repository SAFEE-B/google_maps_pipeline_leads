const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { addProcessingJob } = require('../queues/setup');
const { runQuery, getAll, getOne } = require('../database/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const formatJobSchema = Joi.object({
  inputFile: Joi.string().required(),
  outputFile: Joi.string().optional(),
  clientName: Joi.string().optional()
});

const findleadsJobSchema = Joi.object({
  businessTypes: Joi.array().items(Joi.string()).min(1).required(),
  zipCodes: Joi.array().items(Joi.string()).min(1).required(),
  states: Joi.array().items(Joi.string()).optional(),
  outputFile: Joi.string().optional(),
  clientName: Joi.string().optional()
});

// Start formatting job
router.post('/format', async (req, res) => {
  try {
    const { error, value } = formatJobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { inputFile, outputFile, clientName } = value;
    const jobId = uuidv4();

    // Generate output file name if not provided
    const finalOutputFile = outputFile || 
      `./Files/${clientName || 'formatted'}_${Date.now()}.xlsx`;

    // Add job to queue
    const job = await addProcessingJob('format', {
      jobId,
      inputFile,
      outputFile: finalOutputFile,
      clientName
    });

    logger.info(`Started format job ${jobId}`, { inputFile, outputFile: finalOutputFile });

    res.status(201).json({
      success: true,
      jobId,
      queueJobId: job.id,
      inputFile,
      outputFile: finalOutputFile,
      message: 'Format job started successfully'
    });

  } catch (error) {
    logger.error('Error starting format job:', error);
    res.status(500).json({ 
      error: 'Failed to start format job',
      message: error.message
    });
  }
});

// Start findleads job
router.post('/findleads', async (req, res) => {
  try {
    const { error, value } = findleadsJobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { businessTypes, zipCodes, states, outputFile, clientName } = value;
    const jobId = uuidv4();

    // Generate output file name if not provided
    const finalOutputFile = outputFile || 
      `./Outputs/${clientName || 'findleads'}_${Date.now()}.xlsx`;

    // Add job to queue
    const job = await addProcessingJob('findleads', {
      jobId,
      businessTypes,
      zipCodes,
      states,
      outputFile: finalOutputFile,
      clientName
    });

    logger.info(`Started findleads job ${jobId}`, { 
      businessTypes, 
      zipCodes: zipCodes.length,
      outputFile: finalOutputFile 
    });

    res.status(201).json({
      success: true,
      jobId,
      queueJobId: job.id,
      businessTypes,
      zipCodes: zipCodes.length,
      outputFile: finalOutputFile,
      message: 'Findleads job started successfully'
    });

  } catch (error) {
    logger.error('Error starting findleads job:', error);
    res.status(500).json({ 
      error: 'Failed to start findleads job',
      message: error.message
    });
  }
});

// Start query generation job
router.post('/generate-queries', async (req, res) => {
  try {
    const { businessTypes, zipCodes, states, outputFile } = req.body;
    
    if (!businessTypes || !Array.isArray(businessTypes) || businessTypes.length === 0) {
      return res.status(400).json({ error: 'businessTypes array is required' });
    }
    
    if (!zipCodes || !Array.isArray(zipCodes) || zipCodes.length === 0) {
      return res.status(400).json({ error: 'zipCodes array is required' });
    }

    const jobId = uuidv4();
    const finalOutputFile = outputFile || `./Outputs/queries_${Date.now()}.txt`;

    // Add job to queue
    const job = await addProcessingJob('generate_queries', {
      jobId,
      businessTypes,
      zipCodes,
      states,
      outputFile: finalOutputFile
    });

    logger.info(`Started query generation job ${jobId}`, { 
      businessTypes, 
      zipCodes: zipCodes.length 
    });

    res.status(201).json({
      success: true,
      jobId,
      queueJobId: job.id,
      outputFile: finalOutputFile,
      message: 'Query generation job started successfully'
    });

  } catch (error) {
    logger.error('Error starting query generation job:', error);
    res.status(500).json({ 
      error: 'Failed to start query generation job',
      message: error.message
    });
  }
});

// Get processing job status
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Get job from database
    const job = await getOne(
      'SELECT * FROM processing_jobs WHERE job_id = ?',
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Parse results if available
    if (job.results) {
      try {
        job.results = JSON.parse(job.results);
      } catch (e) {
        // Keep as string if parsing fails
      }
    }

    res.json({
      success: true,
      job
    });

  } catch (error) {
    logger.error('Error getting processing job status:', error);
    res.status(500).json({ 
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

// Get all processing jobs
router.get('/jobs', async (req, res) => {
  try {
    const { type, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM processing_jobs WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const jobs = await getAll(query, params);

    // Parse results for each job
    const processedJobs = jobs.map(job => {
      if (job.results) {
        try {
          job.results = JSON.parse(job.results);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }
      return job;
    });

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
    logger.error('Error getting processing jobs:', error);
    res.status(500).json({ 
      error: 'Failed to get processing jobs',
      message: error.message
    });
  }
});

// Cancel processing job
router.delete('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Get job from database
    const job = await getOne(
      'SELECT * FROM processing_jobs WHERE job_id = ?',
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

    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
      ['cancelled', jobId]
    );

    logger.info(`Cancelled processing job ${jobId}`);

    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });

  } catch (error) {
    logger.error('Error cancelling processing job:', error);
    res.status(500).json({ 
      error: 'Failed to cancel job',
      message: error.message
    });
  }
});

// Get processing statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await getAll(`
      SELECT 
        type,
        status,
        COUNT(*) as count,
        AVG(CASE 
          WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 
          ELSE NULL 
        END) as avg_duration_minutes
      FROM processing_jobs 
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY type, status
      ORDER BY type, status
    `);

    const recentJobs = await getAll(`
      SELECT type, COUNT(*) as count
      FROM processing_jobs 
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY type
    `);

    res.json({
      success: true,
      stats: {
        byTypeAndStatus: stats,
        recentActivity: recentJobs
      }
    });

  } catch (error) {
    logger.error('Error getting processing statistics:', error);
    res.status(500).json({ 
      error: 'Failed to get processing statistics',
      message: error.message
    });
  }
});

module.exports = router; 