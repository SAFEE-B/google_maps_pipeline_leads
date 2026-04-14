const express = require('express');
const Joi = require('joi');
const { getAll, getOne } = require('../database/setup');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const searchLeadsSchema = Joi.object({
  businessType: Joi.string().optional(),
  state: Joi.string().optional(),
  city: Joi.string().optional(),
  zipCode: Joi.string().optional(),
  area: Joi.string().optional(),
  minReviews: Joi.number().integer().min(0).optional(),
  maxReviews: Joi.number().integer().min(0).optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  maxRating: Joi.number().min(0).max(5).optional(),
  sourceFile: Joi.string().optional(),
  hasWebsite: Joi.boolean().optional(),
  hasEmail: Joi.boolean().optional(),
  hasPhone: Joi.boolean().optional(),
  multiple: Joi.object({
    businessTypes: Joi.array().items(Joi.string()).optional(),
    states: Joi.array().items(Joi.string()).optional(),
    cities: Joi.array().items(Joi.string()).optional(),
    zipCodes: Joi.array().items(Joi.string()).optional()
  }).optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
  orderBy: Joi.string().valid('name', 'rating', 'reviews', 'created_at').default('created_at'),
  orderDirection: Joi.string().valid('ASC', 'DESC').default('DESC')
});

