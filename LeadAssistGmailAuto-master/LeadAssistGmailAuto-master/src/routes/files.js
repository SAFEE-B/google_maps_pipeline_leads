const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');
const logger = require('../utils/logger');
const { getOne, runQuery } = require('../database/setup');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow CSV, Excel, and text files
    const allowedTypes = ['.csv', '.xlsx', '.xls', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

// Upload file endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { clientName, description } = req.body;
    const fileInfo = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      uploadedAt: new Date().toISOString(),
      clientName: clientName || 'unknown',
      description: description || ''
    };

    logger.info('File uploaded successfully', fileInfo);

    res.json({
      success: true,
      file: fileInfo,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ 
      error: 'Failed to upload file',
      message: error.message
    });
  }
});

// Download file endpoint for generated files (by fileId from deliveries)
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info from deliveries table
    const fileQuery = `
      SELECT file_id, filename, file_path, format, lead_count, file_size
      FROM deliveries 
      WHERE file_id = ? AND status = 'completed'
    `;
    
    const fileInfo = await getOne(fileQuery, [fileId]);
    
    if (!fileInfo) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist or is not ready for download'
      });
    }

    // Check if file exists on disk
    const filePath = fileInfo.file_path;
    try {
      await fs.access(filePath);
    } catch (e) {
      return res.status(404).json({
        error: 'File not found on disk',
        message: 'The file may have been moved or deleted'
      });
    }

    // Update downloaded_at timestamp
    const updateQuery = `
      UPDATE deliveries 
      SET downloaded_at = datetime('now') 
      WHERE file_id = ?
    `;
    await runQuery(updateQuery, [fileId]);

    // Set appropriate headers
    const contentType = fileInfo.format === 'excel' || fileInfo.format === 'xlsx' 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);
    res.setHeader('Content-Length', fileInfo.file_size);

    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error downloading file' });
      }
    });

    logger.info(`File downloaded: ${fileInfo.filename} (${fileInfo.lead_count} leads)`);

  } catch (error) {
    logger.error('Error in file download:', error);
    res.status(500).json({ 
      error: 'Download failed',
      message: error.message
    });
  }
});

// Download file endpoint for direct file access
router.get('/download/direct/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check - ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Check in multiple possible directories
    const possiblePaths = [
      path.join(process.env.OUTPUTS_DIRECTORY || './Outputs', filename),
      path.join(process.env.FILES_DIRECTORY || './Files', filename),
      path.join(process.env.UPLOAD_PATH || './uploads', filename)
    ];

    let filePath = null;
    for (const testPath of possiblePaths) {
      try {
        await fs.access(testPath);
        filePath = testPath;
        break;
      } catch (e) {
        // File doesn't exist in this location, try next
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
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

    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);

    logger.info(`File downloaded: ${filename}`, { size: stats.size });

  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).json({ 
      error: 'Failed to download file',
      message: error.message
    });
  }
});

// List available files
router.get('/list', async (req, res) => {
  try {
    const { directory = 'outputs' } = req.query;
    
    let targetDir;
    switch (directory.toLowerCase()) {
      case 'outputs':
        targetDir = process.env.OUTPUTS_DIRECTORY || './Outputs';
        break;
      case 'files':
        targetDir = process.env.FILES_DIRECTORY || './Files';
        break;
      case 'uploads':
        targetDir = process.env.UPLOAD_PATH || './uploads';
        break;
      default:
        return res.status(400).json({ error: 'Invalid directory. Use: outputs, files, or uploads' });
    }

    const files = await fs.readdir(targetDir);
    const fileDetails = [];

    for (const filename of files) {
      try {
        const filePath = path.join(targetDir, filename);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          fileDetails.push({
            filename,
            size: stats.size,
            modified: stats.mtime,
            created: stats.birthtime,
            extension: path.extname(filename).toLowerCase()
          });
        }
      } catch (e) {
        // Skip files we can't read
        logger.warn(`Could not read file stats for ${filename}:`, e.message);
      }
    }

    // Sort by modification date (newest first)
    fileDetails.sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json({
      success: true,
      directory,
      files: fileDetails,
      count: fileDetails.length
    });

  } catch (error) {
    logger.error('Error listing files:', error);
    res.status(500).json({ 
      error: 'Failed to list files',
      message: error.message
    });
  }
});

// Get file info/preview
router.get('/info/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Find the file
    const possiblePaths = [
      path.join(process.env.OUTPUTS_DIRECTORY || './Outputs', filename),
      path.join(process.env.FILES_DIRECTORY || './Files', filename),
      path.join(process.env.UPLOAD_PATH || './uploads', filename)
    ];

    let filePath = null;
    let directory = '';
    
    for (let i = 0; i < possiblePaths.length; i++) {
      try {
        await fs.access(possiblePaths[i]);
        filePath = possiblePaths[i];
        directory = ['outputs', 'files', 'uploads'][i];
        break;
      } catch (e) {
        // Continue to next path
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stats = await fs.stat(filePath);
    const ext = path.extname(filename).toLowerCase();

    const fileInfo = {
      filename,
      directory,
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      extension: ext,
      type: getFileType(ext)
    };

    // For Excel/CSV files, try to get row count and column info
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      try {
        const preview = await getFilePreview(filePath, ext);
        fileInfo.preview = preview;
      } catch (e) {
        logger.warn(`Could not generate preview for ${filename}:`, e.message);
      }
    }

    res.json({
      success: true,
      file: fileInfo
    });

  } catch (error) {
    logger.error('Error getting file info:', error);
    res.status(500).json({ 
      error: 'Failed to get file info',
      message: error.message
    });
  }
});

// Delete file
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Only allow deletion from uploads directory for security
    const filePath = path.join(process.env.UPLOAD_PATH || './uploads', filename);
    
    try {
      await fs.access(filePath);
    } catch (e) {
      return res.status(404).json({ error: 'File not found' });
    }

    await fs.unlink(filePath);
    
    logger.info(`File deleted: ${filename}`);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ 
      error: 'Failed to delete file',
      message: error.message
    });
  }
});

// Helper functions
function getFileType(extension) {
  const types = {
    '.xlsx': 'Excel Spreadsheet',
    '.xls': 'Excel Spreadsheet (Legacy)',
    '.csv': 'CSV File',
    '.txt': 'Text File'
  };
  return types[extension] || 'Unknown';
}

async function getFilePreview(filePath, extension) {
  if (extension === '.csv') {
    // Read first few lines of CSV
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').slice(0, 6); // Header + 5 data rows
    return {
      type: 'csv',
      headers: lines[0] ? lines[0].split(',') : [],
      sampleRows: lines.slice(1, 6),
      estimatedRows: content.split('\n').length - 1
    };
  } else if (['.xlsx', '.xls'].includes(extension)) {
    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    
    // Get first few rows
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    return {
      type: 'excel',
      sheetNames: workbook.SheetNames,
      headers: jsonData[0] || [],
      sampleRows: jsonData.slice(1, 6),
      estimatedRows: range.e.r,
      estimatedCols: range.e.c + 1
    };
  }
  
  return null;
}

module.exports = router; 