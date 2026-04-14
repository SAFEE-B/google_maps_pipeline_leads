const { google } = require('googleapis');
const path = require('path');
const logger = require('../utils/logger');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize Google Auth using service account or OAuth2
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        // Service Account authentication
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        this.auth = new google.auth.GoogleAuth({
          credentials,
          scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/gmail.send'
          ]
        });
      } else if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        // OAuth2 authentication (requires manual token setup)
        this.auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );
        
        if (process.env.GOOGLE_REFRESH_TOKEN) {
          this.auth.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
          });
        }
      } else {
        throw new Error('Google authentication credentials not found. Please set either GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
      }

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.initialized = true;
      logger.info('Google Sheets service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Google Sheets service:', error);
      throw error;
    }
  }

  async readJobRequests(spreadsheetId, range = 'All Orders!A:K') {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        logger.info('No data found in Google Sheet');
        return [];
      }

      // Actual column structure (data starts in column B):
      // A: (empty), B: Name of List, C: Cities/Zipcodes, D: State, E: Types of Industries, 
      // F: # of Leads, G: Additional Notes, H: Timeline, I: Have you started?, J: Updates, K: Completed?
      const jobRequests = [];

      // Process data rows (skip first 2 rows - instruction row and header row)
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (row && row.length >= 5) {
          const jobRequest = {
            rowNumber: i + 1, // 1-indexed for Google Sheets
            nameOfList: row[1] || '', // Column B
            citiesZipcodes: row[2] || '', // Column C
            state: row[3] || '', // Column D
            typesOfIndustries: row[4] || '', // Column E
            numberOfLeads: row[5] || '', // Column F
            additionalNotes: row[6] || '', // Column G
            timeline: row[7] || '', // Column H
            haveYouStarted: row[8] || '', // Column I
            updates: row[9] || '', // Column J
            completed: row[10] || '', // Column K (if it exists)
            rawRow: row
          };

          // Parse cities/zipcodes
          jobRequest.locations = this.parseLocations(jobRequest.citiesZipcodes);
          
          // Parse business types
          jobRequest.businessTypes = this.parseBusinessTypes(jobRequest.typesOfIndustries);

          // Determine status - check both "Have you started?" and "Completed?" columns
          let status = 'pending';
          if (jobRequest.completed && jobRequest.completed.toLowerCase().includes('yes')) {
            status = 'completed';
          } else if (jobRequest.haveYouStarted && jobRequest.haveYouStarted.toLowerCase().includes('yes')) {
            status = 'processing';
          }
          jobRequest.status = status;

          // Only include rows that have actual data and aren't completed
          if (jobRequest.nameOfList.trim() && 
              jobRequest.locations.length > 0 && 
              jobRequest.businessTypes.length > 0 &&
              status !== 'completed') {
            jobRequests.push(jobRequest);
          }
        }
      }

      logger.info(`Found ${jobRequests.length} job requests in Google Sheet`);
      return jobRequests;

    } catch (error) {
      logger.error('Error reading Google Sheet:', error);
      throw error;
    }
  }

  async updateJobStatus(spreadsheetId, rowNumber, status, range = 'All Orders') {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Update appropriate columns based on status (data starts in column B)
      const updates = [];
      
      if (status === 'email_sent' || status === 'processing') {
        // Update "Have you started?" column (I) to "Yes"
        updates.push({
          range: `${range}!I${rowNumber}`,
          values: [['Yes']]
        });
      }
      
      if (status === 'completed') {
        // Update "Completed? Yes or NO" column (K) to "Yes" (if column exists)
        updates.push({
          range: `${range}!K${rowNumber}`,
          values: [['Yes']]
        });
      }
      
      if (status === 'failed') {
        // Update "Updates (from you)" column (J) with failure note
        updates.push({
          range: `${range}!J${rowNumber}`,
          values: [['Processing failed - please check logs']]
        });
      }

      // Perform all updates
      for (const update of updates) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: update.range,
          valueInputOption: 'RAW',
          resource: {
            values: update.values
          }
        });
      }

      logger.info(`Updated Google Sheet row ${rowNumber} status to: ${status}`);
    } catch (error) {
      logger.error(`Error updating Google Sheet status for row ${rowNumber}:`, error);
      throw error;
    }
  }

  parseLocations(locationsString) {
    if (!locationsString || typeof locationsString !== 'string') {
      return [];
    }

    // Split by common delimiters: comma, semicolon, newline, pipe
    return locationsString
      .split(/[,;\n|]+/)
      .map(location => location.trim())
      .filter(location => location.length > 0)
      .map(location => {
        // Clean up location format - remove extra spaces, standardize
        return location.replace(/\s+/g, ' ').trim();
      });
  }

  parseBusinessTypes(businessTypesString) {
    if (!businessTypesString || typeof businessTypesString !== 'string') {
      return [];
    }

    // Split by common delimiters and clean up
    return businessTypesString
      .split(/[,;\n|]+/)
      .map(type => type.trim())
      .filter(type => type.length > 0)
      .flatMap(type => {
        // Split by "and" but preserve compound business names
        if (type.toLowerCase().includes(' and ') && !type.toLowerCase().includes('bed and breakfast')) {
          return type.split(/\s+and\s+/i).map(t => t.trim()).filter(t => t.length > 0);
        }
        return [type];
      })
      .filter(type => type.length > 0 && !['and', 'or', '&'].includes(type.toLowerCase()))
      .map(type => {
        // Capitalize first letter of each word
        return type.replace(/\b\w/g, l => l.toUpperCase());
      });
  }

  async getSheetInfo(spreadsheetId) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId
      });

      return {
        title: response.data.properties.title,
        sheets: response.data.sheets.map(sheet => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
          rowCount: sheet.properties.gridProperties.rowCount,
          columnCount: sheet.properties.gridProperties.columnCount
        }))
      };
    } catch (error) {
      logger.error('Error getting sheet info:', error);
      throw error;
    }
  }
}

module.exports = new GoogleSheetsService(); 