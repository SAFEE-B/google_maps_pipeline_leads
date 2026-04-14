const { queueLogger } = require('../utils/logger');
const { getAll } = require('../database/setup');

// Configuration based on Python script
const CONSOLIDATED_RV_TYPES = new Set([
  'rv park', 'mobile home park', 'trailer park',
  'rv parks', 'mobile home parks', 'trailer parks', 
  'campground', 'campgrounds'
]);

const REPRESENTATIVE_RV_TYPE = 'mobile home park';

// Sub-category filters for business type consolidation (from Python script)
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
  "factories": ["manufacturer","manufacturers"],
  "factory": ["manufacturer"]
};

class LeadOptimizationService {
  constructor() {
    this.logger = queueLogger;
    // Simple cache for combinations to avoid repeated DB queries
    this.combinationCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Optimized lead optimization with database-level filtering and reduced memory usage
   */
  async checkExistingLeadsAndOptimizeQueries(queries) {
    const startTime = Date.now();
    const existingLeadsOutput = [];
    const optimizedQueries = [];

    try {
      this.logger.info(`🧠 Starting optimized lead optimization for ${queries.length} queries`);

      // Step 1: Parse all business types and locations
      const allCombinations = this.parseQueriesIntoCombinations(queries);
      this.logger.info(`📊 Parsed ${allCombinations.length} business type + location combinations`);

      // Step 2: Get existing combinations directly from database (much faster)
      const combinationStartTime = Date.now();
      const foundCombinations = await this.fetchExistingCombinationsOptimized(allCombinations);
      const combinationDuration = Date.now() - combinationStartTime;
      this.logger.info(`🔍 Found ${foundCombinations.size} existing business type/location combinations in ${combinationDuration}ms`);

      // Step 3: Find missing combinations
      const missingCombinations = this.findMissingCombinations(allCombinations, foundCombinations);
      this.logger.info(`🎯 Identified ${missingCombinations.length} missing combinations that need scraping`);

      // Step 4: Generate optimized queries
      optimizedQueries.push(...this.generateOptimizedQueries(missingCombinations));

      // Step 5: Fetch only relevant existing leads (database-filtered)
      // Skip this step if we have too many combinations to avoid memory issues
      if (allCombinations.length <= 6000) {
        const leadsStartTime = Date.now();
        const relevantLeads = await this.fetchRelevantExistingLeadsOptimized(allCombinations);
        const leadsDuration = Date.now() - leadsStartTime;
        existingLeadsOutput.push(...relevantLeads);
        this.logger.info(`📋 Fetched ${relevantLeads.length} relevant existing leads in ${leadsDuration}ms`);
      } else {
        this.logger.info(`⚠️ Skipping existing leads fetch due to large combination count (${allCombinations.length}) to avoid memory issues`);
      }

      const duration = Date.now() - startTime;
      this.logger.info(`✅ Optimization complete in ${duration}ms: ${optimizedQueries.length} queries to scrape, ${existingLeadsOutput.length} existing leads found`);

      return { optimizedQueries, existingLeads: existingLeadsOutput };

    } catch (error) {
      this.logger.error('❌ Error in optimized lead optimization:', error);
      return this.fallbackToOriginalQueries(queries);
    }
  }

  /**
   * Optimized method to fetch existing combinations directly from database
   * This avoids loading all leads into memory
   */
  async fetchExistingCombinationsOptimized(allCombinations) {
    try {
      // Extract unique business types and locations for targeted querying
      const businessTypes = [...new Set(allCombinations.map(c => c.businessType.toLowerCase()))];
      const locations = [...new Set(allCombinations.map(c => c.location.toLowerCase()))];
      
      // Create cache key
      const cacheKey = `${businessTypes.sort().join('|')}::${locations.sort().join('|')}`;
      
      // Check cache first
      const cached = this.getCachedCombinations(cacheKey);
      if (cached) {
        this.logger.info('🚀 Using cached combinations (cache hit)');
        return cached;
      }

      const foundCombinations = new Set();

      // Create placeholders for the IN clauses
      const bizTypePlaceholders = businessTypes.map(() => '?').join(',');
      const locationPlaceholders = locations.map(() => '?').join(',');

      // Optimized query that only gets combination data, not full lead records
      // Using SQLite-compatible syntax instead of REGEXP
      const query = `
        SELECT DISTINCT 
          LOWER(TRIM(type_of_business)) as business_type,
          LOWER(TRIM(city)) as city,
          CASE 
            WHEN LENGTH(zip_code) >= 5 AND SUBSTR(zip_code, 1, 5) GLOB '[0-9][0-9][0-9][0-9][0-9]' 
            THEN SUBSTR(zip_code, 1, 5)
            ELSE NULL 
          END as zip_code
        FROM leads 
        WHERE (
          LOWER(TRIM(type_of_business)) IN (${bizTypePlaceholders})
          OR LOWER(TRIM(sub_category)) IN (${bizTypePlaceholders})
        )
        AND (
          LOWER(TRIM(city)) IN (${locationPlaceholders})
          OR CASE 
            WHEN LENGTH(zip_code) >= 5 AND SUBSTR(zip_code, 1, 5) GLOB '[0-9][0-9][0-9][0-9][0-9]' 
            THEN SUBSTR(zip_code, 1, 5)
            ELSE NULL 
          END IN (${locationPlaceholders})
        )
        LIMIT 100000
      `;

      // Combine parameters: business types twice, locations twice
      const params = [...businessTypes, ...businessTypes, ...locations, ...locations];
      
      const results = await getAll(query, params);
      
      // Process results into combinations
      for (const row of results) {
        if (!row.business_type) continue;
        
        const standardizedBizType = this.standardizeBusinessType(row.business_type);
        
        // Add combinations for both zip and city
        if (row.zip_code) {
          foundCombinations.add(`${standardizedBizType}|${row.zip_code}`);
        }
        if (row.city) {
          foundCombinations.add(`${standardizedBizType}|${row.city}`);
        }
      }

      // Cache the results
      this.setCachedCombinations(cacheKey, foundCombinations);

      return foundCombinations;
      
    } catch (error) {
      this.logger.error('❌ Error in optimized combination fetching:', error);
      // Fallback to original method
      return this.fetchExistingCombinationsFallback();
    }
  }

  /**
   * Get cached combinations if still valid
   */
  getCachedCombinations(cacheKey) {
    const cached = this.combinationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.combinations;
    }
    return null;
  }

