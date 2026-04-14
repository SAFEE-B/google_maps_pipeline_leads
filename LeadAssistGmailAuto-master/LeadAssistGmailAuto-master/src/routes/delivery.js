const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { getAll, getOne, runQuery } = require('../database/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Get all deliveries (completed files)
router.get('/', async (req, res) => {
  try {
    const { status = 'all', clientName, limit = 50, offset = 0 } = req.query;

    // Get completed scraping jobs with their output files
    let scrapingQuery = `
      SELECT 
        sj.job_id,
        sj.client_name,
        sj.business_types,
        sj.zip_codes,
        sj.leads_found,
        sj.completed_at as job_completed_at,
        pj.output_file,
        pj.completed_at as file_completed_at,
        'scraping' as job_type
      FROM scraping_jobs sj
      LEFT JOIN processing_jobs pj ON pj.job_id LIKE '%' || sj.job_id || '%'
      WHERE sj.status = 'completed'
    `;
    
    const scrapingParams = [];

    if (clientName) {
      scrapingQuery += ' AND sj.client_name LIKE ?';
      scrapingParams.push(`%${clientName}%`);
    }

    // Get standalone processing jobs (format/findleads)
    let processingQuery = `
      SELECT 
        job_id,
        'Processing' as client_name,
        '' as business_types,
        '' as zip_codes,
        0 as leads_found,
        completed_at as job_completed_at,
        output_file,
        completed_at as file_completed_at,
        type as job_type
      FROM processing_jobs
      WHERE status = 'completed' AND output_file IS NOT NULL
    `;

    const processingParams = [];

    // Combine queries
    const allDeliveries = [
      ...(await getAll(scrapingQuery, scrapingParams)),
      ...(await getAll(processingQuery, processingParams))
    ];

    // Sort by completion date
    allDeliveries.sort((a, b) => new Date(b.file_completed_at) - new Date(a.file_completed_at));

    // Add file information for each delivery
    const deliveriesWithFileInfo = await Promise.all(
      allDeliveries.slice(offset, offset + limit).map(async (delivery) => {
        const fileInfo = await getFileInfo(delivery.output_file);
        return {
          ...delivery,
          business_types: delivery.business_types ? JSON.parse(delivery.business_types) : [],
          zip_codes: delivery.zip_codes ? JSON.parse(delivery.zip_codes) : [],
          fileInfo
        };
      })
    );

    res.json({
      success: true,
      deliveries: deliveriesWithFileInfo,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: allDeliveries.length,
        totalPages: Math.ceil(allDeliveries.length / limit),
        currentPage: Math.floor(offset / limit) + 1
      }
    });

  } catch (error) {
    logger.error('Error getting deliveries:', error);
    res.status(500).json({ 
      error: 'Failed to get deliveries',
      message: error.message
    });
  }
});

// Get delivery by job ID
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    // Check scraping jobs first
    let delivery = await getOne(`
      SELECT 
        sj.job_id,
        sj.client_name,
        sj.business_types,
        sj.zip_codes,
        sj.leads_found,
        sj.completed_at as job_completed_at,
        sj.status,
        'scraping' as job_type
      FROM scraping_jobs sj
      WHERE sj.job_id = ?
    `, [jobId]);

    if (!delivery) {
      // Check processing jobs
      delivery = await getOne(`
        SELECT 
          job_id,
          'Processing' as client_name,
          '' as business_types,
          '' as zip_codes,
          0 as leads_found,
          completed_at as job_completed_at,
          output_file,
          status,
          type as job_type
        FROM processing_jobs
        WHERE job_id = ?
      `, [jobId]);
    }

    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }

    // Get associated output files
    const outputFiles = await getAll(`
      SELECT output_file, type, completed_at, results
      FROM processing_jobs
      WHERE job_id LIKE ? AND output_file IS NOT NULL
      ORDER BY completed_at DESC
    `, [`%${jobId}%`]);

    // Add file information
    const filesWithInfo = await Promise.all(
      outputFiles.map(async (file) => {
        const fileInfo = await getFileInfo(file.output_file);
        return {
          ...file,
          fileInfo,
          results: file.results ? JSON.parse(file.results) : null
        };
      })
    );

    // Parse JSON fields
    if (delivery.business_types) {
      delivery.business_types = JSON.parse(delivery.business_types);
    }
    if (delivery.zip_codes) {
      delivery.zip_codes = JSON.parse(delivery.zip_codes);
    }

    res.json({
      success: true,
      delivery: {
        ...delivery,
        outputFiles: filesWithInfo
      }
    });

  } catch (error) {
    logger.error('Error getting delivery:', error);
    res.status(500).json({ 
      error: 'Failed to get delivery',
      message: error.message
    });
  }
});

