const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');
const { scraperLogger } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const googleSheetsWorkflowService = require('../../services/googleSheetsWorkflowService');
const LeadOptimizationService = require('../../services/leadOptimizationService');
const {
  groupQueriesByBusinessType,
  executeDockerScraper,
  convertToRelativeDate,
} = require('./dockerScraper');

const business_filters = {
    "rv park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "mobile home park":['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "trailer park": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "rv parks": ['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
    "mobile home parks":['rv park', 'campground', 'mobile home park', 'trailer park', 'no category','rv parks', 'campgrounds', 'mobile home parks', 'trailer parks'],
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
    "warehouse":["warehouse", "manufacturer", "logistics service"],
    "warehouses":["warehouse", "manufacturer","manufacturers", "logistics service"],
    "factories":["manufacturer","manufacturers"],
    "factory":["manufacturer"]
};

// Constants for lead filtering
const MIN_REVIEW_COUNT = 4;
const REQUIRED_REVIEW_TEXT = "ago";
const US_ADDRESS_MARKER = "United States";
const SCRAPED_NEW_SOURCE_NAME = "Not in any file"; // Source name for newly scraped leads
// const STATE_FILTER_ENABLED = false; // Set to true to enable state-specific filtering
// const TARGET_STATES = ['WA']; // Define target states if STATE_FILTER_ENABLED is true

const UNWANTED_PLACEHOLDERS = {
    '#_of_Reviews': 'No reviews', // Assuming keys are consistent with CSV/object properties
    'Rating': 'No ratings',
    'Latest_Review_Date': 'No review date', // Covers "Latest Review" and "Latest Review Date"
    'Latest_Review': 'No review date',
    'Phone_Number': 'No phone number',
    'Business_Address': 'No address'
};

const column_widths_excel = [
    { key: 'Type of Business', width: 20 },
    { key: 'Sub-Category', width: 18 },
    { key: 'Name of Business', width: 30 },
    { key: 'Website', width: 25 },
    { key: '# of Reviews', width: 12 },
    { key: 'Rating', width: 10 },
    { key: 'Latest Review Date', width: 20 },
    { key: 'Business Address', width: 50 },
    { key: 'Phone Number', width: 15 },
    { key: 'Source File', width: 15 }
];

// Import database functions with error handling
let runQuery, getOne, getAll;
try {
  const db = require('../../database/setup');
  runQuery = db.runQuery;
  getOne = db.getOne;
  getAll = db.getAll;
} catch (error) {
  scraperLogger.warn('Database functions not available, using mock operations');
}

// Helper function to count rows in a CSV file
async function countCsvRows(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    const readStream = require('fs').createReadStream(filePath);

    readStream.on('error', (err) => {
        scraperLogger.warn(`Error creating read stream for ${filePath} during count: ${err.message}`);
        resolve(0); // Resolve with 0 if file can't be read
    });

    readStream.pipe(csv()) // Use the imported 'csv'
      .on('data', () => count++)
      .on('end', () => {
        scraperLogger.info(`Counted ${count} rows in ${filePath}`);
        resolve(count);
      })
      .on('error', (error) => {
        scraperLogger.error(`Error parsing CSV for counting rows in ${filePath}: ${error.message}`);
        resolve(0); // Resolve with 0 if parsing fails
      });
  });
}

// Helper function to clean zip codes (preserves leading zeros)
function cleanZipCode(zip) {
  if (!zip) return null;
  
  // Convert to string if it's a number
  let zipStr = zip.toString().trim();
  
  // Extract all digits
  const digits = zipStr.replace(/[^0-9]/g, '');
  
  if (digits.length >= 5) {
    // Take last 5 digits and pad with leading zeros if needed
    const lastFive = digits.slice(-5);
    return lastFive.padStart(5, '0'); // Ensures 5-digit format with leading zeros
  }
  
  // If less than 5 digits but at least 3, pad to 5 digits
  if (digits.length >= 3) {
    return digits.padStart(5, '0');
  }
  
  return null; // Return null if not a valid zip
}