// Search leads with filters
router.get('/search', async (req, res) => {
  try {
    const { error, value } = searchLeadsSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.details 
      });
    }

    const {
      businessType,
      state,
      city,
      zipCode,
      area,
      minReviews,
      maxReviews,
      minRating,
      maxRating,
      sourceFile,
      hasWebsite,
      hasEmail,
      hasPhone,
      multiple,
      limit,
      offset,
      orderBy,
      orderDirection
    } = value;

    // Build dynamic query
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    // Single value filters
    if (businessType) {
      query += ' AND UPPER(type_of_business) LIKE UPPER(?)';
      params.push(`%${businessType}%`);
    }

    if (state) {
      query += ' AND UPPER(state) = UPPER(?)';
      params.push(state);
    }

    if (city) {
      query += ' AND UPPER(city) LIKE UPPER(?)';
      params.push(`%${city}%`);
    }

    if (zipCode) {
      query += ' AND zip_code = ?';
      params.push(zipCode);
    }

    // Area search (searches in both city and business address)
    if (area) {
      query += ' AND (UPPER(city) LIKE UPPER(?) OR UPPER(business_address) LIKE UPPER(?))';
      params.push(`%${area}%`, `%${area}%`);
    }

    // Multiple value filters
    if (multiple) {
      if (multiple.businessTypes && multiple.businessTypes.length > 0) {
        const placeholders = multiple.businessTypes.map(() => 'UPPER(type_of_business) LIKE UPPER(?)').join(' OR ');
        query += ` AND (${placeholders})`;
        multiple.businessTypes.forEach(bt => params.push(`%${bt}%`));
      }

      if (multiple.states && multiple.states.length > 0) {
        const placeholders = multiple.states.map(() => 'UPPER(state) = UPPER(?)').join(' OR ');
        query += ` AND (${placeholders})`;
        multiple.states.forEach(s => params.push(s));
      }

      if (multiple.cities && multiple.cities.length > 0) {
        const placeholders = multiple.cities.map(() => 'UPPER(city) LIKE UPPER(?)').join(' OR ');
        query += ` AND (${placeholders})`;
        multiple.cities.forEach(c => params.push(`%${c}%`));
      }

      if (multiple.zipCodes && multiple.zipCodes.length > 0) {
        const placeholders = multiple.zipCodes.map(() => 'zip_code = ?').join(' OR ');
        query += ` AND (${placeholders})`;
        multiple.zipCodes.forEach(zc => params.push(zc));
      }
    }

    // Review filters
    if (minReviews !== undefined) {
      query += ' AND num_reviews >= ?';
      params.push(minReviews);
    }

    if (maxReviews !== undefined) {
      query += ' AND num_reviews <= ?';
      params.push(maxReviews);
    }

    // Rating filters
    if (minRating !== undefined) {
      query += ' AND rating >= ?';
      params.push(minRating);
    }

    if (maxRating !== undefined) {
      query += ' AND rating <= ?';
      params.push(maxRating);
    }

    // Source file filter
    if (sourceFile) {
      query += ' AND source_file LIKE ?';
      params.push(`%${sourceFile}%`);
    }

    // Contact information filters
    if (hasWebsite !== undefined) {
      query += hasWebsite 
        ? ' AND website IS NOT NULL AND website != ""'
        : ' AND (website IS NULL OR website = "")';
    }

    if (hasEmail !== undefined) {
      query += hasEmail 
        ? ' AND email IS NOT NULL AND email != ""'
        : ' AND (email IS NULL OR email = "")';
    }

    if (hasPhone !== undefined) {
      query += hasPhone 
        ? ' AND phone_number IS NOT NULL AND phone_number != ""'
        : ' AND (phone_number IS NULL OR phone_number = "")';
    }

    // Add ordering
    const validOrderColumns = {
      'name': 'name_of_business',
      'rating': 'rating',
      'reviews': 'num_reviews',
      'created_at': 'created_at'
    };
    
    query += ` ORDER BY ${validOrderColumns[orderBy]} ${orderDirection}`;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const leads = await getAll(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM leads WHERE 1=1';
    const countParams = [];
    
    // Rebuild the same WHERE conditions for count query
    if (businessType) {
      countQuery += ' AND UPPER(type_of_business) LIKE UPPER(?)';
      countParams.push(`%${businessType}%`);
    }
    if (state) {
      countQuery += ' AND UPPER(state) = UPPER(?)';
      countParams.push(state);
    }
    if (city) {
      countQuery += ' AND UPPER(city) LIKE UPPER(?)';
      countParams.push(`%${city}%`);
    }
    if (zipCode) {
      countQuery += ' AND zip_code = ?';
      countParams.push(zipCode);
    }
    if (area) {
      countQuery += ' AND (UPPER(city) LIKE UPPER(?) OR UPPER(business_address) LIKE UPPER(?))';
      countParams.push(`%${area}%`, `%${area}%`);
    }
    if (multiple) {
      if (multiple.businessTypes && multiple.businessTypes.length > 0) {
        const placeholders = multiple.businessTypes.map(() => 'UPPER(type_of_business) LIKE UPPER(?)').join(' OR ');
        countQuery += ` AND (${placeholders})`;
        multiple.businessTypes.forEach(bt => countParams.push(`%${bt}%`));
      }
      if (multiple.states && multiple.states.length > 0) {
        const placeholders = multiple.states.map(() => 'UPPER(state) = UPPER(?)').join(' OR ');
        countQuery += ` AND (${placeholders})`;
        multiple.states.forEach(s => countParams.push(s));
      }
      if (multiple.cities && multiple.cities.length > 0) {
        const placeholders = multiple.cities.map(() => 'UPPER(city) LIKE UPPER(?)').join(' OR ');
        countQuery += ` AND (${placeholders})`;
        multiple.cities.forEach(c => countParams.push(`%${c}%`));
      }
      if (multiple.zipCodes && multiple.zipCodes.length > 0) {
        const placeholders = multiple.zipCodes.map(() => 'zip_code = ?').join(' OR ');
        countQuery += ` AND (${placeholders})`;
        multiple.zipCodes.forEach(zc => countParams.push(zc));
      }
    }
    if (minReviews !== undefined) {
      countQuery += ' AND num_reviews >= ?';
      countParams.push(minReviews);
    }
    if (maxReviews !== undefined) {
      countQuery += ' AND num_reviews <= ?';
      countParams.push(maxReviews);
    }
    if (minRating !== undefined) {
      countQuery += ' AND rating >= ?';
      countParams.push(minRating);
    }
    if (maxRating !== undefined) {
      countQuery += ' AND rating <= ?';
      countParams.push(maxRating);
    }
    if (sourceFile) {
      countQuery += ' AND source_file LIKE ?';
      countParams.push(`%${sourceFile}%`);
    }
    if (hasWebsite !== undefined) {
      countQuery += hasWebsite 
        ? ' AND website IS NOT NULL AND website != ""'
        : ' AND (website IS NULL OR website = "")';
    }
    if (hasEmail !== undefined) {
      countQuery += hasEmail 
        ? ' AND email IS NOT NULL AND email != ""'
        : ' AND (email IS NULL OR email = "")';
    }
    if (hasPhone !== undefined) {
      countQuery += hasPhone 
        ? ' AND phone_number IS NOT NULL AND phone_number != ""'
        : ' AND (phone_number IS NULL OR phone_number = "")';
    }

    const countResult = await getOne(countQuery, countParams);
    const total = countResult?.total || 0;

    // Generate summary statistics
    const summary = generateSearchSummary(leads);

    res.json({
      success: true,
      leads,
      summary,
      pagination: {
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: Math.floor(offset / limit) + 1
      },
      appliedFilters: {
        businessType,
        state,
        city,
        zipCode,
        area,
        minReviews,
        maxReviews,
        minRating,
        maxRating,
        hasWebsite,
        hasEmail,
        hasPhone,
        multiple
      }
    });

  } catch (error) {
    logger.error('Error searching leads:', error);
    res.status(500).json({ 
      error: 'Failed to search leads',
      message: error.message
    });
  }
});

