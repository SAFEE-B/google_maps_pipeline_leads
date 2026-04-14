const fs = require('fs').promises;
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { runQuery } = require('../database/setup');
const logger = require('../utils/logger');

class FileGenerationService {
  constructor() {
    this.outputDir = path.join(__dirname, '..', '..', 'Outputs');
    this.deliveriesDir = path.join(__dirname, '..', '..', 'Files', 'Deliveries');
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.mkdir(this.deliveriesDir, { recursive: true });
    } catch (error) {
      logger.error('Error creating directories:', error);
    }
  }

  async generateLeadsFile(leads, options = {}) {
    const {
      format = 'csv',
      filename = null,
      filters = {},
      requestType = 'lead_export'
    } = options;

    try {
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filterString = this.buildFilterString(filters);
      const baseFilename = filename || `leads_${filterString}_${timestamp}`;
      const fileId = uuidv4();
      
      let finalFilename;
      let filePath;
      let fileData;

      if (format === 'excel' || format === 'xlsx') {
        finalFilename = `${baseFilename}.xlsx`;
        filePath = path.join(this.deliveriesDir, finalFilename);
        fileData = await this.generateExcelFile(leads, filePath);
      } else {
        finalFilename = `${baseFilename}.csv`;
        filePath = path.join(this.deliveriesDir, finalFilename);
        fileData = await this.generateCsvFile(leads, filePath);
      }

      // Record delivery in database
      const deliveryRecord = await this.recordDelivery({
        fileId,
        filename: finalFilename,
        filePath,
        format,
        leadCount: leads.length,
        filters,
        requestType,
        fileSize: fileData.size
      });

      return {
        success: true,
        fileId,
        filename: finalFilename,
        filePath,
        downloadUrl: `/api/files/download/${fileId}`,
        leadCount: leads.length,
        format,
        size: fileData.size,
        sizeFormatted: this.formatFileSize(fileData.size),
        filters,
        deliveryRecord
      };

    } catch (error) {
      logger.error('Error generating leads file:', error);
      throw new Error(`File generation failed: ${error.message}`);
    }
  }

  async generateCsvFile(leads, filePath) {
    if (leads.length === 0) {
      throw new Error('No leads to export');
    }

    // Define CSV headers based on lead structure
    const headers = [
      { id: 'id', title: 'ID' },
      { id: 'name_of_business', title: 'Business Name' },
      { id: 'type_of_business', title: 'Business Type' },
      { id: 'sub_category', title: 'Sub Category' },
      { id: 'business_address', title: 'Address' },
      { id: 'city', title: 'City' },
      { id: 'state', title: 'State' },
      { id: 'zip_code', title: 'Zip Code' },
      { id: 'phone_number', title: 'Phone' },
      { id: 'email', title: 'Email' },
      { id: 'website', title: 'Website' },
      { id: 'rating', title: 'Rating' },
      { id: 'num_reviews', title: 'Review Count' },
      { id: 'latest_review', title: 'Latest Review' },
      { id: 'notes', title: 'Notes' },
      { id: 'source_file', title: 'Source File' },
      { id: 'created_at', title: 'Created At' }
    ];

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: headers
    });

    // Process leads to show only first source
    const processedLeads = leads.map(lead => ({
      ...lead,
      source_file: this.getFirstSourceOnly(lead.source_file)
    }));

    await csvWriter.writeRecords(processedLeads);
    
    const stats = await fs.stat(filePath);
    return { size: stats.size };
  }

  async generateExcelFile(leads, filePath) {
    if (leads.length === 0) {
      throw new Error('No leads to export');
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Process leads to show only first source
    const processedLeads = leads.map(lead => ({
      ...lead,
      source_file: this.getFirstSourceOnly(lead.source_file)
    }));
    
    // Convert leads to worksheet
    const worksheet = XLSX.utils.json_to_sheet(processedLeads, {
      header: [
        'id', 'name_of_business', 'type_of_business', 'sub_category',
        'business_address', 'city', 'state', 'zip_code', 'phone_number',
        'email', 'website', 'rating', 'num_reviews', 'latest_review',
        'notes', 'source_file', 'created_at'
      ]
    });

    // Set column widths
    const columnWidths = [
      { wch: 8 },   // ID
      { wch: 30 },  // Business Name
      { wch: 20 },  // Business Type
      { wch: 15 },  // Sub Category
      { wch: 40 },  // Address
      { wch: 15 },  // City
      { wch: 8 },   // State
      { wch: 10 },  // Zip
      { wch: 15 },  // Phone
      { wch: 25 },  // Email
      { wch: 25 },  // Website
      { wch: 8 },   // Rating
      { wch: 8 },   // Reviews
      { wch: 30 },  // Latest Review
      { wch: 20 },  // Notes
      { wch: 15 },  // Source
      { wch: 20 }   // Created At
    ];
    worksheet['!cols'] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

    // Write file
    XLSX.writeFile(workbook, filePath);
    
    const stats = await fs.stat(filePath);
    return { size: stats.size };
  }

  async recordDelivery(deliveryData) {
    const {
      fileId, filename, filePath, format, leadCount, filters, requestType, fileSize
    } = deliveryData;

    const query = `
      INSERT INTO deliveries (
        file_id, filename, file_path, format, lead_count, 
        filters, request_type, file_size, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', datetime('now'))
    `;

    const params = [
      fileId,
      filename,
      filePath,
      format,
      leadCount,
      JSON.stringify(filters),
      requestType,
      fileSize
    ];

    try {
      await runQuery(query, params);
      return { fileId, status: 'recorded' };
    } catch (error) {
      // If deliveries table doesn't exist, create it
      if (error.message.includes('no such table: deliveries')) {
        await this.createDeliveriesTable();
        await runQuery(query, params);
        return { fileId, status: 'recorded' };
      }
      throw error;
    }
  }

  async createDeliveriesTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        format TEXT NOT NULL,
        lead_count INTEGER NOT NULL,
        filters TEXT,
        request_type TEXT NOT NULL,
        file_size INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        downloaded_at DATETIME
      )
    `;
    
    await runQuery(createTableQuery);
    logger.info('Deliveries table created successfully');
  }

  async getRecentDeliveries(limit = 10) {
    try {
      const query = `
        SELECT file_id, filename, format, lead_count, file_size, 
               filters, request_type, status, created_at, downloaded_at
        FROM deliveries 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      const deliveries = await runQuery(query, [limit]);
      return deliveries.map(delivery => ({
        ...delivery,
        filters: JSON.parse(delivery.filters || '{}'),
        downloadUrl: `/api/files/download/${delivery.file_id}`,
        sizeFormatted: this.formatFileSize(delivery.file_size)
      }));
    } catch (error) {
      if (error.message.includes('no such table: deliveries')) {
        await this.createDeliveriesTable();
        return [];
      }
      throw error;
    }
  }

  getFirstSourceOnly(sourceFile) {
    if (!sourceFile) return 'Not in any file';
    
    // If it's the default "Not in any file" message, keep it as-is
    if (sourceFile === 'Not in any file' || sourceFile === 'Not in any list') {
      return sourceFile;
    }
    
    // If source contains pipe separators (combined sources), return only the first one
    if (sourceFile.includes(' | ')) {
      return sourceFile.split(' | ')[0];
    }
    
    // Otherwise, return the source as-is
    return sourceFile;
  }

  buildFilterString(filters) {
    const parts = [];
    if (filters.state) parts.push(filters.state);
    if (filters.city) parts.push(filters.city);
    if (filters.businessType) parts.push(filters.businessType);
    if (filters.zipCode) parts.push(filters.zipCode);
    return parts.length > 0 ? parts.join('_') : 'all';
  }

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = FileGenerationService; 