// Helper function to extract state and zip code from address (similar to import_lead_files.js)
function extractLocationFromScrapedAddress(address) {
  if (!address || typeof address !== 'string') return { city: null, state: null, zipCode: null };
  
  // Common patterns for US addresses
  const stateZipPattern = /,\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)/i; // Added i for case-insensitive state
  const statePattern = /,\s*([A-Z]{2})(?:\s|,|$)/i; // Added i for case-insensitive state
  const zipPattern = /\b(\d{5}(-\d{4})?)\b/; // Corrected: ) instead of }
  
  let state = null;
  let zipCode = null;
  let city = null;
  
  const stateZipMatch = address.match(stateZipPattern);
  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase();
    zipCode = stateZipMatch[2];
  } else {
    const stateMatch = address.match(statePattern);
    if (stateMatch) {
      state = stateMatch[1].toUpperCase();
    }
    const zipMatch = address.match(zipPattern);
    if (zipMatch) {
      zipCode = zipMatch[1];
    }
  }
  
  if (state) {
    const cityPatternStr = `([^,]+),\\s*${state}`;
    const cityPattern = new RegExp(cityPatternStr, 'i'); // Added i for case-insensitive
    const cityMatch = address.match(cityPattern);
    if (cityMatch && cityMatch[1]) {
      const cityPart = cityMatch[1].trim();
      const cityWords = cityPart.split(',');
      city = cityWords[cityWords.length - 1].trim();
    }
  } else if (zipCode) { // If no state, try to get city based on zip if address is simple
    const cityZipPattern = new RegExp(`([^,]+),\\s*${zipCode.substring(0,5)}`, 'i');
    const cityMatchSimple = address.match(cityZipPattern);
    if (cityMatchSimple && cityMatchSimple[1]) {
        city = cityMatchSimple[1].trim();
    }
  }
  
  return { city, state, zipCode: cleanZipCode(zipCode) }; // Ensure parsed zip is also cleaned
}