  /**
   * Set combinations in cache with timestamp
   */
  setCachedCombinations(cacheKey, combinations) {
    this.combinationCache.set(cacheKey, {
      combinations,
      timestamp: Date.now()
    });
    
    // Clean up old cache entries periodically
    if (this.combinationCache.size > 100) {
      this.cleanupCache();
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.combinationCache.entries()) {
      if ((now - value.timestamp) >= this.cacheExpiry) {
        this.combinationCache.delete(key);
      }
    }
  }

  /**
   * Optimized method to fetch only relevant existing leads with database filtering
   */
  async fetchRelevantExistingLeadsOptimized(allCombinations) {
    try {
      // Extract unique business types and locations
      const businessTypes = [...new Set(allCombinations.map(c => c.businessType.toLowerCase()))];
      const locations = [...new Set(allCombinations.map(c => c.location.toLowerCase()))];

      if (businessTypes.length === 0 || locations.length === 0) {
        return [];
      }

      // Create placeholders for the IN clauses
      const bizTypePlaceholders = businessTypes.map(() => '?').join(',');
      const locationPlaceholders = locations.map(() => '?').join(',');

      // Optimized query with database-level filtering
      // Using SQLite-compatible syntax instead of REGEXP
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
        WHERE (
          LOWER(TRIM(type_of_business)) IN (${bizTypePlaceholders})
          OR LOWER(TRIM(sub_category)) IN (${bizTypePlaceholders})
        )
        AND (
          LOWER(TRIM(city)) IN (${locationPlaceholders})
          OR CASE 
            WHEN LENGTH(zip_code) >= 5 AND SUBSTR(zip_code, 1, 5) GLOB '[0-9][0-9][0-9][0-9][0-9]' 
            THEN SUBSTR(zip_code, 1, 5)
            ELSE NULL 
          END IN (${locationPlaceholders})
        )
        ORDER BY created_at DESC
        LIMIT 50000
      `;

      // Combine parameters: business types twice, locations twice
      const params = [...businessTypes, ...businessTypes, ...locations, ...locations];
      
      const leads = await getAll(query, params);
      
      // Create a hash map for faster lookups instead of nested loops
      const combinationMap = new Map();
      allCombinations.forEach(combo => {
        const key = `${combo.businessType.toLowerCase()}|${combo.location.toLowerCase()}`;
        if (!combinationMap.has(key)) {
          combinationMap.set(key, combo);
        }
      });

      // Filter leads using the hash map (much faster than nested loops)
      const relevantLeads = [];
      const seenLeads = new Set();

      for (const lead of leads) {
        const leadKey = `${lead.name_of_business}_${lead.phone_number}`.toLowerCase();
        if (seenLeads.has(leadKey)) continue;

        // Check if lead matches any combination using optimized lookup
        if (this.isLeadRelevantToAnyCombo(lead, combinationMap)) {
          seenLeads.add(leadKey);
          relevantLeads.push(lead);
        }
      }

      return relevantLeads;
      
    } catch (error) {
      this.logger.error('❌ Error in optimized relevant leads fetching:', error);
      return [];
    }
  }

  /**
   * Optimized method to check if lead is relevant using hash map lookup
   */
  isLeadRelevantToAnyCombo(lead, combinationMap) {
    const leadBizType = (lead.type_of_business || '').toLowerCase().trim();
    const leadSubCategory = (lead.sub_category || '').toLowerCase().trim();
    const leadZip = this.extractZipCode(lead);
    const leadCity = (lead.city || '').toLowerCase().trim();

    if (!leadBizType) return false;

    const standardizedLeadType = this.standardizeBusinessType(leadBizType);
    const standardizedSubCategory = this.standardizeBusinessType(leadSubCategory);

    // Check direct matches first (fastest)
    const locations = [leadZip, leadCity].filter(Boolean);
    const businessTypes = [standardizedLeadType, standardizedSubCategory].filter(Boolean);

    for (const bizType of businessTypes) {
      for (const location of locations) {
        const key = `${bizType}|${location}`;
        if (combinationMap.has(key)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Fallback method for fetching existing combinations (original implementation)
   */
  async fetchExistingCombinationsFallback() {
    const existingLeads = await this.fetchExistingLeads();
    return this.analyzeExistingCombinations(existingLeads);
  }

  parseQueriesIntoCombinations(queries) {
    const combinations = [];
    
    for (const query of queries) {
      const businessTypes = this.parseBusinessTypes(query.businessType);
      const locations = this.parseLocations(query.location);
      
      for (const businessType of businessTypes) {
        for (const location of locations) {
          combinations.push({
            businessType: businessType.toLowerCase().trim(),
            location: location.toLowerCase().trim(),
            maxResults: query.maxResults || 15,
            originalQuery: query
          });
        }
      }
    }
    
    return combinations;
  }

  async fetchExistingLeads() {
    try {
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
        ORDER BY created_at DESC
      `;
      
      const leads = await getAll(query, []);
      return leads || [];
      
    } catch (error) {
      this.logger.error('❌ Error fetching existing leads:', error);
      return [];
    }
  }