// Get lead by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await getOne('SELECT * FROM leads WHERE id = ?', [id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      success: true,
      lead
    });

  } catch (error) {
    logger.error('Error getting lead:', error);
    res.status(500).json({ 
      error: 'Failed to get lead',
      message: error.message
    });
  }
});

// Get leads statistics
router.get('/stats/summary', async (req, res) => {
  try {
    // Get overall statistics
    const totalLeads = await getOne('SELECT COUNT(*) as count FROM leads');
    const totalByState = await getAll('SELECT state, COUNT(*) as count FROM leads WHERE state IS NOT NULL GROUP BY state ORDER BY count DESC LIMIT 10');
    const totalByBusinessType = await getAll('SELECT type_of_business, COUNT(*) as count FROM leads WHERE type_of_business IS NOT NULL GROUP BY type_of_business ORDER BY count DESC LIMIT 10');
    const recentLeads = await getAll('SELECT COUNT(*) as count FROM leads WHERE created_at >= datetime("now", "-7 days")');

    // Get rating distribution
    const ratingDistribution = await getAll(`
      SELECT 
        CASE 
          WHEN rating >= 4.5 THEN '4.5+'
          WHEN rating >= 4.0 THEN '4.0-4.4'
          WHEN rating >= 3.5 THEN '3.5-3.9'
          WHEN rating >= 3.0 THEN '3.0-3.4'
          ELSE 'Below 3.0'
        END as rating_range,
        COUNT(*) as count
      FROM leads 
      WHERE rating IS NOT NULL 
      GROUP BY rating_range
    `);

    // Get review count distribution
    const reviewDistribution = await getAll(`
      SELECT 
        CASE 
          WHEN num_reviews >= 100 THEN '100+'
          WHEN num_reviews >= 50 THEN '50-99'
          WHEN num_reviews >= 20 THEN '20-49'
          WHEN num_reviews >= 10 THEN '10-19'
          WHEN num_reviews >= 1 THEN '1-9'
          ELSE '0'
        END as review_range,
        COUNT(*) as count
      FROM leads 
      GROUP BY review_range
    `);

    res.json({
      success: true,
      stats: {
        totalLeads: totalLeads?.count || 0,
        recentLeads: recentLeads?.[0]?.count || 0,
        byState: totalByState,
        byBusinessType: totalByBusinessType,
        ratingDistribution,
        reviewDistribution
      }
    });

  } catch (error) {
    logger.error('Error getting leads statistics:', error);
    res.status(500).json({ 
      error: 'Failed to get leads statistics',
      message: error.message
    });
  }
});

// Get available filter options
router.get('/filters/options', async (req, res) => {
  try {
    const states = await getAll('SELECT DISTINCT state FROM leads WHERE state IS NOT NULL AND state != "" ORDER BY state');
    const businessTypes = await getAll('SELECT DISTINCT type_of_business FROM leads WHERE type_of_business IS NOT NULL AND type_of_business != "" ORDER BY type_of_business');
    const sourceFiles = await getAll('SELECT DISTINCT source_file FROM leads WHERE source_file IS NOT NULL AND source_file != "" ORDER BY source_file');

    // Extract only first sources from combined sources and get unique values
    const firstSources = [...new Set(sourceFiles.map(sf => {
      const sourceFile = sf.source_file;
      if (!sourceFile || sourceFile === 'Not in any file' || sourceFile === 'Not in any list') {
        return sourceFile;
      }
      // If source contains pipe separators, return only the first one
      if (sourceFile.includes(' | ')) {
        return sourceFile.split(' | ')[0];
      }
      return sourceFile;
    }))].sort();

    res.json({
      success: true,
      filters: {
        states: states.map(s => s.state),
        businessTypes: businessTypes.map(bt => bt.type_of_business),
        sourceFiles: firstSources
      }
    });

  } catch (error) {
    logger.error('Error getting filter options:', error);
    res.status(500).json({ 
      error: 'Failed to get filter options',
      message: error.message
    });
  }
});