async function scraperProcessor(job) {
  const jobData = job.data;
  const jobId = jobData.jobId || job.id;
  
  // Handle different job data structures
  let queries = [];
  let clientName = 'Unknown';
  
  if (jobData.queries && Array.isArray(jobData.queries)) {
    // Old format with queries array
    queries = jobData.queries;
    clientName = jobData.clientName || 'Unknown';
  } else if (jobData.businessType && jobData.location) {
    // New format from conversation API
    queries = [{
      businessType: jobData.businessType,
      query: jobData.query || `${jobData.businessType} in ${jobData.location}`,
      location: jobData.location,
      maxResults: jobData.maxResults || 15
    }];
    clientName = 'AI Assistant';
  } else {
    throw new Error('Invalid job data structure: missing queries or businessType/location');
  }
  
  scraperLogger.info(`🎯 SCRAPER PROCESSOR STARTING for job ${jobId}`, { 
    clientName, 
    queriesCount: queries.length,
    jobData: jobData
  });
  
  try {
    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, started_at = CURRENT_TIMESTAMP WHERE job_id = ?',
          ['processing', jobId]
        );
        scraperLogger.info('✅ Updated job status to processing');
      } catch (dbError) {
        scraperLogger.warn('Database update failed, continuing...', dbError.message);
      }
    }

    // Update progress
    if (job.progress) {
      job.progress(5);
    }

    // 🧠 SMART LEAD CHECKING: Check existing leads and optimize queries
    const { optimizedQueries, existingLeads } = await checkExistingLeadsAndOptimizeQueries(queries);
    
    scraperLogger.info(`📊 Lead Analysis Complete`, {
      originalQueries: queries.length,
      optimizedQueries: optimizedQueries.length,
      existingLeads: existingLeads.length,
      skipReason: optimizedQueries.length === 0 ? 'All leads already exist' : 'Some leads missing'
    });

    // Update progress
    if (job.progress) {
      job.progress(15);
    }

    let newLeadsCount = 0;
    let scrapedLeads = [];

    // Only scrape if we have missing data
    if (optimizedQueries.length > 0) {
      // Clear any existing LeadsApart.csv file before starting new scrape
      let csvFile;
      if (process.env.LEADS_APART_FILE) {
        csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE);
      } else {
        csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
      }
      
      try {
        await fs.unlink(csvFile);
        scraperLogger.info(`🗑️ Cleared existing scraped data file: ${csvFile}`);
      } catch (clearError) {
        // File might not exist, which is fine
        if (clearError.code !== 'ENOENT') {
          scraperLogger.warn(`Failed to clear existing scraped data file: ${clearError.message}`);
        }
      }

      // Write optimized queries to queries.txt file
      const queriesFile = process.env.QUERIES_FILE || './queries.txt';
      const queriesContent = optimizedQueries.map(q => `"${q.businessType}", "${q.query}"`).join('\n');
      await fs.writeFile(queriesFile, queriesContent, 'utf8');
      
      scraperLogger.info(`📝 Written ${optimizedQueries.length} optimized queries to ${queriesFile}`);

      if (job.progress) {
        job.progress(20);
    }

    // Execute Docker scraper
      const scraperResult = await executeDockerScraper(job, optimizedQueries);
    
      if (job.progress) {
        job.progress(70);
      }

      // Process the scraped results
      scrapedLeads = await getScrapedLeads();
      
      // Save newly scraped leads to the database immediately
      if (scrapedLeads && scrapedLeads.length > 0) {
        const savedToDbCount = await saveNewLeadsToDatabase(scrapedLeads, jobId, jobData);
        scraperLogger.info(`💾 Saved ${savedToDbCount} new scraped leads to database`);
      }
      newLeadsCount = scrapedLeads.length;
      
      scraperLogger.info(`🔍 Scraped ${newLeadsCount} new leads from CSV`);
    } else {
      scraperLogger.info(`⚡ Skipping scraping - all requested leads already exist in database`);
    }
    
    if (job.progress) {
      job.progress(80);
    }

    // Get the Google Sheet name for proper file naming
    let requestedFileName = null;
    try {
      const sheetRequest = await getOne(
        'SELECT name_of_list FROM sheets_job_requests WHERE scraping_job_id = ?',
        [jobId]
      );
      if (sheetRequest) {
        requestedFileName = sheetRequest.name_of_list;
        scraperLogger.info(`Found Google Sheet name for file: ${requestedFileName}`);
      }
    } catch (sheetError) {
      scraperLogger.debug('Not a Google Sheet job or could not get sheet name');
    }
    
    scraperLogger.info(`📋 Final Results`, {
      existingLeadsFromInitialCheck: existingLeads.length,
      newLeadsFromScrape: newLeadsCount,
      note: "File will be generated from database by Google Sheets workflow"
    });
    
    // No file creation here - Google Sheets workflow will generate from database

    // Update progress
    if (job.progress) {
      job.progress(90);
    }

    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, leads_found = ?, result = ? WHERE job_id = ?',
          ['completed', newLeadsCount, JSON.stringify({
            outputFile: requestedFileName,
            existingLeads: existingLeads.length,
            newLeads: newLeadsCount,
            totalLeads: newLeadsCount
          }), jobId]
        );
        scraperLogger.info('✅ Updated job status to completed');
        
        // Trigger Google Sheets workflow completion handling for Gmail delivery
        try {
          await googleSheetsWorkflowService.handleJobCompletion(jobId, requestedFileName);
          scraperLogger.info('📧 Gmail delivery workflow triggered successfully');
        } catch (sheetsError) {
          scraperLogger.warn('Gmail delivery workflow failed:', sheetsError.message);
          // Don't fail the entire job if Gmail delivery fails
        }
      } catch (dbError) {
        scraperLogger.warn('Database update failed, continuing...', dbError.message);
      }
    }

    // Update progress
    if (job.progress) {
      job.progress(100);
    }

    scraperLogger.info(`✅ SCRAPER PROCESSOR COMPLETED: Job ${jobId} finished successfully`, { 
      leadsFound: newLeadsCount,
      existingLeads: existingLeads.length,
      newLeads: newLeadsCount,
      outputFile: requestedFileName
    });
    
    return {
      success: true,
      leadsFound: newLeadsCount,
      existingLeads: existingLeads.length,
      newLeads: newLeadsCount,
      message: newLeadsCount > 0 ? 
        `Found ${newLeadsCount} new leads, combined with ${existingLeads.length} existing leads` :
        `Returned ${existingLeads.length} existing leads (no scraping needed)`,
      queries: queries.length,
      optimizedQueries: optimizedQueries.length,
      clientName: clientName,
      outputFile: requestedFileName
    };

  } catch (error) {
    scraperLogger.error(`❌ SCRAPER PROCESSOR FAILED: Job ${jobId}`, { error: error.message, stack: error.stack });
    
    // Update job status in database (with fallback)
    if (runQuery) {
      try {
        await runQuery(
          'UPDATE scraping_jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
          ['failed', error.message, jobId]
        );
      } catch (dbError) {
        scraperLogger.warn('Database update failed during error handling');
      }
    }

    throw error;
  }
}

