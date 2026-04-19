const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const fs = require('fs').promises;
const ExcelJS = require('exceljs');

const googleSheetsService = require('./googleSheetsService');
const gmailService = require('./gmailService');
const { setupDatabase, runQuery, getOne, getAll } = require('../database/setup');
const logger = require('../utils/logger');
const { convertToRelativeDate } = require('../queues/processors/dockerScraper');

// Sub-category filters for business type consolidation - CRITICAL for proper filtering
const SUB_CATEGORY_FILTERS = {
  "rv park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
  "mobile home park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
  "trailer park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
  "rv parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
  "mobile home parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
  "trailer parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
  "nursing homes": ['senior citizen center','assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'],
  "nursing home": ['senior citizen center','assisted living facility', 'retirement community', 'retirement home', 'rehabilitation center', 'nursing home', 'no category'],
  "apartment buildings": ['housing complex','apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'],
  "apartment building": ['housing complex','apartment building', 'apartment complex', 'condominium complex', 'townhome complex', 'apartment rental agency', 'apartments', 'townhouse complex', 'condominium rental agency', 'no category'],
  "high school": ['middle school', 'high school', 'charter school', 'senior high school'],
  "high schools": ['middle school', 'high school', 'charter school', 'senior high school'],
  "middle school": ['middle school', 'high school', 'charter school', 'senior high school'],
  "middle schools": ['middle school', 'high school', 'charter school', 'senior high school'],
  "laundromat": ['no category', 'laundry', 'laundromat', 'laundry service'],
  "laundromats": ['no category', 'laundry', 'laundromat', 'laundry service'],
  "auto repair shop": ['car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'],
  "auto repair shops": ['car service station', 'car repair and maintenance service', 'auto body shop', 'auto bodywork mechanic', 'auto dent removal service station', 'auto painting', 'car service station', 'auto restoration service', 'oil change service', 'auto air conditioning service', 'car inspection station', 'car repair and maintenance service', 'smog inspection station', 'vehicle inspection service', 'no category', 'mechanic', 'auto repair shop', 'auto glass shop'],
  "motels": ['hotel', 'inn', 'motel', 'extended stay hotel'],
  "motel": ['hotel', 'inn', 'motel', 'extended stay hotel'],
  "gym": ['gym','personal trainer', 'rock climbing gym', 'physical fitness program','fitness center', 'martial arts school', 'boxing gym', 'muay thai boxing gym', 'kickboxing school', 'kickboxing gym'],
  "gyms": ['gym','personal trainer', 'rock climbing gym', 'physical fitness program','fitness center', 'martial arts school', 'boxing gym', 'muay thai boxing gym', 'kickboxing school', 'kickboxing gym'],
  "warehouse": ["warehouse", "manufacturer", "logistics service"],
  "warehouses": ["warehouse", "manufacturer","manufacturers", "logistics service"],
  "factories": ["manufacturer", "manufacturers", "factory", "manufacturing", "fabricator", "steel fabricator", "metal fabricator", "plastic fabrication company", "food processing company", "textile mill", "machine shop", "foundry", "industrial equipment supplier", "chemical manufacturer", "pharmaceutical company", "commercial refrigerator supplier", "tool & die shop"],
  "factory": ["manufacturer", "manufacturers", "factory", "manufacturing", "fabricator", "steel fabricator", "metal fabricator", "plastic fabrication company", "food processing company", "textile mill", "machine shop", "foundry", "industrial equipment supplier", "chemical manufacturer", "pharmaceutical company", "commercial refrigerator supplier", "tool & die shop"]
};