// Advanced search with natural language processing
router.post('/search/natural', async (req, res) => {
  try {
    const { query: searchQuery } = req.body;

    if (!searchQuery || typeof searchQuery !== 'string') {
      return res.status(400).json({ 
        error: 'Search query is required and must be a string' 
      });
    }

    // Simple natural language processing
    const filters = parseNaturalLanguageQuery(searchQuery.toLowerCase());
    
    // Build SQL query based on parsed filters
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];

    if (filters.businessType) {
      query += ' AND type_of_business LIKE ?';
      params.push(`%${filters.businessType}%`);
    }

    if (filters.state) {
      query += ' AND state LIKE ?';
      params.push(`%${filters.state}%`);
    }

    if (filters.city) {
      query += ' AND city LIKE ?';
      params.push(`%${filters.city}%`);
    }

    if (filters.zipCode) {
      query += ' AND zip_code = ?';
      params.push(filters.zipCode);
    }

    if (filters.minRating) {
      query += ' AND rating >= ?';
      params.push(filters.minRating);
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const leads = await getAll(query, params);

    res.json({
      success: true,
      originalQuery: searchQuery,
      parsedFilters: filters,
      leads,
      count: leads.length
    });

  } catch (error) {
    logger.error('Error performing natural language search:', error);
    res.status(500).json({ 
      error: 'Failed to perform natural language search',
      message: error.message
    });
  }
});

// Helper function to parse natural language queries
function parseNaturalLanguageQuery(query) {
  const filters = {};
  const lowerQuery = query.toLowerCase();

  // Enhanced business type patterns
  const businessTypes = [
    'gym', 'gyms', 'fitness center', 'fitness centers', 'fitness',
    'restaurant', 'restaurants', 'cafe', 'cafes', 'diner', 'diners',
    'hotel', 'hotels', 'motel', 'motels', 'inn', 'inns',
    'warehouse', 'warehouses', 'storage', 'distribution center',
    'factory', 'factories', 'manufacturing', 'plant',
    'school', 'schools', 'university', 'universities', 'college', 'colleges',
    'laundromat', 'laundromats', 'laundry',
    'auto repair', 'auto shop', 'mechanic', 'garage',
    'nursing home', 'nursing homes', 'care facility', 'senior care',
    'mobile home park', 'mobile home parks', 'trailer park',
    'rv park', 'rv parks', 'campground', 'camping',
    'apartment', 'apartments', 'apartment complex',
    'store', 'shop', 'retail', 'market', 'supermarket',
    'office', 'clinic', 'medical', 'dental', 'pharmacy'
  ];
  
  for (const type of businessTypes) {
    if (lowerQuery.includes(type)) {
      filters.businessType = type;
      break;
    }
  }

  // Enhanced state patterns
  const statePatterns = [
    { pattern: /\bcalifornia\b|\bca\b|\bcal\b/, state: 'CA' },
    { pattern: /\btexas\b|\btx\b/, state: 'TX' },
    { pattern: /\bflorida\b|\bfl\b|\bfla\b/, state: 'FL' },
    { pattern: /\bnew york\b|\bny\b|\bnyc\b/, state: 'NY' },
    { pattern: /\bwashington\b|\bwa\b/, state: 'WA' },
    { pattern: /\bnevada\b|\bnv\b/, state: 'NV' },
    { pattern: /\boregon\b|\bor\b/, state: 'OR' },
    { pattern: /\barizona\b|\baz\b/, state: 'AZ' },
    { pattern: /\butah\b|\but\b/, state: 'UT' },
    { pattern: /\bcolorado\b|\bco\b/, state: 'CO' },
    { pattern: /\billinois\b|\bil\b/, state: 'IL' },
    { pattern: /\bpennsylvania\b|\bpa\b/, state: 'PA' },
    { pattern: /\bgeorgia\b|\bga\b/, state: 'GA' },
    { pattern: /\bnorth carolina\b|\bnc\b/, state: 'NC' },
    { pattern: /\bsouth carolina\b|\bsc\b/, state: 'SC' },
    { pattern: /\bvirginia\b|\bva\b/, state: 'VA' },
    { pattern: /\bmichigan\b|\bmi\b/, state: 'MI' },
    { pattern: /\bohio\b|\boh\b/, state: 'OH' }
  ];

  for (const { pattern, state } of statePatterns) {
    if (pattern.test(lowerQuery)) {
      filters.state = state;
      break;
    }
  }

  // Multiple zip codes pattern
  const zipMatches = lowerQuery.match(/\b\d{5}\b/g);
  if (zipMatches) {
    if (zipMatches.length === 1) {
      filters.zipCode = zipMatches[0];
    } else {
      filters.multiple = { zipCodes: zipMatches };
    }
  }

  // Enhanced rating patterns
  if (lowerQuery.includes('high rating') || lowerQuery.includes('well rated') || lowerQuery.includes('highly rated')) {
    filters.minRating = 4.0;
  } else if (lowerQuery.includes('excellent rating') || lowerQuery.includes('5 star') || lowerQuery.includes('five star')) {
    filters.minRating = 4.5;
  } else if (lowerQuery.includes('good rating') || lowerQuery.includes('4 star') || lowerQuery.includes('four star')) {
    filters.minRating = 3.5;
  }

  // Review count patterns
  if (lowerQuery.includes('many reviews') || lowerQuery.includes('lots of reviews')) {
    filters.minReviews = 50;
  } else if (lowerQuery.includes('some reviews') || lowerQuery.includes('few reviews')) {
    filters.minReviews = 10;
  }

  // Contact information patterns
  if (lowerQuery.includes('with website') || lowerQuery.includes('have website')) {
    filters.hasWebsite = true;
  } else if (lowerQuery.includes('without website') || lowerQuery.includes('no website')) {
    filters.hasWebsite = false;
  }

  if (lowerQuery.includes('with email') || lowerQuery.includes('have email')) {
    filters.hasEmail = true;
  } else if (lowerQuery.includes('without email') || lowerQuery.includes('no email')) {
    filters.hasEmail = false;
  }

  if (lowerQuery.includes('with phone') || lowerQuery.includes('have phone')) {
    filters.hasPhone = true;
  } else if (lowerQuery.includes('without phone') || lowerQuery.includes('no phone')) {
    filters.hasPhone = false;
  }

  // Enhanced city patterns
  const cityKeywords = ['in', 'near', 'around', 'from', 'at'];
  for (const keyword of cityKeywords) {
    const pattern = new RegExp(`${keyword}\\s+([a-zA-Z\\s]+?)(?:\\s|$|,|\\.| and| or)`, 'i');
    const match = lowerQuery.match(pattern);
    if (match && match[1] && !filters.state) {
      const potentialCity = match[1].trim();
      // Filter out common words that aren't cities
      const commonWords = ['the', 'with', 'and', 'or', 'that', 'have', 'high', 'good', 'excellent'];
      if (potentialCity.length > 2 && potentialCity.length < 30 && 
          !commonWords.includes(potentialCity.toLowerCase())) {
        filters.city = potentialCity;
        break;
      }
    }
  }

  // Area/region patterns
  const areaKeywords = ['area', 'region', 'district', 'zone', 'vicinity'];
  for (const keyword of areaKeywords) {
    if (lowerQuery.includes(keyword)) {
      const pattern = new RegExp(`([a-zA-Z\\s]+?)\\s+${keyword}`, 'i');
      const match = lowerQuery.match(pattern);
      if (match && match[1]) {
        const potentialArea = match[1].trim();
        if (potentialArea.length > 2 && potentialArea.length < 30) {
          filters.area = potentialArea;
          break;
        }
      }
    }
  }

  return filters;
}