  analyzeExistingCombinations(existingLeads) {
    const foundCombinations = new Set();
    
    for (const lead of existingLeads) {
      const leadBizType = (lead.type_of_business || '').toLowerCase().trim();
      const leadZip = this.extractZipCode(lead);
      const leadCity = (lead.city || '').toLowerCase().trim();
      
      if (!leadBizType || (!leadZip && !leadCity)) continue;
      
      // Standardize business type (consolidate RV types)
      const standardizedBizType = this.standardizeBusinessType(leadBizType);
      
      // Add combinations for both zip and city
      if (leadZip) {
        foundCombinations.add(`${standardizedBizType}|${leadZip}`);
      }
      if (leadCity) {
        foundCombinations.add(`${standardizedBizType}|${leadCity}`);
      }
    }
    
    return foundCombinations;
  }

  standardizeBusinessType(businessType) {
    const bizTypeLower = businessType.toLowerCase().trim();
    
    // If it's one of the consolidated RV types, use the representative
    if (CONSOLIDATED_RV_TYPES.has(bizTypeLower)) {
      return REPRESENTATIVE_RV_TYPE.toLowerCase();
    }
    
    // Return the business type as-is (since we're only using plural forms now)
    return bizTypeLower;
  }

  extractZipCode(lead) {
    let zipCode = (lead.zip_code || '').toString().trim();
    
    // Extract 5-digit zip code
    const zipMatch = zipCode.match(/\d{5}/);
    if (zipMatch) {
      return zipMatch[0];
    }
    
    return null;
  }

