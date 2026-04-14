const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');

// Use the same database setup as the main system
const { setupDatabase, runQuery, getOne, getAll } = require('../src/database/setup');

// Ensure we're using the correct database path (Backend/data/leads.db, not scripts/data/leads.db)  
process.env.DATABASE_URL = path.join(__dirname, '..', 'data', 'leads.db');

// Files directory
const filesDir = path.join(__dirname, '..', 'Files');

// Progress tracking
let totalFiles = 0;
let processedFiles = 0;
let totalLeads = 0;
let successfulLeads = 0;
let errorLeads = 0;
let totalNewLeads = 0;
let totalDuplicates = 0;
let totalFiltered = 0;

// Column mapping - maps various possible column names to our database columns
const columnMapping = {
  // Business name variations
  'name_of_business': ['Name of Business', 'Business Name', 'Name', 'Company Name', 'name_of_business'],
  
  // Business type variations
  'type_of_business': ['Type of Business', 'Business Type', 'Type', 'Category', 'type_of_business'],
  
  // Sub-category variations
  'sub_category': ['Sub-Category', 'Subcategory', 'Sub Category', 'Secondary Category', 'sub_category'],
  
  // Contact info variations
  'website': ['Website', 'Website URL', 'URL', 'Web', 'website'],
  'phone_number': ['Phone Number', 'Phone', 'Contact Number', 'Tel', 'Telephone', 'phone_number'],
  'email': ['Email', 'Email Address', 'E-mail', 'Contact Email', 'email'],
  
  // Address variations
  'business_address': ['Business Address', 'Address', 'Full Address', 'Location', 'business_address'],
  'city': ['City', 'city'],
  'state': ['State', 'Province', 'Region', 'state'],
  'zip_code': ['Zip Code', 'ZIP', 'Postal Code', 'zip_code'],
  
  // Review data variations
  'rating': ['Rating', 'Stars', 'Score', 'rating'],
  'num_reviews': ['# of Reviews', 'Number of Reviews', 'Review Count', 'Reviews', 'num_reviews'],
  'latest_review': ['Latest Review', 'Last Review', 'Recent Review', 'Latest Review Date', 'latest_review'],
  
  // Additional fields
  'notes': ['Notes', 'Comments', 'Remarks', 'notes'],
  
  // Source file variations
  'source_file': ['Source File', 'Source', 'File Source', 'Original Source', 'Data Source', 'source_file']
};

// Business type filters - only keep leads with these sub-categories
const SUB_CATEGORY_FILTERS = {
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

// Function to check if a lead should be filtered based on business type and sub-category
function shouldApplyBusinessTypeFilter(typeOfBusiness, subCategory) {
  if (!typeOfBusiness) return false;
  
  const primaryType = typeOfBusiness.toLowerCase().trim();
  
  // Check if this business type is in our filters
  const shouldApplyFilter = Object.keys(SUB_CATEGORY_FILTERS).some(filterKey =>
    filterKey.toLowerCase() === primaryType || primaryType.includes(filterKey.toLowerCase())
  );
  
  if (shouldApplyFilter) {
    // This business type IS in the SUB_CATEGORY_FILTERS, so apply filtering
    const allowedSubcategories = SUB_CATEGORY_FILTERS[primaryType] ||
      SUB_CATEGORY_FILTERS[Object.keys(SUB_CATEGORY_FILTERS).find(key => key.toLowerCase() === primaryType)];
    
    if (allowedSubcategories && subCategory) {
      const subCategoryLower = subCategory.toLowerCase().trim();
      // Check if sub-category contains any of the allowed keywords (partial matching)
      const isAllowed = allowedSubcategories.some(allowed => 
        subCategoryLower.includes(allowed.toLowerCase())
      );
      return !isAllowed; // Return true if should be filtered OUT
    } else {
      // No sub-category provided for a business type that requires filtering
      return true; // Filter out leads without proper sub-category
    }
  } else {
    // This business type is NOT in SUB_CATEGORY_FILTERS, so no filtering - allow all leads that match the type
    return false;
  }
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

// Function to extract state and zip code from address
function extractLocationFromAddress(address) {
  if (!address || typeof address !== 'string') return { city: null, state: null, zipCode: null };
  
  // Common patterns for US addresses
  const stateZipPattern = /,\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)/i; // Added case-insensitive flag
  const statePattern = /,\s*([A-Z]{2})(?:\s|,|$)/i; // Added case-insensitive flag
  const zipPattern = /\b(\d{5}(-\d{4})?)\b/; // Fixed: ) instead of }
  
  let state = null;
  let zipCode = null;
  let city = null;
  
  // Try to extract state and zip together
  const stateZipMatch = address.match(stateZipPattern);
  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase(); // Ensure uppercase
    zipCode = stateZipMatch[2];
  } else {
    // Try to extract state alone
    const stateMatch = address.match(statePattern);
    if (stateMatch) {
      state = stateMatch[1].toUpperCase(); // Ensure uppercase
    }
    
    // Try to extract zip alone
    const zipMatch = address.match(zipPattern);
    if (zipMatch) {
      zipCode = zipMatch[1];
    }
  }
  
  // Try to extract city (text before the last comma and state)
  if (state) {
    const cityPatternStr = `([^,]+),\\s*${state}`;
    const cityPattern = new RegExp(cityPatternStr, 'i'); // Case-insensitive
    const cityMatch = address.match(cityPattern);
    if (cityMatch && cityMatch[1]) {
      const cityPart = cityMatch[1].trim();
      // Remove any preceding address parts - take the last part before state
      const cityWords = cityPart.split(',');
      city = cityWords[cityWords.length - 1].trim();
    }
  } else if (zipCode) { 
    // If no state, try to get city based on zip if address is simple
    const cityZipPattern = new RegExp(`([^,]+),\\s*${zipCode.substring(0,5)}`, 'i');
    const cityMatchSimple = address.match(cityZipPattern);
    if (cityMatchSimple && cityMatchSimple[1]) {
        city = cityMatchSimple[1].trim();
    }
  }
  
  return { city, state, zipCode: cleanZipCode(zipCode) }; // Ensure zip is also cleaned
}