class GoogleSheetsWorkflowService {
  constructor() {
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  async startMonitoring(intervalMinutes = 5) {
    if (this.isMonitoring) {
      logger.warn('Google Sheets monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    const intervalMs = intervalMinutes * 60 * 1000;

    logger.info(`Starting Google Sheets monitoring with ${intervalMinutes} minute interval`);

    // Run initial check
    await this.checkForNewRequests();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkForNewRequests();
      } catch (error) {
        logger.error('Error in Google Sheets monitoring cycle:', error);
      }
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Google Sheets monitoring stopped');
  }

  async checkForNewRequests() {
    try {
      // Ensure database is initialized
      try {
        await setupDatabase();
      } catch (dbError) {
        // Database might already be initialized, ignore the error
        logger.debug('Database already initialized or setup failed:', dbError.message);
      }
      
      // Get active sheet configurations
      const configs = await getAll(
        'SELECT * FROM sheets_config WHERE is_active = 1',
        []
      );

      if (configs.length === 0) {
        logger.debug('No active Google Sheets configurations found');
        return;
      }

      for (const config of configs) {
        await this.processSheetConfig(config);
      }

    } catch (error) {
      logger.error('Error checking for new requests:', error);
      throw error;
    }
  }

  async processSheetConfig(config) {
    try {
      logger.debug(`Processing sheet config: ${config.config_name}`);

      // Read job requests from Google Sheet
      const jobRequests = await googleSheetsService.readJobRequests(
        config.spreadsheet_id,
        config.sheet_range
      );

      if (jobRequests.length === 0) {
        logger.debug(`No new job requests found in sheet: ${config.config_name}`);
        return;
      }

      // Filter for new requests (rows we haven't processed yet)
      const newRequests = jobRequests.filter(request => 
        request.rowNumber > config.last_check_row
      );

      if (newRequests.length === 0) {
        logger.debug(`No new requests since last check for sheet: ${config.config_name}`);
        return;
      }

      logger.info(`Found ${newRequests.length} new requests in sheet: ${config.config_name}`);

      for (const request of newRequests) {
        await this.processNewRequest(config, request);
      }

      // Update last checked row
      const maxRowNumber = Math.max(...jobRequests.map(r => r.rowNumber));
      await runQuery(
        'UPDATE sheets_config SET last_check_row = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [maxRowNumber, config.id]
      );

    } catch (error) {
      logger.error(`Error processing sheet config ${config.config_name}:`, error);
    }
  }

  async processNewRequest(config, request) {
    try {
      const requestId = uuidv4();

      // Store the request in database
      await runQuery(`
        INSERT INTO sheets_job_requests (
          request_id, spreadsheet_id, row_number, name_of_list, 
          business_types, locations, email, sheet_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        requestId,
        config.spreadsheet_id,
        request.rowNumber,
        request.nameOfList,
        JSON.stringify(request.businessTypes),
        JSON.stringify(request.locations),
        process.env.TO_EMAIL || 'safee.bangash@gmail.com',
        'analyzing'
      ]);

      // Analyze existing leads before starting
      const leadAnalysis = await this.analyzeExistingLeads(requestId);

      // Send process started email with analysis
      await this.sendProcessStartedEmail(requestId, leadAnalysis);

      // Update status to processing
      await runQuery(
        'UPDATE sheets_job_requests SET sheet_status = ? WHERE request_id = ?',
        ['processing', requestId]
      );

      // Start the scraping job immediately
      const scrapingJobId = await this.startScrapingJob(requestId);

      // Update Google Sheet status
      await googleSheetsService.updateJobStatus(
        config.spreadsheet_id,
        request.rowNumber,
        'processing'
      );

      logger.info(`Started processing request: ${request.nameOfList} (Row ${request.rowNumber}) - Job ID: ${scrapingJobId}`);

    } catch (error) {
      logger.error(`Error processing new request ${request.nameOfList}:`, error);
      
      // Update sheet status to failed
      try {
        await googleSheetsService.updateJobStatus(
          config.spreadsheet_id,
          request.rowNumber,
          'failed'
        );
      } catch (updateError) {
        logger.error('Error updating sheet status to failed:', updateError);
      }
    }
  }

  async analyzeExistingLeads(requestId) {
    try {
      const request = await getOne(
        'SELECT * FROM sheets_job_requests WHERE request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error(`Request not found: ${requestId}`);
      }

      const businessTypes = JSON.parse(request.business_types);
      const locations = JSON.parse(request.locations);

      // Generate all possible queries (combinations)
      const queries = [];
      businessTypes.forEach(businessType => {
        locations.forEach(location => {
          queries.push({
            businessType,
            location,
            query: `${businessType} near ${location}`
          });
        });
      });

      // Use the new lead optimization service for analysis
      const LeadOptimizationService = require('./leadOptimizationService');
      const leadOptimizer = new LeadOptimizationService();
      
      // Analyze existing leads vs missing leads using advanced optimization
      const { optimizedQueries, existingLeads } = await leadOptimizer.checkExistingLeadsAndOptimizeQueries(queries);

      const analysis = {
        totalQueries: queries.length,
        existingLeads: existingLeads.length,
        queriesToProcess: optimizedQueries.length,
        queriesWithExistingLeads: queries.length - optimizedQueries.length,
        businessTypes,
        locations
      };

      logger.info(`Lead analysis completed for ${requestId}:`, analysis);
      return analysis;

    } catch (error) {
      logger.error(`Error analyzing existing leads for ${requestId}:`, error);
      // Return fallback analysis
      const request = await getOne(
        'SELECT * FROM sheets_job_requests WHERE request_id = ?',
        [requestId]
      );
      
      if (request) {
        const businessTypes = JSON.parse(request.business_types);
        const locations = JSON.parse(request.locations);
        const totalQueries = businessTypes.length * locations.length;
        
        return {
          totalQueries,
          existingLeads: 0,
          queriesToProcess: totalQueries,
          queriesWithExistingLeads: 0,
          businessTypes,
          locations,
          error: 'Could not analyze existing leads'
        };
      }
      
      throw error;
    }
  }

  async sendProcessStartedEmail(requestId, leadAnalysis) {
    try {
      const request = await getOne(
        'SELECT * FROM sheets_job_requests WHERE request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error(`Request not found: ${requestId}`);
      }

      // Parse the JSON fields
      const jobRequest = {
        nameOfList: request.name_of_list,
        businessTypes: JSON.parse(request.business_types),
        locations: JSON.parse(request.locations),
        analysis: leadAnalysis
      };

      await gmailService.sendProcessStartedEmail(
        process.env.TO_EMAIL || 'safee.bangash@gmail.com',
        jobRequest
      );

      // Update request status
      await runQuery(
        'UPDATE sheets_job_requests SET email_sent_at = CURRENT_TIMESTAMP WHERE request_id = ?',
        [requestId]
      );

      logger.info(`Process started email sent for request: ${requestId}`);

    } catch (error) {
      logger.error(`Error sending process started email for request ${requestId}:`, error);
      throw error;
    }
  }

  async startScrapingJob(requestId) {
    try {
      const request = await getOne(
        'SELECT * FROM sheets_job_requests WHERE request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error(`Request not found: ${requestId}`);
      }

      const businessTypes = JSON.parse(request.business_types);
      const locations = JSON.parse(request.locations);
      const scrapingJobId = uuidv4();

      // Generate search queries
      const queries = this.generateSearchQueries(businessTypes, locations);

      // Create scraping job record
      await runQuery(
        'INSERT INTO scraping_jobs (job_id, client_name, business_types, zip_codes, queries_generated, status) VALUES (?, ?, ?, ?, ?, ?)',
        [
          scrapingJobId,
          `Sheet: ${request.name_of_list}`,
          JSON.stringify(businessTypes),
          JSON.stringify(locations),
          queries.length,
          'waiting'
        ]
      );

      // Link the scraping job to the sheet request
      await runQuery(
        'UPDATE sheets_job_requests SET scraping_job_id = ?, sheet_status = ? WHERE request_id = ?',
        [scrapingJobId, 'processing', requestId]
      );

      // Add job to queue (delayed import to avoid circular dependency)
      const { addScrapingJob } = require('../queues/setup');
      await addScrapingJob({
        jobId: scrapingJobId,
        clientName: `Sheet: ${request.name_of_list}`,
        businessTypes,
        zipCodes: locations,
        queries,
        isSheetJob: true,
        sheetRequestId: requestId
      });

      logger.info(`Started scraping job ${scrapingJobId} for sheet request ${requestId}`);
      return scrapingJobId;

    } catch (error) {
      logger.error(`Error starting scraping job for request ${requestId}:`, error);
      
      // Update request status to failed
      await runQuery(
        'UPDATE sheets_job_requests SET sheet_status = ?, error_message = ? WHERE request_id = ?',
        ['failed', error.message, requestId]
      ).catch(updateError => {
        logger.error('Error updating request status to failed:', updateError);
      });

      throw error;
    }
  }

  async handleJobCompletion(scrapingJobId, requestedFileName = null) {
    try {
      // Check if this is a sheet job
      const sheetRequest = await getOne(
        'SELECT * FROM sheets_job_requests WHERE scraping_job_id = ?',
        [scrapingJobId]
      );

      if (!sheetRequest) {
        logger.debug(`Job ${scrapingJobId} is not a sheet job, skipping completion handling`);
        return;
      }

      // Get job stats
      const scrapingJob = await getOne(
        'SELECT * FROM scraping_jobs WHERE job_id = ?',
        [scrapingJobId]
      );

      if (!scrapingJob) {
        throw new Error(`Scraping job not found: ${scrapingJobId}`);
      }

      // NEW SIMPLIFIED FLOW: Always generate file from database
      logger.info(`Generating file from database for job ${scrapingJobId}`);
      const generatedFilePath = await this.generateFinalFile(scrapingJobId, sheetRequest.name_of_list);
      
      // Get updated job stats after file generation (leads_found will now be accurate)
      const updatedScrapingJob = await getOne(
        'SELECT * FROM scraping_jobs WHERE job_id = ?',
        [scrapingJobId]
      );
      
      await this.sendCompletionEmail(sheetRequest.request_id, generatedFilePath, updatedScrapingJob || scrapingJob);

      await runQuery(
        'UPDATE sheets_job_requests SET sheet_status = ?, final_file_path = ?, completed_at = CURRENT_TIMESTAMP WHERE request_id = ?',
        ['completed', generatedFilePath, sheetRequest.request_id]
      );

      await googleSheetsService.updateJobStatus(
        sheetRequest.spreadsheet_id,
        sheetRequest.row_number,
        'completed'
      );

      logger.info(`Completed sheet job processing for ${sheetRequest.name_of_list} using database generation`);

    } catch (error) {
      logger.error(`Error handling job completion for ${scrapingJobId}:`, error);
      
      // Update status to failed
      const sheetRequest = await getOne(
        'SELECT * FROM sheets_job_requests WHERE scraping_job_id = ?',
        [scrapingJobId]
      );

      if (sheetRequest) {
        await runQuery(
          'UPDATE sheets_job_requests SET sheet_status = ?, error_message = ? WHERE scraping_job_id = ?',
          ['failed', error.message, scrapingJobId]
        ).catch(updateError => {
          logger.error('Error updating sheet request to failed:', updateError);
        });

        await googleSheetsService.updateJobStatus(
          sheetRequest.spreadsheet_id,
          sheetRequest.row_number,
          'failed'
        ).catch(updateError => {
          logger.error('Error updating Google Sheet to failed:', updateError);
        });
      }
    }
  }

  async generateFinalFile(scrapingJobId, listName) {
    try {
      // Get sheet request details to know what business types and locations were requested
      const sheetRequest = await getOne(
        'SELECT * FROM sheets_job_requests WHERE scraping_job_id = ?',
        [scrapingJobId]
      );

      if (!sheetRequest) {
        throw new Error(`Sheet request not found for job ${scrapingJobId}`);
      }

      const businessTypes = JSON.parse(sheetRequest.business_types);
      const locations = JSON.parse(sheetRequest.locations);

      logger.info(`Fetching leads for ${businessTypes.length} business types and ${locations.length} locations`);

      // OPTIMIZED APPROACH: Use efficient batched queries instead of 1000+ individual queries
      // This avoids SQLite expression tree limits while still being much faster
      
      const maxConditionsPerQuery = 100; // Safe limit well below SQLite's 1000 expression tree limit
      const allLeads = new Map(); // For deduplication using phone number as key
      
      // Generate all combinations first
      const allCombinations = [];
      businessTypes.forEach(businessType => {
        locations.forEach(location => {
          allCombinations.push({ businessType, location });
        });
      });
      
      const totalCombinations = allCombinations.length;
      const queriesNeeded = Math.ceil(totalCombinations / maxConditionsPerQuery);
      
      logger.info(`Optimized approach: ${totalCombinations} combinations split into ${queriesNeeded} efficient queries`);
      
      // Process combinations in batches
      for (let queryIndex = 0; queryIndex < queriesNeeded; queryIndex++) {
        const startIndex = queryIndex * maxConditionsPerQuery;
        const endIndex = Math.min(startIndex + maxConditionsPerQuery, totalCombinations);
        const batchCombinations = allCombinations.slice(startIndex, endIndex);
        
        // Build the WHERE conditions for this batch
        const conditions = [];
        const params = [];
        
        batchCombinations.forEach(({ businessType, location }) => {
          // Improved location matching logic for more precise geographic targeting
          const isZipCode = /^\d{5}(-\d{4})?$/.test(location.trim());
          
          if (isZipCode) {
            // For zip codes: exact match on zip_code field + nearby city/address matching
            conditions.push(`
              (
                (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
                AND (
                  zip_code = ? 
                  OR zip_code LIKE ?
                  OR LOWER(business_address) LIKE LOWER(?)
                )
              )
            `);
            
            params.push(
              `%${businessType}%`,
              `%${businessType}%`,
              location,                    // Exact zip match
              `${location}%`,              // Zip prefix match (e.g., 85001 matches 85001-1234)
              `%${location}%`              // Address contains zip
            );
          } else {
            // For city/state names: more targeted matching
            conditions.push(`
              (
                (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
                AND (
                  LOWER(city) = LOWER(?) 
                  OR LOWER(city) LIKE LOWER(?)
                  OR LOWER(business_address) LIKE LOWER(?)
                  OR LOWER(state) = LOWER(?)
                )
              )
            `);
            
            params.push(
              `%${businessType}%`,
              `%${businessType}%`,
              location,                    // Exact city match
              `${location}%`,              // City prefix match
              `%${location}%`,             // Address contains location
              location.length === 2 ? location : `%${location}%`  // State code or state name
            );
          }
        });
        
        if (conditions.length > 0) {
          const query = `
            SELECT DISTINCT
              name_of_business,
              type_of_business,
              sub_category,
              website,
              num_reviews,
              rating,
              latest_review,
              business_address,
              phone_number,
              zip_code,
              state,
              city,
              source_file
            FROM leads 
            WHERE ${conditions.join(' OR ')}
            ORDER BY created_at DESC
          `;
          
          logger.info(`Executing query ${queryIndex + 1}/${queriesNeeded} with ${conditions.length} conditions (combinations ${startIndex + 1}-${endIndex})...`);
          
          try {
            const leads = await getAll(query, params);
            
            // Post-query filtering: Validate that leads actually belong to the requested regions
            const validatedLeads = leads.filter(lead => {
              return this.validateLeadLocation(lead, batchCombinations);
            });
            
            // Add validated leads to the Map (using phone_number as key to avoid duplicates)
            validatedLeads.forEach(lead => {
              if (lead.phone_number) {
                allLeads.set(lead.phone_number, lead);
              }
            });
            
            logger.info(`Query ${queryIndex + 1}/${queriesNeeded} completed: found ${leads.length} raw leads, ${validatedLeads.length} validated (${allLeads.size} unique total)`);
            
          } catch (queryError) {
            logger.error(`Error in query ${queryIndex + 1}:`, queryError.message);
            // Continue with other queries even if one fails
          }
        }
        
        // Small delay between queries to prevent overwhelming the database
        if (queryIndex < queriesNeeded - 1) {
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
        }
      }

      // Convert Map values back to array
      const finalLeads = Array.from(allLeads.values());
      logger.info(`Found ${finalLeads.length} unique leads for job ${scrapingJobId} after deduplication`);

      // Generate filename (same format as scraper)
      const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
      const sanitizedListName = listName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedListName}_${timestamp}.xlsx`;
      const filePath = path.join(process.cwd(), 'Files', 'Deliveries', filename);

      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Apply filtering and formatting (reuse existing logic)
      const filteredAndFormattedLeads = this.applyFilteringAndFormatting(finalLeads, businessTypes);
      
      // Generate Excel file
      await this.generateExcelFile(filteredAndFormattedLeads, filePath);

      // UPDATE DATABASE WITH ACTUAL FILE COUNT - this is critical for accurate email reporting
      try {
        await runQuery(
          'UPDATE scraping_jobs SET leads_found = ? WHERE job_id = ?',
          [filteredAndFormattedLeads.length, scrapingJobId]
        );
        logger.info(`Updated job ${scrapingJobId} with correct lead count: ${filteredAndFormattedLeads.length}`);
      } catch (updateError) {
        logger.warn('Failed to update job lead count:', updateError.message);
      }

      logger.info(`Generated final file for job ${scrapingJobId}: ${filePath} with ${filteredAndFormattedLeads.length} leads`);
      return filePath;

    } catch (error) {
      logger.error(`Error generating final file for job ${scrapingJobId}:`, error);
      throw error;
    }
  }

  applyFilteringAndFormatting(leads, businessTypes) {
    if (!leads || leads.length === 0) return [];

    // Apply filtering logic (same as scraperProcessor)
    const MIN_REVIEW_COUNT = 4;
    
    let preSubcategoryCount = leads.length;
    let postBasicFilterCount = 0;
    let postSubcategoryFilterCount = 0;
    
    // Log what business types are being requested and which have filtering rules
    logger.info(`📋 REQUESTED BUSINESS TYPES: ${businessTypes.join(', ')}`);
    const businessTypesWithFiltering = businessTypes.filter(type => {
      const typeLower = type.toLowerCase();
      return SUB_CATEGORY_FILTERS[typeLower] || 
             Object.values(SUB_CATEGORY_FILTERS).some(subs => subs.some(sub => sub.toLowerCase() === typeLower));
    });
    const businessTypesWithoutFiltering = businessTypes.filter(type => {
      const typeLower = type.toLowerCase();
      return !SUB_CATEGORY_FILTERS[typeLower] && 
             !Object.values(SUB_CATEGORY_FILTERS).some(subs => subs.some(sub => sub.toLowerCase() === typeLower));
    });
    
    if (businessTypesWithFiltering.length > 0) {
      logger.info(`🔍 BUSINESS TYPES WITH SUBCATEGORY FILTERING: ${businessTypesWithFiltering.join(', ')}`);
    }
    if (businessTypesWithoutFiltering.length > 0) {
      logger.info(`⚠️  BUSINESS TYPES WITHOUT SUBCATEGORY FILTERING: ${businessTypesWithoutFiltering.join(', ')}`);
    }
    
    // Log sample of actual business types found in the data for debugging
    const actualBusinessTypes = [...new Set(leads.slice(0, 100).map(lead => lead.type_of_business).filter(Boolean))];
    logger.info(`📈 SAMPLE BUSINESS TYPES IN DATA: ${actualBusinessTypes.slice(0, 10).join(', ')}${actualBusinessTypes.length > 10 ? '...' : ''}`);
    
    // Count how many leads match each requested business type
    const businessTypeMatches = {};
    businessTypes.forEach(requestedType => {
      const count = leads.filter(lead => {
        const leadType = (lead.type_of_business || '').toLowerCase();
        const reqType = requestedType.toLowerCase();
        return leadType.includes(reqType) || reqType.includes(leadType);
      }).length;
      businessTypeMatches[requestedType] = count;
    });
    logger.info(`🎯 LEAD COUNTS BY REQUESTED TYPE: ${Object.entries(businessTypeMatches).map(([type, count]) => `${type}:${count}`).join(', ')}`);
    
    
    const filteredLeads = leads.filter(lead => {
      // 1. Basic field validation
      if (!lead.phone_number || String(lead.phone_number).trim() === '' || !lead.business_address || String(lead.business_address).trim() === '') return false;

      // 1.5 Address Country Check
      const addressStrLower = String(lead.business_address).toLowerCase();
      if (!addressStrLower.includes('united states') && !addressStrLower.includes('canada')) return false;
      
      // 2. Rating cannot be empty
      if (!lead.rating || String(lead.rating).trim() === '') return false;
      
      // 3. Latest Review Date cannot be empty
      if (!lead.latest_review || String(lead.latest_review).trim() === '') return false;
      
      // 4. Review count filter
      const numReviews = parseInt(String(lead.num_reviews || 0).replace(/,/g, ''), 10);
      if (isNaN(numReviews) || numReviews < MIN_REVIEW_COUNT) return false;
      
      postBasicFilterCount++;
      
      // 5. CRITICAL: Apply subcategory filtering based on business type requirements
      const leadBusinessType = (lead.type_of_business || '').toLowerCase().trim();
      const leadSubCategory = (lead.sub_category || '').toLowerCase().trim();
      
      // Check if this business type requires subcategory filtering with flexible matching
      const requiresSubcategoryFilter = businessTypes.some(requestedType => {
        const reqTypeLower = requestedType.toLowerCase().trim();
        
        // Direct lookup in filters
        if (SUB_CATEGORY_FILTERS[reqTypeLower]) {
          return leadBusinessType.includes(reqTypeLower) || reqTypeLower.includes(leadBusinessType);
        }
        
        // Flexible matching - check if lead's business type maps to any filtered category
        for (const [filterKey, allowedSubs] of Object.entries(SUB_CATEGORY_FILTERS)) {
          // Check if the requested type matches this filter category
          if (filterKey === reqTypeLower || 
              allowedSubs.some(allowed => allowed.toLowerCase() === reqTypeLower)) {
            // Check if the lead's business type or subcategory matches this category
            return allowedSubs.some(allowed => 
              leadBusinessType.includes(allowed.toLowerCase()) ||
              leadSubCategory.includes(allowed.toLowerCase())
            );
          }
        }
        
        return false;
      });
      
      if (requiresSubcategoryFilter) {
        // Find the matching business type from the request with flexible matching
        let matchingBusinessType = businessTypes.find(requestedType => {
          const reqTypeLower = requestedType.toLowerCase().trim();
          return leadBusinessType.includes(reqTypeLower) || reqTypeLower.includes(leadBusinessType);
        });
        
        // If no direct match, try flexible matching through filter categories
        if (!matchingBusinessType) {
          matchingBusinessType = businessTypes.find(requestedType => {
            const reqTypeLower = requestedType.toLowerCase().trim();
            
            for (const [filterKey, allowedSubs] of Object.entries(SUB_CATEGORY_FILTERS)) {
              if (filterKey === reqTypeLower || 
                  allowedSubs.some(allowed => allowed.toLowerCase() === reqTypeLower)) {
                return allowedSubs.some(allowed => 
                  leadBusinessType.includes(allowed.toLowerCase()) ||
                  leadSubCategory.includes(allowed.toLowerCase())
                );
              }
            }
            return false;
          });
        }
        
        if (matchingBusinessType) {
          const reqTypeLower = matchingBusinessType.toLowerCase().trim();
          
          // Find the appropriate filter rules for this business type
          let allowedSubcategories = SUB_CATEGORY_FILTERS[reqTypeLower];
          
          // If no direct match, find the filter category this business type belongs to
          if (!allowedSubcategories) {
            for (const [filterKey, allowedSubs] of Object.entries(SUB_CATEGORY_FILTERS)) {
              if (filterKey === reqTypeLower || 
                  allowedSubs.some(allowed => allowed.toLowerCase() === reqTypeLower)) {
                allowedSubcategories = allowedSubs;
                break;
              }
            }
          }
          
          if (allowedSubcategories && allowedSubcategories.length > 0) {
            // Check if lead's subcategory matches any of the allowed subcategories
            const subcategoryMatches = allowedSubcategories.some(allowed => 
              leadSubCategory.includes(allowed.toLowerCase())
            );
            
            if (!subcategoryMatches) {
              logger.info(`🚫 FILTERED OUT: ${lead.name_of_business} | Type: "${leadBusinessType}" | SubCategory: "${leadSubCategory}" | Requested: "${matchingBusinessType}" | Required: [${allowedSubcategories.join(', ')}]`);
              return false; // Filter out this lead
            } else {
              logger.debug(`✅ PASSED FILTER: ${lead.name_of_business} | Type: "${leadBusinessType}" | SubCategory: "${leadSubCategory}" | Requested: "${matchingBusinessType}"`);
            }
          }
        }
      }
      
      postSubcategoryFilterCount++;
      return true;
    });
    
    const basicFiltersRemoved = preSubcategoryCount - postBasicFilterCount;
    const subcategoryFiltersRemoved = postBasicFilterCount - postSubcategoryFilterCount;
    
    logger.info(`🔢 FILTERING SUMMARY:`);
    logger.info(`   📊 ${preSubcategoryCount} initial leads`);
    logger.info(`   ❌ ${basicFiltersRemoved} removed by basic filters (no phone/address, <4 reviews, no "ago", non-US)`);
    logger.info(`   🚫 ${subcategoryFiltersRemoved} removed by subcategory filters`);
    logger.info(`   ✅ ${postSubcategoryFilterCount} final leads after all filtering`);

    // Apply formatting
    const formattedLeads = filteredLeads.map(lead => {
      return {
        ...lead,
        // Title case formatting
        name_of_business: this.toTitleCase(lead.name_of_business),
        type_of_business: this.toTitleCase(lead.type_of_business),
        sub_category: this.toTitleCase(lead.sub_category),
        // Clean latest review to only include text up to and including "ago"
        latest_review: this.cleanLatestReview(lead.latest_review)
      };
    });

    // Enhanced sorting: Group by business types, sort by sub-categories within each type
    // Separate clean leads from combined/complex ones
    const cleanLeads = [];
    const combinedLeads = [];
    
    formattedLeads.forEach(lead => {
      const businessType = (lead.type_of_business || '').toLowerCase();
      const subCategory = (lead.sub_category || '').toLowerCase();
      
      // Consider leads "combined" if they have mixed indicators or complex classifications
      const isCombined = this.isLeadCombined(businessType, subCategory);
      
      if (isCombined) {
        combinedLeads.push(lead);
      } else {
        cleanLeads.push(lead);
      }
    });
    
    // Sort clean leads by business type and sub-category
    cleanLeads.sort((a, b) => {
      // 1. First by business type priority (RV parks, schools, others)
      const aPriority = this.getBusinessTypePriority(a.type_of_business);
      const bPriority = this.getBusinessTypePriority(b.type_of_business);
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // 2. Then by business type alphabetically
      const aType = (a.type_of_business || '').toLowerCase();
      const bType = (b.type_of_business || '').toLowerCase();
      
      if (aType !== bType) {
        return aType.localeCompare(bType);
      }
      
      // 3. Finally by sub-category alphabetically within same business type
      const aSubCat = (a.sub_category || '').toLowerCase();
      const bSubCat = (b.sub_category || '').toLowerCase();
      
      return aSubCat.localeCompare(bSubCat);
    });
    
    // Sort combined leads separately (for logging purposes only)
    combinedLeads.sort((a, b) => {
      const aType = (a.type_of_business || '').toLowerCase();
      const bType = (b.type_of_business || '').toLowerCase();
      
      if (aType !== bType) {
        return aType.localeCompare(bType);
      }
      
      const aSubCat = (a.sub_category || '').toLowerCase();
      const bSubCat = (b.sub_category || '').toLowerCase();
      
      return aSubCat.localeCompare(bSubCat);
    });
    
    // Only include clean leads - exclude combined leads entirely
    const sortedLeads = [...cleanLeads];
    
    // Log excluded combined leads for transparency
    if (combinedLeads.length > 0) {
      logger.info(`🚫 Excluded ${combinedLeads.length} combined leads from file generation`);
    }

    return sortedLeads;
  }

  toTitleCase(str) {
    if (!str) return '';
    return String(str).toLowerCase().replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
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

  cleanLatestReview(review) {
    if (!review) return '';

    let reviewStr = String(review).trim();

    // Convert raw date (YYYY-M-D) to relative format if not already converted
    if (!reviewStr.toLowerCase().includes('ago')) {
      reviewStr = convertToRelativeDate(reviewStr);
    }

    const agoIndex = reviewStr.toLowerCase().indexOf('ago');
    if (agoIndex !== -1) {
      return reviewStr.substring(0, agoIndex + 3).trim();
    }
    return reviewStr;
  }

  getBusinessTypePriority(businessType) {
    if (!businessType) return 2;
    
    const type = businessType.toLowerCase();
    
    // Priority 1: RV parks, mobile home parks, trailer parks, campgrounds (appear AFTER other businesses)
    if (['rv parks', 'mobile home parks', 'trailer parks', 'rv park', 'mobile home park', 'trailer park', 'campground', 'campgrounds'].includes(type)) {
      return 1;
    }
    
    // Priority 1: High schools and middle schools (appear AFTER other businesses)  
    if (['high school', 'high schools', 'middle school', 'middle schools'].includes(type)) {
      return 1;
    }
    
    // Priority 3: All other business types (appear BEFORE RV parks and schools)
    return 3;
  }

  isLeadCombined(businessType, subCategory) {
    // Consider leads "combined" if they have mixed indicators or complex classifications
    
    // Check for mixed business type indicators
    const mixedIndicators = [
      'and', '&', 'plus', '+', 'also', 'including', 'with',
      'multiple', 'various', 'mixed', 'combo', 'combination'
    ];
    
    const businessTypeLower = businessType.toLowerCase();
    const subCategoryLower = subCategory.toLowerCase();
    
    // Check if business type contains mixing words
    if (mixedIndicators.some(indicator => businessTypeLower.includes(indicator))) {
      return true;
    }
    
    // Check if sub-category contains mixing words
    if (mixedIndicators.some(indicator => subCategoryLower.includes(indicator))) {
      return true;
    }
    
    // Check for business type and sub-category mismatch patterns
    // (e.g., restaurant in a gym category, retail in factory category)
    const businessTypeWords = businessTypeLower.split(/\s+/);
    const subCategoryWords = subCategoryLower.split(/\s+/);
    
    // Look for obvious mismatches (simplified heuristic)
    const conflictingPairs = [
      ['factory', 'restaurant'], ['factory', 'retail'], ['factory', 'store'],
      ['gym', 'restaurant'], ['gym', 'retail'], ['gym', 'store'],
      ['school', 'restaurant'], ['school', 'retail'], ['school', 'store']
    ];
    
    for (const [typeWord, subWord] of conflictingPairs) {
      if (businessTypeWords.includes(typeWord) && subCategoryWords.includes(subWord)) {
        return true;
      }
      if (businessTypeWords.includes(subWord) && subCategoryWords.includes(typeWord)) {
        return true;
      }
    }
    
    // Default: not combined
    return false;
  }

  async generateExcelFile(leads, outputPath) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leads');

    // Define columns with proper widths - Source File moved to leftmost, Latest Review Date renamed
    const columns = [
      { header: 'Source File', key: 'source_file', width: 15 },
      { header: 'Type of Business', key: 'type_of_business', width: 20 },
      { header: 'Sub-Category', key: 'sub_category', width: 18 },
      { header: 'Name of Business', key: 'name_of_business', width: 30 },
      { header: 'Website', key: 'website', width: 25 },
      { header: '# of Reviews', key: 'num_reviews', width: 12 },
      { header: 'Rating', key: 'rating', width: 10 },
      { header: 'Latest Review', key: 'latest_review', width: 20 },
      { header: 'Business Address', key: 'business_address', width: 50 },
      { header: 'Phone Number', key: 'phone_number', width: 15 }
    ];

    worksheet.columns = columns;

    // Add leads as rows with new column order
    leads.forEach(lead => {
      worksheet.addRow({
        source_file: this.getFirstSourceOnly(lead.source_file),
        type_of_business: lead.type_of_business || '',
        sub_category: lead.sub_category || '',
        name_of_business: lead.name_of_business || '',
        website: lead.website || 'No website',
        num_reviews: lead.num_reviews || '',
        rating: lead.rating || '',
        latest_review: lead.latest_review || '',
        business_address: lead.business_address || '',
        phone_number: lead.phone_number || ''
      });
    });

    await workbook.xlsx.writeFile(outputPath);
    logger.info(`📊 Excel file generated at ${outputPath} with ${leads.length} leads.`);
  }

  generateCSVContent(leads) {
    if (leads.length === 0) {
      return 'name_of_business,type_of_business,website,phone_number,email,business_address\n';
    }

    const headers = ['name_of_business', 'type_of_business', 'website', 'phone_number', 'email', 'business_address'];
    const csvRows = [headers.join(',')];

    leads.forEach(lead => {
      const row = headers.map(header => {
        const value = lead[header] || '';
        // Escape quotes and wrap in quotes if contains comma
        return value.toString().includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  async sendCompletionEmail(requestId, filePath, scrapingJob) {
    try {
      const request = await getOne(
        'SELECT * FROM sheets_job_requests WHERE request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error(`Request not found: ${requestId}`);
      }

      const jobRequest = {
        nameOfList: request.name_of_list,
        businessTypes: JSON.parse(request.business_types),
        locations: JSON.parse(request.locations)
      };

      const jobStats = {
        leadsFound: scrapingJob.leads_found || 0,
        queriesProcessed: scrapingJob.queries_generated || 0,
        processingTime: this.calculateProcessingTime(scrapingJob.started_at, scrapingJob.completed_at)
      };

      await gmailService.sendCompletionEmail(
        process.env.TO_EMAIL || 'safee.bangash@gmail.com',
        jobRequest,
        filePath,
        jobStats
      );

      logger.info(`Completion email sent for request: ${requestId}`);

    } catch (error) {
      logger.error(`Error sending completion email for request ${requestId}:`, error);
      throw error;
    }
  }

  calculateProcessingTime(startTime, endTime) {
    if (!startTime || !endTime) return 'N/A';
    
    const start = moment(startTime);
    const end = moment(endTime);
    const duration = moment.duration(end.diff(start));
    
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  generateSearchQueries(businessTypes, locations) {
    const queries = [];

    businessTypes.forEach(businessType => {
      locations.forEach(location => {
        queries.push({
          businessType,
          location,
          query: `${businessType} near ${location}`
        });
      });
    });

    return queries;
  }

  // Admin methods
  async addSheetConfig(configName, spreadsheetId, sheetRange, notificationEmail) {
    try {
      await runQuery(`
        INSERT INTO sheets_config (config_name, spreadsheet_id, sheet_range, notification_email)
        VALUES (?, ?, ?, ?)
      `, [configName, spreadsheetId, sheetRange, notificationEmail]);

      logger.info(`Added sheet config: ${configName}`);
      return { success: true, message: 'Sheet configuration added successfully' };

    } catch (error) {
      logger.error(`Error adding sheet config ${configName}:`, error);
      throw error;
    }
  }

  async getSheetConfigs() {
    return getAll('SELECT * FROM sheets_config ORDER BY created_at DESC', []);
  }

  async updateSheetConfig(configId, updates) {
    try {
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(configId);

      await runQuery(
        `UPDATE sheets_config SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      logger.info(`Updated sheet config: ${configId}`);
      return { success: true, message: 'Sheet configuration updated successfully' };

    } catch (error) {
      logger.error(`Error updating sheet config ${configId}:`, error);
      throw error;
    }
  }

  async deleteSheetConfig(configId) {
    try {
      await runQuery('DELETE FROM sheets_config WHERE id = ?', [configId]);
      logger.info(`Deleted sheet config: ${configId}`);
      return { success: true, message: 'Sheet configuration deleted successfully' };
    } catch (error) {
      logger.error(`Error deleting sheet config ${configId}:`, error);
      throw error;
    }
  }

  validateLeadLocation(lead, batchCombinations) {
    // Validate that the lead actually belongs to one of the requested locations
    if (!lead.business_address && !lead.zip_code && !lead.city && !lead.state) {
      return false; // No location data
    }
    
    // Check if the lead matches any of the requested locations in this batch
    return batchCombinations.some(({ location }) => {
      const isZipCode = /^\d{5}(-\d{4})?$/.test(location.trim());
      
      if (isZipCode) {
        // For zip codes: check exact match or prefix match
        const leadZip = lead.zip_code || '';
        const leadAddress = (lead.business_address || '').toLowerCase();
        const last30CharsOfAddress = leadAddress.slice(-30);
        
        return (
          leadZip === location ||                           // Exact zip match
          leadZip.startsWith(location) ||                   // Zip prefix match
          last30CharsOfAddress.includes(location)           // Address contains zip (last 30 chars only)
        );
      } else {
        // For city/state names: check various location fields
        const leadCity = (lead.city || '').toLowerCase();
        const leadState = (lead.state || '').toLowerCase();
        const leadAddress = (lead.business_address || '').toLowerCase();
        const searchLocation = location.toLowerCase();
        
        return (
          leadCity === searchLocation ||                    // Exact city match
          leadCity.startsWith(searchLocation) ||           // City prefix match
          leadState === searchLocation ||                   // Exact state match
          (searchLocation.length === 2 && leadState.includes(searchLocation)) ||  // State code match
          leadAddress.includes(searchLocation)             // Address contains location
        );
      }
    });
  }
}

module.exports = new GoogleSheetsWorkflowService(); 