async function processScrapedData(jobId) {
  let csvFile;
  if (process.env.LEADS_APART_FILE) {
    scraperLogger.info(`Using LEADS_APART_FILE from env: ${process.env.LEADS_APART_FILE}`);
    csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE); // Assume it might be relative
  } else {
    scraperLogger.info('LEADS_APART_FILE not set in env, using default: ./Outputs/LeadsApart.csv');
    csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
  }
  scraperLogger.info(`Attempting to access scraped data at: ${csvFile}`);
  
  try {
    const stats = await fs.stat(csvFile);
    if (!stats.isFile()) {
      scraperLogger.warn(`Scraped data file not found: ${csvFile}, returning 0 leads`);
      return 0;
    }

    // Count leads in the CSV file
    let leadsCount = 0;

    return new Promise((resolve, reject) => {
      const stream = require('fs').createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
          leadsCount++;
          // Optional: Process individual rows here
        })
        .on('end', () => {
          scraperLogger.info(`📊 Processed ${leadsCount} leads from ${csvFile}`);
          resolve(leadsCount);
        })
        .on('error', (error) => {
          scraperLogger.error(`❌ Error processing scraped data: ${error.message}`);
          reject(error);
        });
    });

  } catch (error) {
    scraperLogger.warn(`Error accessing scraped data file: ${error.message}, returning 0 leads`);
    return 0;
  }
}

  // 🧠 Smart function to check existing leads and optimize queries using advanced logic
async function checkExistingLeadsAndOptimizeQueries(queries) {
  try {
    const leadOptimizer = new LeadOptimizationService();
    const result = await leadOptimizer.checkExistingLeadsAndOptimizeQueries(queries);
    
    scraperLogger.info(`🧠 Advanced optimization complete: ${result.optimizedQueries.length} queries to scrape, ${result.existingLeads.length} existing leads found`);
    
    return result;
    
  } catch (error) {
    scraperLogger.error('❌ Error in advanced lead optimization, falling back to simple logic:', error);
    
    // Fallback to simple logic
    const optimizedQueries = [];
    const seenCombos = new Set();
    
    for (const query of queries) {
      const businessTypes = parseBusinessTypes(query.businessType);
      const locations = parseLocations(query.location);
      
      for (const businessType of businessTypes) {
        for (const location of locations) {
          const comboKey = `${businessType}|${location}`.toLowerCase();
          if (!seenCombos.has(comboKey)) {
            seenCombos.add(comboKey);
            optimizedQueries.push({
              businessType: businessType,
              location: location,
              query: `${businessType} in ${location}`,
              maxResults: query.maxResults || 15
            });
          }
        }
      }
    }
    
    scraperLogger.warn(`🔄 Fallback: Generated ${optimizedQueries.length} distinct combinations for scraping`);
    return { optimizedQueries, existingLeads: [] };
  }
}

