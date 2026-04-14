const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database setup
const dbPath = path.join(__dirname, 'data', 'leads.db');

// Statistics tracking
let totalLeads = 0;
let leadsWithAddresses = 0;
let zipCodesFound = 0;
let zipCodesUpdated = 0;
let zipCodesAlreadyCorrect = 0;
let zipCodesNotFound = 0;
let errors = 0;

console.log('🔧 Starting Zip Code Correction Script...\n');

// Function to extract zip code from the last 25 characters of an address
function extractZipCodeFromAddress(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  // Get the last 25 characters of the address
  const last25Chars = address.slice(-25);
  
  // Multiple regex patterns to catch different zip code formats
  const zipPatterns = [
    // Standard 5-digit zip code at the end
    /,\s*(\d{5})(?:\s*,?\s*United States)?$/i,
    
    // 5+4 zip code format
    /,\s*(\d{5}-\d{4})(?:\s*,?\s*United States)?$/i,
    
    // Zip code before "United States"
    /,\s*(\d{5}(?:-\d{4})?)\s*,?\s*United States/i,
    
    // Zip code after state abbreviation (OH, CA, etc.)
    /,\s*[A-Z]{2}\s*,?\s*(\d{5}(?:-\d{4})?)/i,
    
    // More flexible pattern - any 5 digits in the last part
    /(\d{5}(?:-\d{4})?)(?=\s*,?\s*(?:United States|$))/i,
    
    // Last resort - any 5 consecutive digits in last 25 chars
    /(\d{5})(?!.*\d{5})/
  ];

  for (const pattern of zipPatterns) {
    const match = last25Chars.match(pattern);
    if (match) {
      let zipCode = match[1];
      
      // Clean up the zip code (remove any non-digit characters except hyphens)
      zipCode = zipCode.replace(/[^\d-]/g, '');
      
      // Validate it's a proper zip code format
      if (/^\d{5}(-\d{4})?$/.test(zipCode)) {
        // Return only the 5-digit part
        return zipCode.split('-')[0];
      }
    }
  }

  return null;
}

// Function to validate if the extracted zip code is likely correct
function isValidZipCode(zipCode) {
  if (!zipCode) return false;
  
  // Must be exactly 5 digits
  if (!/^\d{5}$/.test(zipCode)) return false;
  
  // Avoid obvious non-zip codes
  if (zipCode === '00000' || zipCode === '11111' || zipCode === '99999') return false;
  
  // Street numbers are usually 1-5 digits, zip codes are always 5
  // If it starts with multiple zeros, it's likely a valid east coast zip
  return true;
}

