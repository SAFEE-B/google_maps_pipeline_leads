const express = require('express');
const { getQueueStats } = require('../queues/setup');
const { getAll, getOne } = require('../database/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Get overall system status
router.get('/', async (req, res) => {
  try {
    const queueStats = await getQueueStats();
    
    // Get recent job statistics
    const recentJobs = await getAll(`
      SELECT 
        status,
        COUNT(*) as count
      FROM scraping_jobs 
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY status
    `);

    const recentProcessingJobs = await getAll(`
      SELECT 
        type,
        status,
        COUNT(*) as count
      FROM processing_jobs 
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY type, status
    `);

    // System health indicators
    const systemHealth = {
      database: 'healthy',
      queues: 'healthy',
      overallStatus: 'healthy'
    };

    // Check if any queues are backed up
    if (queueStats.scraper.waiting > 10 || queueStats.processing.waiting > 20) {
      systemHealth.queues = 'warning';
      systemHealth.overallStatus = 'warning';
    }

    if (queueStats.scraper.failed > 5 || queueStats.processing.failed > 10) {
      systemHealth.queues = 'error';
      systemHealth.overallStatus = 'error';
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      systemHealth,
      queueStats,
      recentActivity: {
        scrapingJobs: recentJobs,
        processingJobs: recentProcessingJobs
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    });

  } catch (error) {
    logger.error('Error getting system status:', error);
    res.status(500).json({ 
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

// Get detailed queue information
router.get('/queues', async (req, res) => {
  try {
    const stats = await getQueueStats();
    
    // Get recent failed jobs for debugging
    const recentFailedScraping = await getAll(`
      SELECT job_id, client_name, error_message, created_at
      FROM scraping_jobs 
      WHERE status = 'failed' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    const recentFailedProcessing = await getAll(`
      SELECT job_id, type, error_message, created_at
      FROM processing_jobs 
      WHERE status = 'failed' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    res.json({
      success: true,
      queueStats: stats,
      recentFailures: {
        scraping: recentFailedScraping,
        processing: recentFailedProcessing
      }
    });

  } catch (error) {
    logger.error('Error getting queue status:', error);
    res.status(500).json({ 
      error: 'Failed to get queue status',
      message: error.message
    });
  }
});

// Get system metrics for monitoring
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      database: {
        totalLeads: await getOne('SELECT COUNT(*) as count FROM leads'),
        totalScrapingJobs: await getOne('SELECT COUNT(*) as count FROM scraping_jobs'),
        totalProcessingJobs: await getOne('SELECT COUNT(*) as count FROM processing_jobs'),
        recentActivity: await getOne(`
          SELECT COUNT(*) as count 
          FROM scraping_jobs 
          WHERE created_at >= datetime('now', '-1 hour')
        `)
      },
      queues: await getQueueStats()
    };

    res.json({
      success: true,
      metrics
    });

  } catch (error) {
    logger.error('Error getting system metrics:', error);
    res.status(500).json({ 
      error: 'Failed to get system metrics',
      message: error.message
    });
  }
});

// Get job performance statistics
router.get('/performance', async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    let timeCondition;
    switch (timeframe) {
      case '1h':
        timeCondition = "datetime('now', '-1 hour')";
        break;
      case '24h':
        timeCondition = "datetime('now', '-24 hours')";
        break;
      case '7d':
        timeCondition = "datetime('now', '-7 days')";
        break;
      case '30d':
        timeCondition = "datetime('now', '-30 days')";
        break;
      default:
        timeCondition = "datetime('now', '-24 hours')";
    }

    // Scraping job performance
    const scrapingPerformance = await getAll(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
        AVG(leads_found) as avg_leads_found,
        AVG(CASE 
          WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 
          ELSE NULL 
        END) as avg_duration_minutes
      FROM scraping_jobs 
      WHERE created_at >= ${timeCondition}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Processing job performance
    const processingPerformance = await getAll(`
      SELECT 
        type,
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
        AVG(CASE 
          WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60 
          ELSE NULL 
        END) as avg_duration_minutes
      FROM processing_jobs 
      WHERE created_at >= ${timeCondition}
      GROUP BY type
    `);

    res.json({
      success: true,
      timeframe,
      performance: {
        scraping: scrapingPerformance,
        processing: processingPerformance
      }
    });

  } catch (error) {
    logger.error('Error getting performance statistics:', error);
    res.status(500).json({ 
      error: 'Failed to get performance statistics',
      message: error.message
    });
  }
});

// Health check endpoint (minimal response for load balancers)
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

module.exports = router; 