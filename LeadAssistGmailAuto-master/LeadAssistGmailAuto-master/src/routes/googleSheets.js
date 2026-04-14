const express = require('express');
const Joi = require('joi');
const googleSheetsWorkflowService = require('../services/googleSheetsWorkflowService');
const googleSheetsService = require('../services/googleSheetsService');
const { getOne, getAll, runQuery } = require('../database/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const addConfigSchema = Joi.object({
  configName: Joi.string().required(),
  spreadsheetId: Joi.string().required(),
  sheetRange: Joi.string().default('Sheet1!A:E'),
  notificationEmail: Joi.string().email().required()
});

const updateConfigSchema = Joi.object({
  configName: Joi.string().optional(),
  spreadsheetId: Joi.string().optional(),
  sheetRange: Joi.string().optional(),
  notificationEmail: Joi.string().email().optional(),
  isActive: Joi.boolean().optional()
});

// Note: Confirmation endpoints removed - processing now starts automatically
// Jobs start immediately when detected in Google Sheets

// Admin Routes (protected - you may want to add auth middleware)

// Get all sheet configurations
router.get('/configs', async (req, res) => {
  try {
    const configs = await googleSheetsWorkflowService.getSheetConfigs();
    
    res.json({
      success: true,
      configs
    });

  } catch (error) {
    logger.error('Error getting sheet configs:', error);
    res.status(500).json({ 
      error: 'Failed to get sheet configurations',
      message: error.message
    });
  }
});

// Add new sheet configuration
router.post('/configs', async (req, res) => {
  try {
    const { error, value } = addConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const { configName, spreadsheetId, sheetRange, notificationEmail } = value;

    // Test Google Sheets access
    try {
      await googleSheetsService.getSheetInfo(spreadsheetId);
    } catch (sheetError) {
      return res.status(400).json({
        error: 'Cannot access Google Sheet',
        message: 'Please check the spreadsheet ID and ensure the service account has access'
      });
    }

    const result = await googleSheetsWorkflowService.addSheetConfig(
      configName, 
      spreadsheetId, 
      sheetRange, 
      notificationEmail
    );

    res.status(201).json(result);

  } catch (error) {
    logger.error('Error adding sheet config:', error);
    res.status(500).json({ 
      error: 'Failed to add sheet configuration',
      message: error.message
    });
  }
});

// Update sheet configuration
router.put('/configs/:configId', async (req, res) => {
  try {
    const { configId } = req.params;
    const { error, value } = updateConfigSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const result = await googleSheetsWorkflowService.updateSheetConfig(
      parseInt(configId), 
      value
    );

    res.json(result);

  } catch (error) {
    logger.error('Error updating sheet config:', error);
    res.status(500).json({ 
      error: 'Failed to update sheet configuration',
      message: error.message
    });
  }
});

// Get sheet job requests
router.get('/requests', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM sheets_job_requests';
    const params = [];

    if (status) {
      query += ' WHERE sheet_status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const requests = await getAll(query, params);

    // Parse JSON fields
    const processedRequests = requests.map(request => ({
      ...request,
      business_types: JSON.parse(request.business_types),
      locations: JSON.parse(request.locations)
    }));

    res.json({
      success: true,
      requests: processedRequests,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: processedRequests.length
      }
    });

  } catch (error) {
    logger.error('Error getting sheet requests:', error);
    res.status(500).json({ 
      error: 'Failed to get sheet requests',
      message: error.message
    });
  }
});

// Manually check for new requests
router.post('/check-sheets', async (req, res) => {
  try {
    await googleSheetsWorkflowService.checkForNewRequests();
    
    res.json({
      success: true,
      message: 'Manual sheet check completed'
    });

  } catch (error) {
    logger.error('Error in manual sheet check:', error);
    res.status(500).json({ 
      error: 'Failed to check sheets manually',
      message: error.message
    });
  }
});

// Start/stop monitoring
router.post('/monitoring/start', async (req, res) => {
  try {
    const { intervalMinutes = 5 } = req.body;
    
    await googleSheetsWorkflowService.startMonitoring(intervalMinutes);
    
    res.json({
      success: true,
      message: `Monitoring started with ${intervalMinutes} minute interval`
    });

  } catch (error) {
    logger.error('Error starting monitoring:', error);
    res.status(500).json({ 
      error: 'Failed to start monitoring',
      message: error.message
    });
  }
});

router.post('/monitoring/stop', async (req, res) => {
  try {
    googleSheetsWorkflowService.stopMonitoring();
    
    res.json({
      success: true,
      message: 'Monitoring stopped'
    });

  } catch (error) {
    logger.error('Error stopping monitoring:', error);
    res.status(500).json({ 
      error: 'Failed to stop monitoring',
      message: error.message
    });
  }
});

// Get monitoring status
router.get('/monitoring/status', (req, res) => {
  res.json({
    success: true,
    isMonitoring: googleSheetsWorkflowService.isMonitoring
  });
});

// Test Google Sheets connection
router.post('/test-connection', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({
        error: 'Spreadsheet ID is required'
      });
    }

    const sheetInfo = await googleSheetsService.getSheetInfo(spreadsheetId);
    
    res.json({
      success: true,
      message: 'Connection successful',
      sheetInfo
    });

  } catch (error) {
    logger.error('Error testing Google Sheets connection:', error);
    res.status(400).json({ 
      success: false,
      error: 'Failed to connect to Google Sheet',
      message: error.message
    });
  }
});

// Note: Resend confirmation endpoint removed - jobs start automatically now

module.exports = router; 