// Legacy bulk query function - now replaced by LeadOptimizationService
// Keeping for potential fallback scenarios
async function checkExistingLeadsBulk(combinations) {
  if (!getAll || combinations.length === 0) return [];
  
  try {
    scraperLogger.info(`🔍 Using legacy bulk query for ${combinations.length} combinations`);
    
    // Build dynamic OR conditions for all combinations
    const conditions = [];
    const params = [];
    
    combinations.forEach(combo => {
      conditions.push(`
        (
          (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
          AND (
            LOWER(business_address) LIKE LOWER(?) 
            OR LOWER(zip_code) = LOWER(?)
            OR LOWER(city) LIKE LOWER(?)
            OR LOWER(state) LIKE LOWER(?)
          )
        )
      `);
      
      params.push(
        `%${combo.businessType}%`,
        `%${combo.businessType}%`,
        `%${combo.location}%`,
        combo.location,
        `%${combo.location}%`,
        `%${combo.location}%`
      );
    });
    
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
    `;
    
    const leads = await getAll(query, params);
    scraperLogger.info(`📊 Legacy bulk query found ${leads?.length || 0} leads`);
    
    return leads || [];
    
  } catch (error) {
    scraperLogger.error(`❌ Error in legacy bulk lead query:`, error.message);
    return [];
  }
}

// Check existing leads for a specific business type and location
async function checkExistingLeadsForLocation(businessType, location) {
  if (!getAll) return [];
  
  try {
    scraperLogger.info(`🔍 Searching for business type: "${businessType}" in location: "${location}"`);

    // Query database for existing leads with more precise matching
    const query = `
      SELECT 
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
      WHERE 
        (LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))
        AND (
          LOWER(business_address) LIKE LOWER(?) 
          OR LOWER(zip_code) = LOWER(?)
          OR LOWER(city) LIKE LOWER(?)
          OR LOWER(state) LIKE LOWER(?)
        )
    `;

    // Prepare parameters array
    const params = [
      `%${businessType}%`, 
      `%${businessType}%`,
      `%${location}%`, 
      location, 
      `%${location}%`, 
      `%${location}%`
    ];

    scraperLogger.info(`🔍 Executing query with params: ${JSON.stringify(params)}`);
    
    const leads = await getAll(query, params);
    
    scraperLogger.info(`📊 Found ${leads?.length || 0} leads for business type: "${businessType}" in location: "${location}"`);
    
    return leads || [];
    
  } catch (error) {
    scraperLogger.error(`❌ Error checking existing leads for ${businessType} in ${location}:`, error.message);
    scraperLogger.error(`Stack trace:`, error.stack);
    return [];
  }
}

// Helper function to parse business types from input
function parseBusinessTypes(businessTypesString) {
  if (!businessTypesString) return [];
  
  // First split by commas, then handle conjunctions
  const types = businessTypesString
    .split(/[,;]/) // Split by commas or semicolons
    .map(type => type.trim())
    .flatMap(type => {
      // Split by common conjunctions while preserving phrases
      return type
        .split(/\s+(?:and|&|or|\+)\s+/i)
        .map(t => t.trim())
        .filter(t => t.length > 0);
    })
    .filter(type => type.length > 0)
    .map(type => type.replace(/['"]/g, '')) // Remove quotes
    .filter(type => type.length > 0); // Filter again after quote removal
    
  // Remove duplicates (case-insensitive)
  const uniqueTypes = [];
  const seenTypes = new Set();
  
  for (const type of types) {
    const lowerType = type.toLowerCase();
    if (!seenTypes.has(lowerType)) {
      seenTypes.add(lowerType);
      uniqueTypes.push(type);
    }
  }
    
  scraperLogger.info(`🔧 Parsed business types: ${JSON.stringify(uniqueTypes)}`);
  return uniqueTypes.length > 0 ? uniqueTypes : [businessTypesString];
}

// Helper function to parse locations from input
function parseLocations(locationString) {
  if (!locationString) return [];
  
  // Split by commas, semicolons, and handle common separators
  const locations = locationString
    .split(/[,;|]/) // Split by commas, semicolons, or pipes
    .map(loc => loc.trim())
    .filter(loc => loc.length > 0)
    .map(loc => loc.replace(/['"]/g, '')) // Remove quotes
    .filter(loc => loc.length > 0); // Filter again after quote removal
    
  // Remove duplicates (case-insensitive)
  const uniqueLocations = [];
  const seenLocations = new Set();
  
  for (const location of locations) {
    const lowerLocation = location.toLowerCase();
    if (!seenLocations.has(lowerLocation)) {
      seenLocations.add(lowerLocation);
      uniqueLocations.push(location);
    }
  }
    
  scraperLogger.info(`🔧 Parsed locations: ${JSON.stringify(uniqueLocations)}`);
  return uniqueLocations.length > 0 ? uniqueLocations : [locationString];
}

// Get scraped leads from the output file
async function getScrapedLeads() {
  let csvFile;
  if (process.env.LEADS_APART_FILE) {
    // Not logging here to avoid duplicate logs from processScrapedData
    csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE);
  } else {
    csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
  }
  const leads = [];
  
  try {
    const fileExists = await fs.access(csvFile).then(() => true).catch(() => false);
    if (!fileExists) {
      return leads;
    }

    return new Promise((resolve, reject) => {
      const stream = require('fs').createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
          leads.push(row);
        })
        .on('end', () => {
          resolve(leads);
        })
        .on('error', (error) => {
          scraperLogger.error(`❌ Error reading scraped leads: ${error.message}`);
          resolve([]);
        });
    });

  } catch (error) {
    scraperLogger.warn(`Error accessing scraped leads file: ${error.message}`);
    return leads;
  }
}

// Helper function to generate Excel file
async function generateExcelFile(leadsArray, outputPath) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leads');

    const headers = column_widths_excel.map(cw => ({ header: cw.key, key: cw.key, width: cw.width }));
    worksheet.columns = headers;

    worksheet.addRows(leadsArray);

    await workbook.xlsx.writeFile(outputPath);
    scraperLogger.info(`📊 Excel file generated at ${outputPath} with ${leadsArray.length} leads.`);
}

// Save newly scraped (and now filtered) leads to the database with advanced deduplication
async function saveNewLeadsToDatabase(leads, jobId, jobData) {
  if (!runQuery || !leads || leads.length === 0) return 0;

  // Handle different job data structures for business types
  let businessTypes = [];
  if (jobData && jobData.businessTypes && Array.isArray(jobData.businessTypes)) {
    // Google Sheets jobs - business types are already parsed as array
    businessTypes = jobData.businessTypes;
  } else if (jobData && jobData.businessType) {
    // Conversation API jobs - business type is a string that needs parsing
    businessTypes = parseBusinessTypes(jobData.businessType);
  }
  
  const primaryJobTypesLowerCase = businessTypes.map(type => type.toLowerCase());
  let savedCount = 0;
  let filteredOutCount = 0;
  let duplicatesFound = 0;

  for (const lead of leads) {
    // Apply the comprehensive filters
    if (!applyLeadFilters(lead, primaryJobTypesLowerCase)) {
      filteredOutCount++;
      continue; // Skip this lead if it doesn't pass filters
    }

    // Standardize lead data for DB insertion, similar to import_lead_files.js
    const nameOfBusiness = getLeadValue(lead, 'Name of Business', 'name_of_business');
    const typeOfBusiness = getLeadValue(lead, 'Type of Business', 'type_of_business');
    const subCategory = getLeadValue(lead, 'Sub-Category', 'sub_category');
    const website = getLeadValue(lead, 'Website', 'website');
    const numReviewsRaw = getLeadValue(lead, '# of Reviews', 'num_reviews');
    const ratingRaw = getLeadValue(lead, 'Rating', 'rating');
    let latestReview = getLeadValue(lead, 'Latest Review Date', 'latest_review', 'Latest Review');
    const businessAddress = getLeadValue(lead, 'Business Address', 'business_address');
    const phoneNumber = getLeadValue(lead, 'Phone Number', 'phone_number');

    // Clean/transform data for DB
    const numReviews = numReviewsRaw ? parseInt(String(numReviewsRaw).replace(/,/g, ''), 10) : null;
    const rating = ratingRaw ? parseFloat(String(ratingRaw)) : null;

    // Convert raw date (YYYY-M-D) to relative string if not already in "ago" format
    if (latestReview && typeof latestReview === 'string') {
        if (!latestReview.toLowerCase().includes('ago')) {
            latestReview = convertToRelativeDate(latestReview.trim());
        }
        // Trim to text up to and including "ago"
        const agoIndex = latestReview.toLowerCase().indexOf(REQUIRED_REVIEW_TEXT);
        if (agoIndex !== -1) {
            latestReview = latestReview.substring(0, agoIndex + REQUIRED_REVIEW_TEXT.length).trim();
        } else {
            latestReview = null;
        }
    } else {
        latestReview = null;
    }

    const { city, state, zipCode } = extractLocationFromScrapedAddress(businessAddress);

    // Create lead data object similar to import script
    const leadData = {
      nameOfBusiness: nameOfBusiness || '',
      typeOfBusiness: typeOfBusiness || '',
      subCategory: subCategory || '',
      website: website || null,
      phoneNumber: phoneNumber || null,
      email: null, // Scraped leads typically don't have email
      businessAddress: businessAddress || '',
      city: city,
      state: state,
      zipCode: zipCode,
      rating: isNaN(rating) ? null : rating,
      numReviews: isNaN(numReviews) ? null : numReviews,
      latestReview: latestReview,
      notes: null,
      sourceFile: SCRAPED_NEW_SOURCE_NAME,
      jobId: jobId
    };

    try {
      // Use advanced deduplication like import script
      const deduplicationResult = await handleScrapedLeadDeduplication(leadData);
      
      if (deduplicationResult.isDuplicate) {
        duplicatesFound++;
      } else {
        savedCount++;
      }
      
    } catch (error) {
      scraperLogger.error(`Error saving lead to DB: ${nameOfBusiness} - ${error.message}`);
    }
  }
  
  scraperLogger.info(`Filtered out ${filteredOutCount} leads before DB insertion. Saved ${savedCount} new leads, ${duplicatesFound} duplicates merged to DB.`);
  return savedCount;
}

// Simplified deduplication function for scraped leads (always update data, preserve source)
async function handleScrapedLeadDeduplication(leadData) {
  try {
    // Check for existing lead by phone number AND name (more precise matching)
    const existingLead = await getOne(`
      SELECT * FROM leads 
      WHERE phone_number = ? AND LOWER(TRIM(name_of_business)) = LOWER(TRIM(?))
    `, [leadData.phoneNumber, leadData.nameOfBusiness]);

    if (existingLead) {
      // Duplicate found - always update with newer scraped data
      let finalSource;
      
      // Preserve existing source if it's a real filename or "Not in any list"
      if (existingLead.source_file === "Not in any list" || 
          (existingLead.source_file !== "Not in any file" && existingLead.source_file)) {
        // Keep the existing source (real filename or "Not in any list")
        finalSource = existingLead.source_file;
      } else {
        // Use the new scraped source
        finalSource = leadData.sourceFile;
      }
       
      // Always update with newer scraped data
      await runQuery(`
        UPDATE leads SET
          name_of_business = ?,
          type_of_business = ?,
          sub_category = ?,
          website = ?,
          email = ?,
          business_address = ?,
          city = ?,
          state = ?,
          zip_code = ?,
          rating = ?,
          num_reviews = ?,
          latest_review = ?,
          notes = ?,
          source_file = ?,
          job_id = ?,
          scraped_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE phone_number = ? AND LOWER(TRIM(name_of_business)) = LOWER(TRIM(?))
      `, [
        leadData.nameOfBusiness,
        leadData.typeOfBusiness,
        leadData.subCategory,
        leadData.website,
        leadData.email,
        leadData.businessAddress,
        leadData.city,
        leadData.state,
        leadData.zipCode,
        leadData.rating,
        leadData.numReviews,
        leadData.latestReview,
        leadData.notes,
        finalSource,
        leadData.jobId,
        leadData.phoneNumber,
        leadData.nameOfBusiness
      ]);
      
      return { isDuplicate: true };
      
    } else {
      // No duplicate - insert new lead
      await runQuery(`
        INSERT INTO leads (
          job_id, name_of_business, type_of_business, sub_category, website, phone_number, email,
          business_address, city, state, zip_code, rating, num_reviews, latest_review,
          notes, source_file, scraped_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        leadData.jobId,
        leadData.nameOfBusiness,
        leadData.typeOfBusiness,
        leadData.subCategory,
        leadData.website,
        leadData.phoneNumber,
        leadData.email,
        leadData.businessAddress,
        leadData.city,
        leadData.state,
        leadData.zipCode,
        leadData.rating,
        leadData.numReviews,
        leadData.latestReview,
        leadData.notes,
        leadData.sourceFile
      ]);
      
      return { isDuplicate: false };
    }
    
  } catch (error) {
    scraperLogger.error(`Error handling scraped lead deduplication: ${error.message}`);
    throw error;
  }
}