  findMissingCombinations(allCombinations, foundCombinations) {
    const missingCombinations = [];
    
    for (const combo of allCombinations) {
      const standardizedBizType = this.standardizeBusinessType(combo.businessType);
      const comboKey = `${standardizedBizType}|${combo.location}`;
      
      if (!foundCombinations.has(comboKey)) {
        missingCombinations.push({
          ...combo,
          standardizedBusinessType: standardizedBizType
        });
      }
    }
    
    return missingCombinations;
  }

  generateOptimizedQueries(missingCombinations) {
    const optimizedQueries = [];
    
    for (const combo of missingCombinations) {
      optimizedQueries.push({
        businessType: combo.businessType,
        location: combo.location,
        query: `${combo.businessType} in ${combo.location}`,
        maxResults: combo.maxResults
      });
      
      this.logger.info(`🎯 To Scrape: ${combo.businessType} in ${combo.location} (missing combination)`);
    }
    
    return optimizedQueries;
  }

  extractRelevantExistingLeads(existingLeads, allCombinations) {
    const relevantLeads = [];
    const seenLeads = new Set();
    
    for (const combo of allCombinations) {
      for (const lead of existingLeads) {
        const leadKey = `${lead.name_of_business}_${lead.phone_number}`.toLowerCase();
        
        if (seenLeads.has(leadKey)) continue;
        
        if (this.isLeadRelevantToCombination(lead, combo)) {
          seenLeads.add(leadKey);
          relevantLeads.push(lead);
        }
      }
    }
    
    return relevantLeads;
  }

  isLeadRelevantToCombination(lead, combo) {
    const leadBizType = (lead.type_of_business || '').toLowerCase();
    const leadSubCategory = (lead.sub_category || '').toLowerCase();
    const comboBizTypeLower = combo.businessType.toLowerCase();
    
    // Standardize both types for comparison (handles RV consolidation)
    const standardizedLeadType = this.standardizeBusinessType(leadBizType);
    const standardizedComboType = this.standardizeBusinessType(comboBizTypeLower);
    const standardizedSubCategory = this.standardizeBusinessType(leadSubCategory);
    
    // Business type match - exact match after standardization
    const bizTypeMatch = standardizedLeadType === standardizedComboType || 
                        standardizedSubCategory === standardizedComboType ||
                        leadBizType.includes(comboBizTypeLower) || 
                        leadSubCategory.includes(comboBizTypeLower);
    
    // Location match
    const leadZip = this.extractZipCode(lead);
    const leadCity = (lead.city || '').toLowerCase().trim();
    const comboLocationLower = combo.location.toLowerCase().trim();
    
    const locationMatch = leadZip === comboLocationLower || 
                         leadCity === comboLocationLower || 
                         (leadCity.includes(comboLocationLower) && comboLocationLower.length > 2);
    
    return bizTypeMatch && locationMatch;
  }

  fallbackToOriginalQueries(queries) {
    this.logger.warn('🔄 Falling back to original query behavior');
    
    const optimizedQueries = [];
    const seenCombos = new Set();
    
    for (const query of queries) {
      const businessTypes = this.parseBusinessTypes(query.businessType);
      const locations = this.parseLocations(query.location);
      
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
    
    return { optimizedQueries, existingLeads: [] };
  }

  parseBusinessTypes(businessTypesString) {
    if (!businessTypesString) return [];
    
    return businessTypesString
      .split(',')
      .map(type => type.trim())
      .filter(type => type.length > 0);
  }

  parseLocations(locationString) {
    if (!locationString) return [];
    
    return locationString
      .split(',')
      .map(location => location.trim())
      .filter(location => location.length > 0);
  }
}

module.exports = LeadOptimizationService; 