// Function to get source priority (lower number = higher priority)
// Both "Not in any list" and "Not in any file" get overridden by any real filename
function getSourcePriority(source) {
  if (source === "Not in any list") {
    return 100; // Lowest priority - always gets overridden by filenames
  } else if (source === "Not in any file") {
    return 10; // Second lowest priority (for scraped data)
  } else {
    return 1; // Higher priority for named files
  }
}

// Function to combine sources intelligently
// Special rule: Both "Not in any list" and "Not in any file" get overridden by any real filename
function combineSources(source1, source2) {
  if (!source1 && !source2) return "Not in any list";
  if (!source1) return source2;
  if (!source2) return source1;
  if (source1 === source2) return source1;
  
  // Split existing combined sources and merge
  const sources1 = source1.includes(" | ") ? source1.split(" | ") : [source1];
  const sources2 = source2.includes(" | ") ? source2.split(" | ") : [source2];
  
  // Combine all sources
  const allSources = [...sources1, ...sources2];
  
  // Remove duplicates
  const uniqueSources = [...new Set(allSources)];
  
  // Special logic: "Not in any list" and "Not in any file" get overridden by any real filename
  const hasRealFilenames = uniqueSources.some(source => 
    source !== "Not in any list" && source !== "Not in any file"
  );
  
  let finalSources;
  if (hasRealFilenames) {
    // If we have real filenames, exclude both placeholder sources
    finalSources = uniqueSources.filter(source => 
      source !== "Not in any list" && source !== "Not in any file"
    );
  } else {
    // If no real filenames, keep all sources
    finalSources = uniqueSources;
  }
  
  // Sort by priority (higher priority sources first)
  finalSources.sort((a, b) => getSourcePriority(a) - getSourcePriority(b));
  
  return finalSources.join(" | ");
}