// Helper function to get a value from a lead object, checking multiple possible keys
function getLeadValue(lead, primaryKey, secondaryKey = null, tertiaryKey = null) {
    if (lead && typeof lead === 'object') {
        if (primaryKey in lead && lead[primaryKey] !== null && lead[primaryKey] !== undefined) return lead[primaryKey];
        if (secondaryKey && secondaryKey in lead && lead[secondaryKey] !== null && lead[secondaryKey] !== undefined) return lead[secondaryKey];
        if (tertiaryKey && tertiaryKey in lead && lead[tertiaryKey] !== null && lead[tertiaryKey] !== undefined) return lead[tertiaryKey];
    }
    return ''; // Return empty string for consistency if not found or lead is not an object
}

// Comprehensive lead filtering function
function applyLeadFilters(lead, primaryJobTypesLowerCase) {
    if (!lead || typeof lead !== 'object') return false;

    // Standardize access to lead fields using a helper
    const typeOfBusinessRaw = getLeadValue(lead, 'Type of Business', 'type_of_business');
    const subCategoryRaw = getLeadValue(lead, 'Sub-Category', 'sub_category');
    const reviewsRaw = getLeadValue(lead, '# of Reviews', 'num_reviews'); // Handles both '# of Reviews' and 'num_reviews'
    const ratingRaw = getLeadValue(lead, 'Rating', 'rating');
    const latestReviewRaw = getLeadValue(lead, 'Latest Review Date', 'latest_review', 'Latest Review');
    const phoneRaw = getLeadValue(lead, 'Phone Number', 'phone_number');
    const addressRaw = getLeadValue(lead, 'Business Address', 'business_address');

    const typeOfBusiness = String(typeOfBusinessRaw).toLowerCase();
    const subCategory = String(subCategoryRaw).toLowerCase();
    const reviewsStr = String(reviewsRaw);
    const ratingStr = String(ratingRaw);
    let latestReviewStr = String(latestReviewRaw);
    // Convert raw date to relative format before filtering so "ago" check passes
    if (latestReviewStr && !latestReviewStr.toLowerCase().includes('ago')) {
        latestReviewStr = convertToRelativeDate(latestReviewStr.trim());
    }
    const phoneStr = String(phoneRaw);
    const addressStr = String(addressRaw);


    // 1. Placeholder & Blank Value Checks (case-insensitive for string placeholders)
    if (!phoneStr || phoneStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Phone_Number'].toLowerCase()) return false;
    if (!addressStr || addressStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Business_Address'].toLowerCase()) return false;
    if (!reviewsStr || reviewsStr.trim() === '' || reviewsStr.toLowerCase() === UNWANTED_PLACEHOLDERS['#_of_Reviews'].toLowerCase()) return false;
    if (!ratingStr || ratingStr.trim() === '' || ratingStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Rating'].toLowerCase()) return false;
    if (!latestReviewStr || latestReviewStr.trim() === '' || latestReviewStr.toLowerCase() === UNWANTED_PLACEHOLDERS['Latest_Review'].toLowerCase()) return false;

    // 1.5 Address Country Check
    const addressStrLower = addressStr.toLowerCase();
    if (!addressStrLower.includes('united states') && !addressStrLower.includes('canada')) {
        scraperLogger.debug(`Filtering out lead (not US or Canada): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
        return false;
    }

    // 2. Review Count Filter
    const numReviews = parseInt(reviewsStr.replace(/,/g, ''), 10);
    if (isNaN(numReviews) || numReviews < MIN_REVIEW_COUNT) {
        scraperLogger.debug(`Filtering out lead (review count < ${MIN_REVIEW_COUNT}): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
        return false;
    }
    
    // Optional: State Filter (e.g., for 'WA')
    // if (STATE_FILTER_ENABLED) {
    //     let matchesState = false;
    //     for (const state of TARGET_STATES) {
    //         if (addressStr.toUpperCase().includes(`, ${state.toUpperCase()} `) || addressStr.toUpperCase().endsWith(` ${state.toUpperCase()}`)) {
    //             matchesState = true;
    //             break;
    //         }
    //     }
    //     if (!matchesState) {
    //         scraperLogger.debug(`Filtering out lead (address not in target states): ${getLeadValue(lead, 'Name of Business', 'name_of_business')}`);
    //         return false;
    //     }
    // }

    // 6. Business Type / Sub-Category Filter
    let matchesPrimaryJobTypeFilter = false;
    if (!primaryJobTypesLowerCase || primaryJobTypesLowerCase.length === 0) {
        matchesPrimaryJobTypeFilter = true; // No specific job type filter from jobData, pass all (should not happen if jobData is validated)
    } else {
        for (const primaryType of primaryJobTypesLowerCase) {
            // Check if this business type is one of the types that should have filtering applied
            const shouldApplyFilter = Object.keys(business_filters).some(filterKey => 
                filterKey.toLowerCase() === primaryType.toLowerCase()
            );
            
            if (shouldApplyFilter) {
                // This business type IS in the business_filters, so apply filtering
                const allowedSubcategories = business_filters[primaryType] || 
                    business_filters[Object.keys(business_filters).find(key => key.toLowerCase() === primaryType.toLowerCase())];
                
                if (allowedSubcategories && allowedSubcategories.length > 0) {
                    // A lead matches if its main type OR its sub-category is in the allowed list for the job's primary type
                    if (allowedSubcategories.some(allowed => 
                        typeOfBusiness.includes(allowed.toLowerCase()) || 
                        subCategory.includes(allowed.toLowerCase())
                    )) {
                        matchesPrimaryJobTypeFilter = true;
                        break;
                    }
                }
            } else {
                // This business type is NOT in business_filters, so no filtering - allow all leads that match the type
                if (typeOfBusiness.includes(primaryType) || primaryType.includes(typeOfBusiness) ||
                    subCategory.includes(primaryType) || primaryType.includes(subCategory)) {
                    matchesPrimaryJobTypeFilter = true;
                    break;
                }
            }
        }
    }
    if (!matchesPrimaryJobTypeFilter) {
        scraperLogger.debug(`Filtering out lead (type/subtype not matching job's primary types): ${getLeadValue(lead, 'Name of Business', 'name_of_business')} (Type: ${typeOfBusiness}, SubType: ${subCategory})`);
        return false;
    }

    return true; // Lead passes all filters
}

module.exports = scraperProcessor;
module.exports.checkExistingLeadsAndOptimizeQueries = checkExistingLeadsAndOptimizeQueries; 