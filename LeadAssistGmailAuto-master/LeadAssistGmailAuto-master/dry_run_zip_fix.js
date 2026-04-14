const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { extractZipCodeFromAddress, isValidZipCode } = require('./fix_zip_codes');

// Database setup
const dbPath = path.join(__dirname, 'data', 'leads.db');

// Statistics tracking
let totalLeads = 0;
let leadsWithAddresses = 0;
let zipCodesFound = 0;
let zipCodesWouldUpdate = 0;
let zipCodesAlreadyCorrect = 0;
let zipCodesNotFound = 0;
let errors = 0;

console.log('🔍 DRY RUN - ZIP CODE CORRECTION ANALYSIS\n');
console.log('⚠️  This is a dry run - NO CHANGES will be made to the database!\n');

// Function to analyze zip codes without updating
async function analyzeZipCodes() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('❌ Error opening database:', err.message);
        reject(err);
        return;
      }
      console.log('✅ Connected to the SQLite database (READ-ONLY mode).');
    });

    // Get all leads with addresses
    const query = `
      SELECT id, name_of_business, business_address, zip_code, city, state
      FROM leads 
      WHERE business_address IS NOT NULL AND business_address != ''
      ORDER BY id
      LIMIT 50
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('❌ Error querying database:', err.message);
        reject(err);
        return;
      }

      totalLeads = rows.length;
      leadsWithAddresses = rows.length;
      
      console.log(`📊 Analyzing ${totalLeads} leads with addresses (sample of first 50)...\n`);

      const updates = [];
      const examples = [];

      for (const row of rows) {
        try {
          const extractedZip = extractZipCodeFromAddress(row.business_address);
          
          if (extractedZip && isValidZipCode(extractedZip)) {
            zipCodesFound++;
            
            const currentZip = row.zip_code;
            
            // Check if the current zip code is different from the extracted one
            if (currentZip !== extractedZip) {
              zipCodesWouldUpdate++;
              
              const updateInfo = {
                id: row.id,
                name: row.name_of_business,
                address: row.business_address,
                currentZip: currentZip,
                newZip: extractedZip,
                city: row.city,
                state: row.state
              };
              
              updates.push(updateInfo);
              
              // Store first 10 examples
              if (examples.length < 10) {
                examples.push(updateInfo);
              }
            } else {
              zipCodesAlreadyCorrect++;
            }
          } else {
            zipCodesNotFound++;
          }
        } catch (processError) {
          console.error(`❌ Error processing lead ${row.id}:`, processError.message);
          errors++;
        }
      }

      // Show examples
      if (examples.length > 0) {
        console.log('📋 EXAMPLES OF UPDATES THAT WOULD BE MADE:\n');
        examples.forEach((example, index) => {
          console.log(`${index + 1}. ${example.name}`);
          console.log(`   ID: ${example.id}`);
          console.log(`   Address: ${example.address}`);
          console.log(`   Current Zip: "${example.currentZip}" → Would change to: "${example.newZip}"`);
          console.log(`   City: ${example.city}, State: ${example.state}`);
          console.log('');
        });
      }

      // Show problematic cases
      console.log('⚠️  EXAMPLES WHERE ZIP CODES COULD NOT BE EXTRACTED:\n');
      let problemExamples = 0;
      
      for (const row of rows) {
        const extractedZip = extractZipCodeFromAddress(row.business_address);
        if (!extractedZip || !isValidZipCode(extractedZip)) {
          if (problemExamples < 5) {
                       console.log(`${problemExamples + 1}. ${row.name_of_business}`);
           console.log(`   Address: ${row.business_address}`);
           console.log(`   Current Zip: "${row.zip_code}"`);
           console.log(`   Last 30 chars: "${row.business_address.slice(-30)}"`);
           console.log('');
            problemExamples++;
          }
        }
      }

      // Print analysis results
      console.log('📈 DRY RUN ANALYSIS RESULTS:');
      console.log('═══════════════════════════════════════');
      console.log(`📊 Total leads analyzed: ${totalLeads} (sample)`);
      console.log(`🏠 Leads with addresses: ${leadsWithAddresses}`);
      console.log(`🔍 Zip codes found in addresses: ${zipCodesFound}`);
      console.log(`🔄 Zip codes that WOULD BE UPDATED: ${zipCodesWouldUpdate}`);
      console.log(`☑️  Zip codes already correct: ${zipCodesAlreadyCorrect}`);
      console.log(`❌ Zip codes not found: ${zipCodesNotFound}`);
      console.log(`⚠️  Errors encountered: ${errors}`);
      console.log('═══════════════════════════════════════\n');

      if (zipCodesWouldUpdate > 0) {
        console.log(`🎯 ESTIMATED IMPACT: ${zipCodesWouldUpdate} zip codes would be updated in this sample.`);
        console.log(`📊 This represents ${((zipCodesWouldUpdate / totalLeads) * 100).toFixed(1)}% of the sample.`);
      } else {
        console.log('ℹ️  No zip codes would need updating in this sample.');
      }

      console.log('\n🚀 To run the actual update script: node fix_zip_codes.js');
      console.log('💾 IMPORTANT: Make sure to backup your database before running the update!');

      // Close database connection
      db.close((closeErr) => {
        if (closeErr) {
          console.error('❌ Error closing database:', closeErr.message);
          reject(closeErr);
        } else {
          console.log('\n✅ Database connection closed.');
          resolve({ updates, totalAnalyzed: totalLeads });
        }
      });
    });
  });
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting dry run analysis...\n');
    
    const results = await analyzeZipCodes();
    
    console.log('\n🎯 Dry run analysis completed successfully!');
    
    if (results.updates.length > 0) {
      console.log(`\n📝 Summary: ${results.updates.length} updates would be made to ${results.totalAnalyzed} analyzed leads.`);
      console.log('\n🔧 Next steps:');
      console.log('   1. Review the examples above');
      console.log('   2. Run: node test_zip_extraction.js (to test extraction logic)');
      console.log('   3. Backup your database');
      console.log('   4. Run: node fix_zip_codes.js (to make actual changes)');
    } else {
      console.log('\n✅ No updates needed for the analyzed sample.');
    }
    
  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run the dry run
if (require.main === module) {
  main();
}

module.exports = { analyzeZipCodes }; 