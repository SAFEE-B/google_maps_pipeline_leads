const { queueLogger } = require('../../utils/logger');
const { getAll } = require('../../database/setup');

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
  }

  /**
   * Advanced lead optimization based on Python script logic
   * Checks for existing business type/zip code combinations and generates queries only for missing ones
   */
  async checkExistingLeadsAndOptimizeQueries(queries) {
    const existingLeadsOutput = [];
    const optimizedQueries = [];

    try {
      this.logger.info(`🧠 Starting advanced lead optimization for ${queries.length} queries`);

      // Step 1: Parse all business types and locations
      const allCombinations = this.parseQueriesIntoCombinations(queries);
      this.logger.info(`📊 Parsed ${allCombinations.length} business type + location combinations`);

      // Step 2: Get all existing leads from database
      const existingLeads = await this.fetchExistingLeads();
      this.logger.info(`📋 Found ${existingLeads.length} existing leads in database`);

      // Step 3: Analyze existing business type/location combinations
      const foundCombinations = this.analyzeExistingCombinations(existingLeads);
      this.logger.info(`🔍 Found ${foundCombinations.size} existing business type/location combinations`);

      // Step 4: Determine missing combinations using Python script logic
      const missingCombinations = this.findMissingCombinations(allCombinations, foundCombinations);
      this.logger.info(`🎯 Identified ${missingCombinations.length} missing combinations that need scraping`);

      // Step 5: Generate optimized queries for missing combinations only
      optimizedQueries.push(...this.generateOptimizedQueries(missingCombinations));

      // Step 6: Extract existing leads for output
      existingLeadsOutput.push(...this.extractRelevantExistingLeads(existingLeads, allCombinations));

      this.logger.info(`✅ Optimization complete: ${optimizedQueries.length} queries to scrape, ${existingLeadsOutput.length} existing leads found`);

      return { optimizedQueries, existingLeads: existingLeadsOutput };

    } catch (error) {
      this.logger.error('❌ Error in advanced lead optimization:', error);
      // Fallback to original behavior
      return this.fallbackToOriginalQueries(queries);
    }
  }

  /**
   * Parse queries into individual business type + location combinations
   */
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

  /**
   * Fetch all existing leads from database
   */
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

  /**
   * Analyze existing leads to find standardized business type/location combinations
   * Implements the Python script logic for consolidating RV types
   */
  analyzeExistingCombinations(existingLeads) {
    const foundCombinations = new Set();
    
    for (const lead of existingLeads) {
      const leadBizType = (lead.type_of_business || '').toLowerCase().trim();
      const leadSubCategory = (lead.sub_category || '').toLowerCase().trim();
      const leadZip = this.extractZipCode(lead);
      const leadCity = (lead.city || '').toLowerCase().trim();
      
      if (!leadBizType || (!leadZip && !leadCity)) continue;
      
      // Standardize business type (consolidate RV types like Python script)
      const standardizedBizType = this.standardizeBusinessType(leadBizType);
      
      // Check sub-category filters like Python script
      if (!this.passesSubCategoryFilter(leadBizType, leadSubCategory)) {
        continue;
      }
      
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

  /**
   * Standardize business type - consolidate RV types like Python script
   */
  standardizeBusinessType(businessType) {
    const bizTypeLower = businessType.toLowerCase().trim();
    
    // If it's one of the consolidated RV types, use the representative
    if (CONSOLIDATED_RV_TYPES.has(bizTypeLower)) {
      return REPRESENTATIVE_RV_TYPE.toLowerCase();
    }
    
    return bizTypeLower;
  }

  /**
   * Check if business type passes sub-category filters (from Python script)
   */
  passesSubCategoryFilter(businessType, subCategory) {
    const bizTypeLower = businessType.toLowerCase().trim();
    const subCatLower = subCategory.toLowerCase().trim();
    
    // If this business type has sub-category filters defined
    if (SUB_CATEGORY_FILTERS[bizTypeLower]) {
      const allowedKeywords = SUB_CATEGORY_FILTERS[bizTypeLower];
      
      // Check if sub-category contains any of the allowed keywords
      return allowedKeywords.some(keyword => 
        subCatLower.includes(keyword.toLowerCase())
      );
    }
    
    // If no filters defined for this business type, it passes
    return true;
  }

  /**
   * Extract zip code from lead data
   */
  extractZipCode(lead) {
    let zipCode = (lead.zip_code || '').toString().trim();
    
    // Extract 5-digit zip code
    const zipMatch = zipCode.match(/\d{5}/);
    if (zipMatch) {
      return zipMatch[0];
    }
    
    return null;
  }

  /**
   * Find missing combinations that need scraping
   */
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

  /**
   * Generate optimized queries for missing combinations
   */
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

  /**
   * Extract relevant existing leads for output
   */
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

  /**
   * Check if lead is relevant to combination
   */
  isLeadRelevantToCombination(lead, combo) {
    const leadBizType = (lead.type_of_business || '').toLowerCase();
    const leadSubCategory = (lead.sub_category || '').toLowerCase();
    const comboBizTypeLower = combo.businessType.toLowerCase();
    
    // Business type match
    const bizTypeMatch = leadBizType.includes(comboBizTypeLower) || 
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

  /**
   * Fallback to original behavior if optimization fails
   */
  fallbackToOriginalQueries(queries) {
    this.logger.warn('🔄 Falling back to original query behavior due to optimization error');
    
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

  /**
   * Parse business types string (reused from existing code)
   */
  parseBusinessTypes(businessTypesString) {
    if (!businessTypesString) return [];
    
    return businessTypesString
      .split(',')
      .map(type => type.trim())
      .filter(type => type.length > 0);
  }

  /**
   * Parse locations string (reused from existing code)
   */
  parseLocations(locationString) {
    if (!locationString) return [];
    
    return locationString
      .split(',')
      .map(location => location.trim())
      .filter(location => location.length > 0);
  }
}

module.exports = LeadOptimizationService; 