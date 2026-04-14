const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getAll, getOne, runQuery } = require('../database/setup');
const { addScrapingJob, addProcessingJob, getQueueStats } = require('../queues/setup');
const FileGenerationService = require('./fileGenerationService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Helper function (similar to scraperProcessor.js - consider moving to a shared utils file)
function parseBusinessTypes(businessTypesString) {
  if (!businessTypesString) return [];
  const types = businessTypesString
    .split(',')
    .map(type => type.trim())
    .flatMap(type => type.split(/\s+(?:and|&|or|\+)\s+/i).map(t => t.trim()).filter(t => t.length > 0))
    .filter(type => type.length > 0);
  return types.length > 0 ? types : (businessTypesString ? [businessTypesString] : []);
}

function parseLocations(locationString) {
  if (!locationString) return [];
  const locations = locationString
    .split(',')
    .map(loc => loc.trim())
    .filter(loc => loc.length > 0);
  return locations.length > 0 ? locations : (locationString ? [locationString] : []);
}

class GeminiService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-preview-05-20",
      tools: [this.getToolDefinitions()]
    });
    
    // Initialize file generation service
    this.fileService = new FileGenerationService();
  }

  // Define tools that Gemini can call
  getToolDefinitions() {
    return {
      function_declarations: [
        {
          name: "get_lead_count",
          description: "Get the total count of leads in the database, optionally filtered by location or business type. Handles multiple comma-separated values for location and business type parameters.",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city name. Can be a single city or a comma-separated list of cities (e.g., 'Las Vegas, Henderson')."
              },
              state: {
                type: "string", 
                description: "Filter by state name or abbreviation. Can be a single state or a comma-separated list of states (e.g., 'NV, CA')."
              },
              zipCode: {
                type: "string",
                description: "Filter by zip code. Can be a single zip code or a comma-separated list of zip codes (e.g., '89101, 89102, 89128')."
              },
              businessType: {
                type: "string",
                description: "Filter by business type or category. Can be a single type or a comma-separated list of business types (e.g., 'restaurants, gyms, warehouses')."
              }
            }
          }
        },
        {
          name: "search_leads",
          description: "Search for leads based on various criteria with pagination",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city"
              },
              state: {
                type: "string",
                description: "Filter by state"
              },
              zipCode: {
                type: "string", 
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type"
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default 10, max 1000)"
              },
              offset: {
                type: "number",
                description: "Number of records to skip for pagination (default 0)"
              }
            }
          }
        },
        {
          name: "get_all_leads",
          description: "Get ALL leads from the database with optional filters. Use with caution as this can return large datasets.",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city"
              },
              state: {
                type: "string",
                description: "Filter by state"
              },
              zipCode: {
                type: "string", 
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type"
              },
              maxResults: {
                type: "number",
                description: "Safety limit to prevent overwhelming responses (default 10000)"
              }
            }
          }
        },
        {
          name: "start_scraping_job",
          description: "Start a new scraping job to find leads",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "Location to search. Can be a single city, state, or zip code, or a comma-separated list of locations (e.g., 'New York, NY' or '90210, 90001, 90212')."
              },
              businessType: {
                type: "string", 
                description: "Type(s) of business to search for. Can be a single business type or a comma-separated list (e.g., 'restaurants, coffee shops')."
              },
              maxResults: {
                type: "number",
                description: "Maximum number of results for the scraper to fetch for each individual query (defaults to 15)."
              }
            },
            required: ["location", "businessType"]
          }
        },
        {
          name: "get_queue_status",
          description: "Get the current status of scraping and processing queues",
          parameters: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "get_recent_files",
          description: "Get list of recently generated files and deliveries",
          parameters: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Number of files to return (default 5)"
              }
            }
          }
        },
        {
          name: "export_leads_to_file",
          description: "Export leads to a downloadable file (CSV or Excel) and save to deliveries",
          parameters: {
            type: "object",
            properties: {
              city: {
                type: "string",
                description: "Filter by city"
              },
              state: {
                type: "string",
                description: "Filter by state"
              },
              zipCode: {
                type: "string", 
                description: "Filter by zip code"
              },
              businessType: {
                type: "string",
                description: "Filter by business type"
              },
              format: {
                type: "string",
                description: "File format: 'csv' or 'excel' (default: csv)"
              },
              filename: {
                type: "string",
                description: "Custom filename (optional)"
              },
              maxResults: {
                type: "number",
                description: "Maximum number of leads to export (default 10000)"
              }
            }
          }
        }
      ]
    };
  }

  // Execute tool functions
  async executeFunction(functionName, args) {
    try {
      logger.info(`Executing function: ${functionName}`, { args });

      switch (functionName) {
        case 'get_lead_count':
          return await this.getLeadCount(args);
        
        case 'search_leads':
          return await this.searchLeads(args);
        
        case 'get_all_leads':
          return await this.getAllLeads(args);
        
        case 'export_leads_to_file':
          return await this.exportLeadsToFile(args);
        
        case 'start_scraping_job':
          return await this.startScrapingJob(args);
        
        case 'get_queue_status':
          return await this.getQueueStatus();
        
        case 'get_recent_files':
          return await this.getRecentFiles(args);
        
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      logger.error(`Error executing function ${functionName}:`, error);
      return { error: error.message };
    }
  }

  // Helper function to convert state names to abbreviations
  mapStateToAbbreviation(state) {
    if (!state) return state;
    
    const stateMap = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
      'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
      'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
      'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
      'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
      'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
      'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
      'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
    };
    
    const lowerState = state.toLowerCase();
    return stateMap[lowerState] || state;
  }

  // Helper function to build state query condition
  buildStateCondition(state, query, params) {
    if (!state) return;
    
    const stateAbbr = this.mapStateToAbbreviation(state);
    
    // If we mapped to an abbreviation, search for exact match
    if (stateAbbr !== state && stateAbbr.length === 2) {
      query += ' AND UPPER(state) = UPPER(?)';
      params.push(stateAbbr);
    } else {
      // Search for both the original input and potential abbreviation
      query += ' AND (LOWER(state) LIKE LOWER(?) OR LOWER(state) LIKE LOWER(?))';
      params.push(`%${state}%`, `%${stateAbbr}%`);
    }
    
    return query;
  }

  async getLeadCount(args) {
    const { city, state, zipCode, businessType } = args;
    
    let query = 'SELECT COUNT(*) as count FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      const citiesArray = parseLocations(city);
      if (citiesArray.length > 0) {
        const cityConditions = citiesArray.map(() => 'LOWER(city) LIKE LOWER(?)').join(' OR ');
        query += ` AND (${cityConditions})`;
        citiesArray.forEach(c => params.push(`%${c}%`));
    }
    }

    if (state) {
      // Option 1: Simple LIKE for each state if multiple, or use existing buildStateCondition if single
      // For now, let's adapt to multiple states with simple LIKE for each.
      // buildStateCondition might need rework if it doesn't expect an array or produces incorrect AND/OR logic for multiples.
      const statesArray = parseLocations(state); // Assuming state can also be a comma-separated list
      if (statesArray.length > 0) {
        const stateConditions = statesArray.map(s => {
          const stateAbbr = this.mapStateToAbbreviation(s);
          if (stateAbbr !== s && stateAbbr.length === 2) {
            params.push(stateAbbr.toUpperCase());
            return 'UPPER(state) = UPPER(?)';
          } else {
            params.push(`%${s}%`);
            params.push(`%${stateAbbr}%`);
            return '(LOWER(state) LIKE LOWER(?) OR LOWER(state) LIKE LOWER(?))';
          }
        }).join(' OR ');
        query += ` AND (${stateConditions})`;
      }
    }

    if (zipCode) {
      let zipCodesArray = parseLocations(zipCode);
      zipCodesArray = zipCodesArray.map(zc => {
        const digits = zc.replace(/[^0-9]/g, '');
        if (digits.length >= 5) return digits.slice(-5);
        return null;
      }).filter(zc => zc !== null && zc.length === 5);

      if (zipCodesArray.length > 0) {
        // Ensure zip_code is compared as string and handle potential spaces/hyphens
        // Using SUBSTR(REPLACE(zip_code, ' ', ''), -5) to get the last 5 digits for comparison
        query += ` AND SUBSTR(REPLACE(zip_code, ' ', ''), -5) IN (${zipCodesArray.map(() => '?').join(',')})`;
        params.push(...zipCodesArray);
    }
    }

    if (businessType) {
      const businessTypesArray = parseBusinessTypes(businessType);
      if (businessTypesArray.length > 0) {
        const businessTypeConditions = businessTypesArray
          .map(() => '(LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))')
          .join(' OR ');
        query += ` AND (${businessTypeConditions})`;
        businessTypesArray.forEach(bt => {
          params.push(`%${bt}%`);
          params.push(`%${bt}%`); // For sub_category match
        });
      }
    }

    logger.info(`Executing getLeadCount query: ${query} with params: ${JSON.stringify(params)}`);
    const result = await getOne(query, params);
    return { count: result.count, filters: args };
  }

  async searchLeads(args) {
    const { city, state, zipCode, businessType, limit = 10, offset = 0 } = args;
    
    // Enforce reasonable limits
    const safeLimit = Math.min(limit, 1000);
    const safeOffset = Math.max(offset, 0);
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }
    if (zipCode) {
      query += ' AND zip_code = ?';
      params.push(zipCode);
    }
    if (businessType) {
      query += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      params.push(`%${businessType}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    const leads = await getAll(query, params);
    
    // Get total count for pagination info
    let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    
    if (city) {
      countQuery += ' AND LOWER(city) LIKE LOWER(?)';
      countParams.push(`%${city}%`);
    }
    if (state) {
      countQuery = this.buildStateCondition(state, countQuery, countParams);
    }
    if (zipCode) {
      countQuery += ' AND zip_code = ?';
      countParams.push(zipCode);
    }
    if (businessType) {
      countQuery += ' AND LOWER(type_of_business) LIKE LOWER(?)';
      countParams.push(`%${businessType}%`);
    }
    
    const totalResult = await getOne(countQuery, countParams);
    const total = totalResult.total;
    
    return { 
      leads, 
      count: leads.length, 
      total: total,
      offset: safeOffset,
      limit: safeLimit,
      hasMore: (safeOffset + safeLimit) < total,
      filters: args 
    };
  }

  async getAllLeads(args) {
    const { city, state, zipCode, businessType, maxResults = 10000, generateFile = false } = args;
    
    // Safety check - prevent overwhelming responses
    const safeMaxResults = Math.min(maxResults, 50000);
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }
    
    // Handle multiple Zip Codes
    if (zipCode) {
      let zipCodesArray = parseLocations(zipCode); // Raw parsed locations
      // Clean each item to be a 5-digit zip code
      zipCodesArray = zipCodesArray.map(zc => {
        const digits = zc.replace(/[^0-9]/g, ''); // Extract all digits
        if (digits.length >= 5) return digits.slice(-5); // Take last 5 digits
        return null;
      }).filter(zc => zc !== null && zc.length === 5); // Ensure they are valid 5-digit zips

      if (zipCodesArray.length > 0) {
        query += ` AND SUBSTR(REPLACE(zip_code, ' ', ''), -5) IN (${zipCodesArray.map(() => '?').join(',')})`;
        params.push(...zipCodesArray);
      }
    }

    // Handle multiple Business Types
    if (businessType) {
      const businessTypesArray = parseBusinessTypes(businessType);
      if (businessTypesArray.length > 0) {
        const businessTypeConditions = businessTypesArray
          .map(() => '(LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))')
          .join(' OR ');
        query += ` AND (${businessTypeConditions})`;
        businessTypesArray.forEach(bt => {
          params.push(`%${bt}%`);
          params.push(`%${bt}%`);
        });
      }
    }

    // Add safety limit and ordering
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(safeMaxResults);

    logger.info(`Executing getAllLeads query: ${query} with params: ${JSON.stringify(params)}`);

    const leads = await getAll(query, params);
    
    // Get total count to see if we hit the limit
    let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    
    if (city) {
      countQuery += ' AND LOWER(city) LIKE LOWER(?)';
      countParams.push(`%${city}%`);
    }
    if (state) {
      countQuery = this.buildStateCondition(state, countQuery, countParams);
    }
    
    // Handle multiple Zip Codes for count query
    if (zipCode) {
      let zipCodesArray = parseLocations(zipCode); // Raw parsed locations
       // Clean each item to be a 5-digit zip code
      zipCodesArray = zipCodesArray.map(zc => {
        const digits = zc.replace(/[^0-9]/g, ''); // Extract all digits
        if (digits.length >= 5) return digits.slice(-5); // Take last 5 digits
        return null;
      }).filter(zc => zc !== null && zc.length === 5); // Ensure they are valid 5-digit zips

      if (zipCodesArray.length > 0) {
        countQuery += ` AND SUBSTR(REPLACE(zip_code, ' ', ''), -5) IN (${zipCodesArray.map(() => '?').join(',')})`;
        countParams.push(...zipCodesArray);
      }
    }

    // Handle multiple Business Types for count query
    if (businessType) {
      const businessTypesArray = parseBusinessTypes(businessType);
      if (businessTypesArray.length > 0) {
        const businessTypeConditions = businessTypesArray
          .map(() => '(LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))')
          .join(' OR ');
        countQuery += ` AND (${businessTypeConditions})`;
        businessTypesArray.forEach(bt => {
          countParams.push(`%${bt}%`);
          countParams.push(`%${bt}%`);
        });
      }
    }
    
    const totalResult = await getOne(countQuery, countParams);
    const total = totalResult.total;
    const truncated = total > safeMaxResults;
    
    // Auto-generate file for large datasets
    let fileInfo = null;
    if (leads.length > 0) {
      try {
        fileInfo = await this.fileService.generateLeadsFile(leads, {
          format: 'csv',
          filters: { city, state, zipCode, businessType },
          requestType: 'get_all_leads'
        });
      } catch (fileError) {
        logger.error('Error generating file for getAllLeads:', fileError);
        // Continue without file generation
      }
    }
    
    return { 
      leads: leads.slice(0, 10), // Only show first 10 in chat for readability
      count: leads.length,
      total: total,
      truncated: truncated,
      maxResults: safeMaxResults,
      message: truncated ? 
        `Generated file with first ${leads.length} of ${total} total leads (truncated for performance)` :
        `Generated file with all ${leads.length} leads`,
      file: fileInfo,
      filters: args 
    };
  }

  async startScrapingJob(args) {
    const { location, businessType, maxResults = 15 } = args;
    
    const jobData = {
      query: `${businessType} in ${location}`,
      location: location,
      businessType: businessType,
      maxResults: maxResults,
      source: 'conversation',
      timestamp: new Date().toISOString()
    };

    const job = await addScrapingJob(jobData);
    
    return {
      success: true,
      jobId: job.id,
      message: `Started scraping job for ${businessType} in ${location} (limit ${maxResults} results per query).`
    };
  }

  async getQueueStatus() {
    const stats = await getQueueStats();
    return {
      scraperQueue: stats.scraperQueue,
      processingQueue: stats.processingQueue,
      totalActive: stats.scraperQueue.active + stats.processingQueue.active,
      totalWaiting: stats.scraperQueue.waiting + stats.processingQueue.waiting
    };
  }

  async getRecentFiles(args) {
    const { limit = 5 } = args;
    
    try {
      const files = await this.fileService.getRecentDeliveries(limit);
      return {
        files,
        count: files.length,
        message: files.length > 0 ? 
          `Found ${files.length} recent deliveries` : 
          'No recent deliveries found'
      };
    } catch (error) {
      logger.error('Error getting recent files:', error);
      return {
        files: [],
        count: 0,
        message: "Error retrieving deliveries",
        error: error.message
      };
    }
  }

  async exportLeadsToFile(args) {
    const { city, state, zipCode, businessType, format = 'csv', filename, maxResults = 10000 } = args;
    
    const safeMaxResults = Math.min(maxResults, 50000);
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (city) {
      query += ' AND LOWER(city) LIKE LOWER(?)';
      params.push(`%${city}%`);
    }
    if (state) {
      query = this.buildStateCondition(state, query, params);
    }

    // Handle multiple Zip Codes
    if (zipCode) {
      let zipCodesArray = parseLocations(zipCode); // Raw parsed locations
      // Clean each item to be a 5-digit zip code
      zipCodesArray = zipCodesArray.map(zc => {
        const digits = zc.replace(/[^0-9]/g, ''); // Extract all digits
        if (digits.length >= 5) return digits.slice(-5); // Take last 5 digits
        return null;
      }).filter(zc => zc !== null && zc.length === 5); // Ensure they are valid 5-digit zips

      if (zipCodesArray.length > 0) {
        query += ` AND SUBSTR(REPLACE(zip_code, ' ', ''), -5) IN (${zipCodesArray.map(() => '?').join(',')})`;
        params.push(...zipCodesArray);
      }
    }

    // Handle multiple Business Types
    if (businessType) {
      const businessTypesArray = parseBusinessTypes(businessType);
      if (businessTypesArray.length > 0) {
        const businessTypeConditions = businessTypesArray
          .map(() => '(LOWER(type_of_business) LIKE LOWER(?) OR LOWER(sub_category) LIKE LOWER(?))')
          .join(' OR ');
        query += ` AND (${businessTypeConditions})`;
        businessTypesArray.forEach(bt => {
          params.push(`%${bt}%`);
          params.push(`%${bt}%`);
        });
      }
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(safeMaxResults);

    logger.info(`Executing export query: ${query} with params: ${JSON.stringify(params)}`);

    const leads = await getAll(query, params);
    
    if (leads.length === 0) {
      return {
        success: false,
        message: 'No leads found matching your criteria',
        count: 0,
        filters: args
      };
    }

    // Generate file
    const fileInfo = await this.fileService.generateLeadsFile(leads, {
      format,
      filename,
      filters: { city, state, zipCode, businessType },
      requestType: 'export_leads'
    });

    return {
      success: true,
      message: `Successfully exported ${leads.length} leads to ${format.toUpperCase()} file`,
      file: fileInfo,
      count: leads.length,
      downloadUrl: fileInfo.downloadUrl,
      filename: fileInfo.filename,
      format: fileInfo.format,
      size: fileInfo.sizeFormatted,
      filters: args
    };
  }

  // Main conversation method
  async processConversation(message, conversationHistory = []) {
    try {
      // Build conversation context with proper role mapping
      const chatHistory = conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role, // Map assistant -> model for Gemini
        parts: [{ text: msg.content }]
      }));

      // Add current user message
      chatHistory.push({
        role: 'user',
        parts: [{ text: message }]
      });

      // System prompt to guide Gemini's behavior
      const systemPrompt = `You are an AI assistant for a lead generation system. You help users manage leads, start scraping jobs, and analyze data.

Available tools:
- get_lead_count: Count leads with optional filters
- search_leads: Find specific leads
- start_scraping_job: Start new lead generation jobs
- get_queue_status: Check job queues
- get_recent_files: View recent deliveries

Be helpful, concise, and use tools when appropriate. Always confirm actions before starting scraping jobs.`;

      // Start chat with system prompt
      const chat = this.model.startChat({
        history: [{
          role: 'user',
          parts: [{ text: systemPrompt }]
        }, {
          role: 'model', 
          parts: [{ text: 'I understand. I\'m ready to help you manage your lead generation system.' }]
        }, ...chatHistory.slice(0, -1)]
      });

      // Send user message and get response
      const result = await chat.sendMessage(message);
      const response = result.response;

      // Check if Gemini wants to call functions
      const functionCalls = response.functionCalls();
      let toolResults = [];
      
      if (functionCalls && functionCalls.length > 0) {
        // Execute each function call
        for (const functionCall of functionCalls) {
          const functionResult = await this.executeFunction(
            functionCall.name, 
            functionCall.args
          );
          
          toolResults.push({
            functionName: functionCall.name,
            result: functionResult
          });
        }

        // Send function results back to Gemini for final response
        // Map all tool results to the format expected by the API
        const functionResponseParts = toolResults.map(toolResult => ({
          functionResponse: {
            name: toolResult.functionName,
            response: toolResult.result
          }
        }));

        // Send all function responses back to the model
        const functionResponse = await chat.sendMessage(functionResponseParts);

        return {
          message: functionResponse.response.text(),
          toolCalls: toolResults,
          type: 'function_result'
        };
      } else {
        // Regular text response
        return {
          message: response.text(),
          type: 'text'
        };
      }

    } catch (error) {
      logger.error('Error in Gemini conversation:', error);
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  async getScrapingJobStatus(jobId) {
    if (!jobId) {
      throw new Error('Job ID is required to get scraping status.');
    }
    try {
      const job = await scraperQueue.getJob(jobId);
      if (!job) {
        // Check database if not in Bull queue (e.g., completed or failed long ago)
        const dbJob = await getOne('SELECT * FROM scraping_jobs WHERE job_id = ?', [jobId]);
        if (dbJob) {
          return {
            job_id: dbJob.job_id,
            status: dbJob.status,
            progress: dbJob.status === 'completed' || dbJob.status === 'failed' ? 100 : 0,
            data: JSON.parse(dbJob.job_data || '{}'), // Ensure job_data is parsed
            created_at: dbJob.created_at,
            started_at: dbJob.started_at,
            completed_at: dbJob.completed_at,
            error_message: dbJob.error_message,
            leads_found: dbJob.leads_found,
            source: dbJob.source,
            result: dbJob.result ? JSON.parse(dbJob.result) : null // Ensure result is parsed
          };
        } else {
          return { status: 'not_found', message: `Job ${jobId} not found in queue or database.` };
        }
      }
      
      // For jobs found in Bull queue
      const jobData = job.data;
      const jobResult = job.returnvalue; // Bull stores job result in returnvalue
      
      return {
        job_id: job.id,
        name: job.name,
        status: await job.getState(),
        progress: job.progress(),
        data: jobData,
        created_at: new Date(job.timestamp).toISOString(),
        processed_on: job.processedOn ? new Date(job.processedOn).toISOString() : null,
        finished_on: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        failed_reason: job.failedReason,
        result: jobResult, // Already an object, no need to parse
        opts: job.opts
      };
    } catch (error) {
      logger.error(`Error fetching job ${jobId} status:`, error);
      throw new Error(`Could not fetch status for job ${jobId}: ${error.message}`);
    }
  }

  async listRecentDeliveries(limit = 10) {
    try {
      const deliveries = await getAll(
        'SELECT * FROM deliveries ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      return deliveries.map(d => ({ ...d, filters: JSON.parse(d.filters || '{}') }));
    } catch (error) {
      logger.error('Error listing recent deliveries:', error);
      return [];
    }
  }

  async getDeliveryFile(fileId) {
    try {
      const delivery = await getOne(
        'SELECT * FROM deliveries WHERE file_id = ?',
        [fileId]
      );
      if (!delivery) {
        return null;
      }
      return { ...delivery, filters: JSON.parse(delivery.filters || '{}') };
    } catch (error) {
      logger.error(`Error fetching delivery file ${fileId}:`, error);
      return null;
    }
  }
}

// module.exports = new GeminiService();
module.exports = GeminiService; 