// Download delivery file
router.get('/download/:jobId/:filename', async (req, res) => {
  try {
    const { jobId, filename } = req.params;

    // Security check - ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Verify this file belongs to the specified job
    const fileRecord = await getOne(`
      SELECT output_file, type, completed_at
      FROM processing_jobs
      WHERE (job_id = ? OR job_id LIKE ?) AND output_file LIKE ?
    `, [jobId, `%${jobId}%`, `%${filename}%`]);

    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    const filePath = fileRecord.output_file;

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const stats = await fs.stat(filePath);
    const ext = path.extname(filename).toLowerCase();

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    if (ext === '.xlsx' || ext === '.xls') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else if (ext === '.csv') {
      res.setHeader('Content-Type', 'text/csv');
    } else if (ext === '.txt') {
      res.setHeader('Content-Type', 'text/plain');
    }

    res.setHeader('Content-Length', stats.size);

    // Log download
    logger.info(`Delivery download: ${filename}`, { jobId, size: stats.size });

    // Update download tracking (optional)
    await runQuery(`
      UPDATE processing_jobs 
      SET results = json_set(COALESCE(results, '{}'), '$.downloads', 
        COALESCE(json_extract(results, '$.downloads'), 0) + 1)
      WHERE output_file = ?
    `, [filePath]);

    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    logger.error('Error downloading delivery file:', error);
    res.status(500).json({ 
      error: 'Failed to download file',
      message: error.message
    });
  }
});