// Advanced deduplication function with priority and source combination
async function handleLeadDeduplication(leadData) {
  try {
    // Check for existing lead by phone number AND name (more precise matching)
    const existingLead = await getOne(`
      SELECT * FROM leads 
      WHERE phone_number = ? AND LOWER(TRIM(name_of_business)) = LOWER(TRIM(?))
    `, [leadData.phoneNumber, leadData.nameOfBusiness]);

    if (existingLead) {
      // Duplicate found - apply priority and source combination logic
      const currentPriority = getSourcePriority(leadData.sourceFile);
      const existingPriority = getSourcePriority(existingLead.source_file);
      
            let finalSource;
      let shouldUpdateData = false;
      
      if (currentPriority < existingPriority) {
        // New lead has higher priority - use new data, but combine sources
        finalSource = combineSources(leadData.sourceFile, existingLead.source_file);
        shouldUpdateData = true;
      } else if (currentPriority > existingPriority) {
        // Existing lead has higher priority - keep existing data, but combine sources
        finalSource = combineSources(existingLead.source_file, leadData.sourceFile);
        shouldUpdateData = false;
      } else {
        // Same priority - combine sources, update data (newer info)
        finalSource = combineSources(existingLead.source_file, leadData.sourceFile);
        shouldUpdateData = true;
      }
       
       // Note: combineSources automatically handles both "Not in any list" and "Not in any file" override
      
      // Update the lead with appropriate data and combined sources
      if (shouldUpdateData) {
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
          leadData.phoneNumber,
          leadData.nameOfBusiness
        ]);
      } else {
        // Just update the source (keep existing data)
        await runQuery(`
          UPDATE leads SET
            source_file = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE phone_number = ? AND LOWER(TRIM(name_of_business)) = LOWER(TRIM(?))
        `, [
          finalSource,
          leadData.phoneNumber,
          leadData.nameOfBusiness
        ]);
      }
      
      return { isDuplicate: true };
      
    } else {
      // No duplicate - insert new lead
      await runQuery(`
        INSERT INTO leads (
          name_of_business, type_of_business, sub_category, website, phone_number, email,
          business_address, city, state, zip_code, rating, num_reviews, latest_review,
          notes, source_file, job_id, scraped_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
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
        leadData.sourceFile,
        null, // job_id (null for imported files)
        null  // scraped_at (null for imported files, they use created_at instead)
      ]);
      
      return { isDuplicate: false };
    }
    
  } catch (error) {
    console.error(`   ❌ Error handling deduplication:`, error.message);
    throw error;
  }
}

// Function to process a single Excel file
async function processExcelFile(filePath, fileName) {
  try {
    console.log(`📄 Processing: ${fileName}`);
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header row - preserve raw string values to keep leading zeros
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      raw: true,      // Keep original values as they appear in Excel
      defval: ''      // Default value for empty cells
    });
    
    if (jsonData.length < 2) {
      console.log(`⚠️  Skipping ${fileName}: No data rows found`);
      return { processed: 0, errors: 0, newLeads: 0, duplicates: 0, filtered: 0 };
    }
    
    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    // Map headers to our database columns
    const columnMap = {};
    
    for (const [dbColumn, possibleNames] of Object.entries(columnMapping)) {
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i]?.toString().trim();
        if (header && possibleNames.some(name => name.toLowerCase() === header.toLowerCase())) {
          columnMap[dbColumn] = i;
          break;
        }
      }
    }
    
    console.log(`   📊 Found columns:`, Object.keys(columnMap));
    
    let fileProcessed = 0;
    let fileErrors = 0;
    let duplicatesFound = 0;
    let newLeads = 0;
    let filteredLeads = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      try {
        // Extract data using column mapping
        const businessName = row[columnMap.name_of_business] || '';
        const businessAddress = row[columnMap.business_address] || '';
        const phoneNumber = row[columnMap.phone_number]?.toString().trim() || null;
        
        // Skip rows without essential data (need at least business name or phone number)
        if (!businessName && !phoneNumber) {
          continue;
        }
        
        // Extract location info from address if not in separate columns
        const addressLocation = extractLocationFromAddress(businessAddress);
        
        // Determine source file with specific business rules:
        // 1. If filename starts with "default" → "Not in any list"
        // 2. If not default + source column has "scraped new" etc → use current filename  
        // 3. If not default + source column has different file name → keep original source
        // 4. If not default + no source column → use current filename
        // Note: Both "Not in any list" and "Not in any file" will be overridden by real filenames during deduplication
        let sourceFile;
        
        // Rule 1: If filename starts with "default" → source = "Not in any list"
        if (fileName.toLowerCase().startsWith('default')) {
          sourceFile = "Not in any list";
        }
        // Rule 2: If filename doesn't start with "default"
        else {
          // Check if source column exists and has a value
          if (columnMap.source_file !== undefined && row[columnMap.source_file]) {
            const excelSource = row[columnMap.source_file]?.toString().trim();
            
            if (excelSource && excelSource !== '') {
              // Check if source value indicates "scraped/new" data
              const lowerSource = excelSource.toLowerCase();
              const scrapedIndicators = [
                'scraped new', 'not in any file', 'not in any list', 
                'scraped', 'new', 'fresh', 'newly scraped'
              ];
              
              const isScrapedSource = scrapedIndicators.some(indicator => 
                lowerSource.includes(indicator)
              );
              
              if (isScrapedSource) {
                // If source indicates scraped/new data → use current filename
                sourceFile = fileName;
              } else {
                // If source has a different file name → keep that original source
                sourceFile = excelSource;
              }
            } else {
              // Source column exists but empty → use filename
              sourceFile = fileName;
            }
          } else {
            // No source column → use filename
            sourceFile = fileName;
          }
        }
        
        const leadData = {
          nameOfBusiness: businessName?.toString().trim() || '',
          typeOfBusiness: row[columnMap.type_of_business]?.toString().trim() || '',
          subCategory: row[columnMap.sub_category]?.toString().trim() || '',
          website: row[columnMap.website]?.toString().trim() || null,
          phoneNumber: phoneNumber,
          email: row[columnMap.email]?.toString().trim() || null,
          businessAddress: businessAddress,
          city: row[columnMap.city]?.toString().trim() || addressLocation.city,
          state: row[columnMap.state]?.toString().trim() || addressLocation.state,
          zipCode: cleanZipCode(row[columnMap.zip_code]?.toString().trim() || addressLocation.zipCode),
          rating: parseFloat(row[columnMap.rating]) || null,
          numReviews: parseInt(row[columnMap.num_reviews]) || 0,
          latestReview: row[columnMap.latest_review]?.toString().trim() || null,
          notes: row[columnMap.notes]?.toString().trim() || null,
          sourceFile: sourceFile
        };
        
        // Apply business type filtering - skip leads that don't match our criteria
        if (shouldApplyBusinessTypeFilter(leadData.typeOfBusiness, leadData.subCategory)) {
          filteredLeads++;
          continue; // Skip this lead - it doesn't match our business type filters
        }
        
        // Advanced deduplication with priority and source combination
        const deduplicationResult = await handleLeadDeduplication(leadData);
        
        if (deduplicationResult.isDuplicate) {
          duplicatesFound++;
        } else {
          newLeads++;
        }
        
        fileProcessed++;
        
      } catch (rowError) {
        fileErrors++;
      }
    }
    
    console.log(`   ✅ ${fileName}: ${fileProcessed} leads processed (${newLeads} new, ${duplicatesFound} duplicates), ${filteredLeads} filtered out, ${fileErrors} errors`);
    return { 
      processed: fileProcessed, 
      errors: fileErrors, 
      newLeads: newLeads, 
      duplicates: duplicatesFound,
      filtered: filteredLeads
    };
    
  } catch (error) {
    console.error(`   ❌ Error processing ${fileName}:`, error.message);
    return { processed: 0, errors: 1, newLeads: 0, duplicates: 0, filtered: 0 };
  }
}

// Main import function
async function importAllLeadFiles() {
  console.log('🚀 Starting import of all lead files...\n');
  
  try {
    // Setup database with full schema (creates all tables if they don't exist)
    console.log('📊 Setting up database schema...');
    await setupDatabase();
    console.log('✅ Database schema ready\n');
    
    // Get list of Excel files
    const files = await fs.readdir(filesDir);
    const excelFiles = files.filter(file => 
      file.endsWith('.xlsx') || file.endsWith('.xls') || file.endsWith('.csv')
    );
    
    totalFiles = excelFiles.length;
    console.log(`📁 Found ${totalFiles} lead files to process\n`);
    
    if (totalFiles === 0) {
      console.log('⚠️  No Excel/CSV files found in the Files directory');
      console.log(`📂 Looking in: ${filesDir}`);
      return;
    }
    
    // Process each file
    for (const fileName of excelFiles) {
      const filePath = path.join(filesDir, fileName);
      
      try {
        const result = await processExcelFile(filePath, fileName);
        successfulLeads += result.processed;
        errorLeads += result.errors;
        totalLeads += result.processed + result.errors;
        totalNewLeads += result.newLeads || 0;
        totalDuplicates += result.duplicates || 0;
        totalFiltered += result.filtered || 0;
        processedFiles++;
        
        // Progress update
        const progressPercent = Math.round((processedFiles / totalFiles) * 100);
        console.log(`📊 Progress: ${processedFiles}/${totalFiles} files (${progressPercent}%)\n`);
        
      } catch (fileError) {
        console.error(`❌ Failed to process ${fileName}:`, fileError.message);
        processedFiles++;
      }
    }
    
    // Final summary
    console.log('🎉 IMPORT COMPLETE!\n');
    console.log('📊 FINAL SUMMARY:');
    console.log(`   📁 Files processed: ${processedFiles}/${totalFiles}`);
    console.log(`   ✅ Total leads processed: ${successfulLeads}`);
    console.log(`   🆕 New leads added: ${totalNewLeads}`);
    console.log(`   🔄 Duplicates merged: ${totalDuplicates}`);
    console.log(`   🔄 Filtered leads: ${totalFiltered}`);
    console.log(`   ❌ Errors: ${errorLeads}`);
    console.log(`   📈 Total records processed: ${totalLeads}`);
    
    // Show database statistics
    await showDatabaseStats();
    
  } catch (error) {
    console.error('❌ Import failed:', error);
  }
}

// Function to show database statistics
async function showDatabaseStats() {
  try {
    console.log('\n📊 DATABASE STATISTICS:');
    
    // Total leads count
    const totalCount = await getOne('SELECT COUNT(*) as count FROM leads');
    console.log(`   📈 Total leads in database: ${totalCount.count}`);
    
    // Top business types
    const topTypes = await getAll(
      'SELECT type_of_business, COUNT(*) as count FROM leads WHERE type_of_business IS NOT NULL AND type_of_business != "" GROUP BY type_of_business ORDER BY count DESC LIMIT 10'
    );
    if (topTypes.length > 0) {
          console.log('\n   🏢 Top Business Types:');
      topTypes.forEach(row => {
            console.log(`      ${row.type_of_business}: ${row.count} leads`);
          });
        }
    
    // Top states
    const topStates = await getAll(
      'SELECT state, COUNT(*) as count FROM leads WHERE state IS NOT NULL AND state != "" GROUP BY state ORDER BY count DESC LIMIT 10'
    );
    if (topStates.length > 0) {
          console.log('\n   🌍 Top States:');
      topStates.forEach(row => {
            console.log(`      ${row.state}: ${row.count} leads`);
          });
        }
    
    // Source file breakdown
    const sourceFiles = await getAll(
      'SELECT source_file, COUNT(*) as count FROM leads WHERE source_file IS NOT NULL GROUP BY source_file ORDER BY count DESC'
    );
    if (sourceFiles.length > 0) {
      console.log('\n   📁 Source Files:');
      sourceFiles.forEach(row => {
        console.log(`      ${row.source_file}: ${row.count} leads`);
      });
    }
    
    // Leads with contact info
    const phoneCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE phone_number IS NOT NULL AND phone_number != ""');
    console.log(`\n   📞 Leads with phone numbers: ${phoneCount.count}`);
    
    const emailCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE email IS NOT NULL AND email != ""');
    console.log(`   📧 Leads with email addresses: ${emailCount.count}`);
    
    const websiteCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE website IS NOT NULL AND website != ""');
    console.log(`   🌐 Leads with websites: ${websiteCount.count}`);
    
    // Leads by import vs scraping
    const importedCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE job_id IS NULL');
    const scrapedCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE job_id IS NOT NULL');
    console.log(`\n   📄 Imported from files: ${importedCount.count}`);
    console.log(`   🔍 Scraped leads: ${scrapedCount.count}`);
    
    // Combined sources statistics
    const combinedSourcesCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE source_file LIKE "%|%"');
    const notInListCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE source_file = "Not in any list"');
    const notInFileCount = await getOne('SELECT COUNT(*) as count FROM leads WHERE source_file = "Not in any file"');
    console.log(`\n   🔗 Leads with combined sources: ${combinedSourcesCount.count}`);
    console.log(`   📋 "Not in any list" (no real files): ${notInListCount.count}`);
    console.log(`   📁 "Not in any file" (no real files): ${notInFileCount.count}`);
    
  } catch (error) {
    console.error('❌ Error showing database statistics:', error);
  }
}

// Run the import if this file is executed directly
if (require.main === module) {
  importAllLeadFiles()
    .then(() => {
      console.log('\n✅ Import process completed successfully');
      console.log('🎯 Lead data is now ready for the backend system!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Import process failed:', error);
      process.exit(1);
    });
}

module.exports = { importAllLeadFiles, processExcelFile }; 