// Function to process leads and update zip codes
async function fixZipCodes() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('✅ Connected to the SQLite database.');
    });

    // Get all leads with addresses
    const query = `
      SELECT id, name_of_business, business_address, zip_code, city, state
      FROM leads 
      WHERE business_address IS NOT NULL AND business_address != ''
      ORDER BY id
    `;

    db.all(query, [], async (err, rows) => {
      if (err) {
        console.error('❌ Error querying database:', err.message);
        reject(err);
        return;
      }

      totalLeads = rows.length;
      leadsWithAddresses = rows.length;
      
      console.log(`📊 Found ${totalLeads} leads with addresses to process.\n`);
      console.log('🔍 Processing leads...\n');

      const updatePromises = [];
      let processedCount = 0;

      for (const row of rows) {
        processedCount++;
        
        // Show progress every 1000 leads
        if (processedCount % 1000 === 0) {
          console.log(`   Progress: ${processedCount}/${totalLeads} leads processed...`);
        }

        try {
          const extractedZip = extractZipCodeFromAddress(row.business_address);
          
          if (extractedZip && isValidZipCode(extractedZip)) {
            zipCodesFound++;
            
            const currentZip = row.zip_code;
            
            // Check if the current zip code is different from the extracted one
            if (currentZip !== extractedZip) {
              // Log some examples for verification
              if (zipCodesUpdated < 10) {
                console.log(`🔄 UPDATING: ${row.name_of_business}`);
                console.log(`   Address: ${row.business_address}`);
                console.log(`   Current Zip: "${currentZip}" → New Zip: "${extractedZip}"`);
                console.log(`   City: ${row.city}, State: ${row.state}\n`);
              }
              
              // Create update promise
              const updatePromise = new Promise((resolveUpdate, rejectUpdate) => {
                db.run(
                  'UPDATE leads SET zip_code = ? WHERE id = ?',
                  [extractedZip, row.id],
                  function(updateErr) {
                    if (updateErr) {
                      console.error(`❌ Error updating lead ${row.id}:`, updateErr.message);
                      errors++;
                      rejectUpdate(updateErr);
                    } else {
                      zipCodesUpdated++;
                      resolveUpdate();
                    }
                  }
                );
              });
              
              updatePromises.push(updatePromise);
            } else {
              zipCodesAlreadyCorrect++;
            }
          } else {
            zipCodesNotFound++;
            
                         // Log some examples of addresses where zip codes couldn't be found
             if (zipCodesNotFound <= 5) {
               console.log(`⚠️  NO ZIP FOUND: ${row.name_of_business}`);
               console.log(`   Address: ${row.business_address}`);
               console.log(`   Current Zip: "${row.zip_code}"`);
               console.log(`   Last 25 chars: "${row.business_address.slice(-25)}"\n`);
             }
          }
        } catch (processError) {
          console.error(`❌ Error processing lead ${row.id}:`, processError.message);
          errors++;
        }
      }

      // Wait for all updates to complete
      try {
        await Promise.all(updatePromises);
        console.log('\n✅ All updates completed successfully!\n');
        
        // Print final statistics
        console.log('📈 FINAL STATISTICS:');
        console.log('═══════════════════════════════════════');
        console.log(`📊 Total leads processed: ${totalLeads}`);
        console.log(`🏠 Leads with addresses: ${leadsWithAddresses}`);
        console.log(`🔍 Zip codes found in addresses: ${zipCodesFound}`);
        console.log(`✅ Zip codes updated: ${zipCodesUpdated}`);
        console.log(`☑️  Zip codes already correct: ${zipCodesAlreadyCorrect}`);
        console.log(`❌ Zip codes not found: ${zipCodesNotFound}`);
        console.log(`⚠️  Errors encountered: ${errors}`);
        console.log('═══════════════════════════════════════\n');
        
        if (zipCodesUpdated > 0) {
          console.log(`🎉 Successfully updated ${zipCodesUpdated} zip codes!`);
        } else {
          console.log('ℹ️  No zip codes needed updating.');
        }
        
      } catch (updateError) {
        console.error('❌ Error during batch updates:', updateError);
        errors++;
      }

      // Close database connection
      db.close((closeErr) => {
        if (closeErr) {
          console.error('❌ Error closing database:', closeErr.message);
          reject(closeErr);
        } else {
          console.log('\n✅ Database connection closed.');
          resolve();
        }
      });
    });
  });
}

// Function to test the zip code extraction on sample addresses
function testZipExtraction() {
  console.log('🧪 TESTING ZIP CODE EXTRACTION:\n');
  
  const testAddresses = [
    "11101 hawks street, OH,78978,United States",
    "123 Main St, Phoenix, AZ 85001, United States", 
    "456 Oak Ave, Los Angeles, CA, 90210",
    "789 Pine Rd, New York, NY 10001-1234, United States",
    "321 Elm St, Miami, FL 33101",
    "555 Broadway, Seattle, WA 98101, United States",
    "999 First Ave, Chicago, IL, 60601, United States",
    "12345 Sample Drive, Las Vegas, NV, 89101, United States"
  ];

  testAddresses.forEach((address, index) => {
    const extractedZip = extractZipCodeFromAddress(address);
    console.log(`Test ${index + 1}:`);
    console.log(`   Address: ${address}`);
    console.log(`   Last 25 chars: "${address.slice(-25)}"`);
    console.log(`   Extracted ZIP: ${extractedZip || 'NOT FOUND'}`);
    console.log(`   Valid: ${isValidZipCode(extractedZip) ? '✅' : '❌'}\n`);
  });
}

// Main execution
async function main() {
  try {
    // Run tests first to verify extraction logic
    testZipExtraction();
    
    console.log('🚀 Starting zip code correction process...\n');
    
    // Ask for confirmation before making changes
    console.log('⚠️  This script will modify the database.');
    console.log('📝 It will update zip_code fields based on addresses.');
    console.log('💾 Make sure you have a database backup before proceeding.\n');
    
    // In a real environment, you might want to add a confirmation prompt
    // For automation purposes, proceeding directly
    
    await fixZipCodes();
    
    console.log('\n🎯 Zip code correction completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  extractZipCodeFromAddress,
  isValidZipCode,
  fixZipCodes
}; 