// Get delivery statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await getAll(`
      SELECT 
        DATE(completed_at) as date,
        COUNT(*) as deliveries,
        SUM(leads_found) as total_leads
      FROM scraping_jobs 
      WHERE status = 'completed' 
        AND completed_at >= datetime('now', '-30 days')
      GROUP BY DATE(completed_at)
      ORDER BY date DESC
    `);

    const recentDeliveries = await getAll(`
      SELECT 
        client_name,
        COUNT(*) as count,
        SUM(leads_found) as total_leads
      FROM scraping_jobs 
      WHERE status = 'completed' 
        AND completed_at >= datetime('now', '-7 days')
      GROUP BY client_name
      ORDER BY count DESC
    `);

    const processingStats = await getAll(`
      SELECT 
        type,
        COUNT(*) as count
      FROM processing_jobs 
      WHERE status = 'completed' 
        AND completed_at >= datetime('now', '-7 days')
      GROUP BY type
    `);

    res.json({
      success: true,
      stats: {
        dailyDeliveries: stats,
        recentClientActivity: recentDeliveries,
        processingActivity: processingStats
      }
    });

  } catch (error) {
    logger.error('Error getting delivery statistics:', error);
    res.status(500).json({ 
      error: 'Failed to get delivery statistics',
      message: error.message
    });
  }
});

// Mark delivery as ready for client
router.post('/mark-ready/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { notes, clientNotified = false } = req.body;

    // Update delivery status
    await runQuery(`
      UPDATE scraping_jobs 
      SET notes = ?, 
          updated_at = CURRENT_TIMESTAMP
      WHERE job_id = ?
    `, [notes || 'Delivery ready for client', jobId]);

    // Log delivery ready event
    logger.info(`Delivery marked ready: ${jobId}`, { clientNotified, notes });

    res.json({
      success: true,
      message: 'Delivery marked as ready',
      jobId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error marking delivery ready:', error);
    res.status(500).json({ 
      error: 'Failed to mark delivery ready',
      message: error.message
    });
  }
});

// Get recent deliveries for LLM/chatbox
router.get('/recent', async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // First try to get from the new deliveries table (from FileGenerationService)
    let recentDeliveries = [];
    try {
      recentDeliveries = await getAll(`
        SELECT 
          id,
          file_id,
          filename,
          format,
          lead_count,
          filters,
          request_type,
          file_size,
          status,
          created_at,
          downloaded_at,
          file_path
        FROM deliveries 
        WHERE status = 'completed'
        ORDER BY created_at DESC 
        LIMIT ?
      `, [parseInt(limit)]);

      // Format the deliveries for the frontend
      const formattedDeliveries = recentDeliveries.map(delivery => {
        const filters = delivery.filters ? JSON.parse(delivery.filters) : {};
        
        return {
          id: delivery.id,
          fileId: delivery.file_id,
          clientName: filters.clientName || 'Scraper Job', // Extract client name from filters
          businessTypes: filters.businessType ? [filters.businessType] : [], // Extract business type from filters
          zipCodes: filters.location ? [filters.location] : [], // Extract location from filters
          leadsCount: delivery.lead_count,
          completedAt: delivery.created_at,
          format: delivery.format,
          requestType: delivery.request_type,
          jobId: filters.jobId || 'N/A', // Extract job ID from filters
          files: [{
            id: delivery.file_id,
            name: delivery.filename,
            size: delivery.file_size,
            type: delivery.format,
            downloadUrl: `/api/files/download/${delivery.file_id}`
          }],
          downloadedAt: delivery.downloaded_at
        };
      });

      res.json({
        success: true,
        deliveries: formattedDeliveries,
        count: formattedDeliveries.length,
        source: 'new_system'
      });

    } catch (deliveriesTableError) {
      // If deliveries table doesn't exist, fall back to old system
      console.log('Deliveries table not found, using legacy system:', deliveriesTableError.message);
      
      const legacyDeliveries = await getAll(`
        SELECT 
          sj.job_id,
          sj.client_name,
          sj.business_types,
          sj.leads_found,
          sj.completed_at,
          pj.output_file,
          pj.type as processing_type
        FROM scraping_jobs sj
        LEFT JOIN processing_jobs pj ON pj.job_id LIKE '%' || sj.job_id || '%'
        WHERE sj.status = 'completed'
          AND sj.completed_at >= datetime('now', '-7 days')
        ORDER BY sj.completed_at DESC
        LIMIT ?
      `, [parseInt(limit)]);

      // Add file information
      const deliveriesWithInfo = await Promise.all(
        legacyDeliveries.map(async (delivery) => {
          const fileInfo = delivery.output_file ? await getFileInfo(delivery.output_file) : null;
          return {
            id: delivery.job_id,
            clientName: delivery.client_name,
            businessTypes: delivery.business_types ? JSON.parse(delivery.business_types) : [],
            leadsCount: delivery.leads_found,
            completedAt: delivery.completed_at,
            files: fileInfo ? [{
              fileName: fileInfo.filename,
              size: fileInfo.size,
              sizeFormatted: fileInfo.sizeFormatted,
              downloadUrl: `/api/delivery/download/${delivery.job_id}/${fileInfo.filename}`
            }] : [],
            fileInfo,
            downloadUrl: delivery.output_file ? 
              `/api/delivery/download/${delivery.job_id}/${path.basename(delivery.output_file)}` : null
          };
        })
      );

      res.json({
        success: true,
        deliveries: deliveriesWithInfo,
        count: deliveriesWithInfo.length,
        source: 'legacy_system'
      });
    }

  } catch (error) {
    logger.error('Error getting recent deliveries:', error);
    res.status(500).json({ 
      error: 'Failed to get recent deliveries',
      message: error.message
    });
  }
});

// Helper function to get file information
async function getFileInfo(filePath) {
  if (!filePath) return null;

  try {
    const stats = await fs.stat(filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();

    return {
      filename,
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      modified: stats.mtime,
      extension: ext,
      type: getFileType(ext),
      exists: true
    };
  } catch (error) {
    return {
      filename: filePath ? path.basename(filePath) : 'Unknown',
      size: 0,
      sizeFormatted: '0 B',
      modified: null,
      extension: '',
      type: 'Unknown',
      exists: false,
      error: error.message
    };
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to get file type
function getFileType(extension) {
  const types = {
    '.xlsx': 'Excel Spreadsheet',
    '.xls': 'Excel Spreadsheet (Legacy)',
    '.csv': 'CSV File',
    '.txt': 'Text File'
  };
  return types[extension] || 'Unknown';
}

module.exports = router; 