// Helper function to generate search summary
function generateSearchSummary(leads) {
  if (leads.length === 0) {
    return {
      total: 0,
      avgRating: 0,
      totalReviews: 0,
      withWebsite: 0,
      withEmail: 0,
      withPhone: 0,
      topStates: [],
      topBusinessTypes: []
    };
  }

  const summary = {
    total: leads.length,
    avgRating: leads.reduce((sum, lead) => sum + (lead.rating || 0), 0) / leads.length,
    totalReviews: leads.reduce((sum, lead) => sum + (lead.num_reviews || 0), 0),
    withWebsite: leads.filter(lead => lead.website && lead.website.trim() !== '').length,
    withEmail: leads.filter(lead => lead.email && lead.email.trim() !== '').length,
    withPhone: leads.filter(lead => lead.phone_number && lead.phone_number.trim() !== '').length
  };

  // Get top states
  const stateCount = {};
  leads.forEach(lead => {
    if (lead.state) {
      stateCount[lead.state] = (stateCount[lead.state] || 0) + 1;
    }
  });
  summary.topStates = Object.entries(stateCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([state, count]) => ({ state, count }));

  // Get top business types
  const businessTypeCount = {};
  leads.forEach(lead => {
    if (lead.type_of_business) {
      businessTypeCount[lead.type_of_business] = (businessTypeCount[lead.type_of_business] || 0) + 1;
    }
  });
  summary.topBusinessTypes = Object.entries(businessTypeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  return summary;
}

module.exports = router; 