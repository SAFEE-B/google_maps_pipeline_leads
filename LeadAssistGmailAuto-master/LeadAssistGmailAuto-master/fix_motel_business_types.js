#!/usr/bin/env node

const { setupDatabase, getAll, runQuery } = require('./src/database/setup');
const logger = require('./src/utils/logger');

async function fixMotelBusinessTypes() {
  try {
    console.log('🔧 STARTING MOTEL BUSINESS TYPE FIX');
    console.log('============================================\n');

    // Initialize database
    await setupDatabase();
    
    // 1. Check current data
    console.log('📊 CHECKING CURRENT DATA...');
    
    // Find all leads with "AND Motels" business type
    const andMotelsLeads = await getAll(
      'SELECT * FROM leads WHERE type_of_business = ? OR type_of_business = ?', 
      ['AND Motels', 'and motels']
    );
    
    // Find all leads with "Motels" business type (for comparison)
    const motelsLeads = await getAll(
      'SELECT * FROM leads WHERE type_of_business = ? OR type_of_business = ?', 
      ['Motels', 'motels']
    );
    
    console.log(`   🔍 Found ${andMotelsLeads.length} leads with "AND Motels" business type`);
    console.log(`   🔍 Found ${motelsLeads.length} leads with "Motels" business type`);
    
    if (andMotelsLeads.length === 0) {
      console.log('✅ No leads found with "AND Motels" business type. Nothing to fix!');
      return;
    }
    
    // 2. Show sample data
    console.log('\n📋 SAMPLE LEADS TO BE UPDATED:');
    const sampleLeads = andMotelsLeads.slice(0, 5);
    sampleLeads.forEach((lead, index) => {
      console.log(`   ${index + 1}. ${lead.name_of_business}`);
      console.log(`      Type: "${lead.type_of_business}" → "Motels"`);
      console.log(`      SubCategory: ${lead.sub_category || 'N/A'}`);
      console.log(`      Location: ${lead.city || 'N/A'}, ${lead.state || 'N/A'}`);
      console.log('');
    });
    
    if (andMotelsLeads.length > 5) {
      console.log(`   ... and ${andMotelsLeads.length - 5} more leads\n`);
    }
    
    // 3. Show breakdown by subcategory
    console.log('📈 BREAKDOWN BY SUBCATEGORY:');
    const subcategoryBreakdown = {};
    andMotelsLeads.forEach(lead => {
      const subcat = lead.sub_category || 'No Category';
      subcategoryBreakdown[subcat] = (subcategoryBreakdown[subcat] || 0) + 1;
    });
    
    Object.entries(subcategoryBreakdown)
      .sort(([,a], [,b]) => b - a)
      .forEach(([subcat, count]) => {
        console.log(`   ${subcat}: ${count} leads`);
      });
    
    // 4. Perform the update
    console.log('\n🔄 UPDATING DATABASE...');
    
    const updateResult = await runQuery(
      'UPDATE leads SET type_of_business = ? WHERE type_of_business = ? OR type_of_business = ?',
      ['Motels', 'AND Motels', 'and motels']
    );
    
    console.log(`✅ Successfully updated ${updateResult.changes} leads`);
    
    // 5. Verify the update
    console.log('\n🔍 VERIFYING UPDATE...');
    
    const remainingAndMotels = await getAll(
      'SELECT COUNT(*) as count FROM leads WHERE type_of_business = ? OR type_of_business = ?', 
      ['AND Motels', 'and motels']
    );
    
    const newMotelsCount = await getAll(
      'SELECT COUNT(*) as count FROM leads WHERE type_of_business = ? OR type_of_business = ?', 
      ['Motels', 'motels']
    );
    
    console.log(`   📊 Remaining "AND Motels" leads: ${remainingAndMotels[0].count}`);
    console.log(`   📊 Total "Motels" leads now: ${newMotelsCount[0].count}`);
    
    if (remainingAndMotels[0].count === 0) {
      console.log('✅ All "AND Motels" leads successfully converted to "Motels"!');
    } else {
      console.log('⚠️  Some "AND Motels" leads may still remain. Check manually.');
    }
    
    // 6. Show final summary
    console.log('\n🎉 MOTEL BUSINESS TYPE FIX COMPLETED!');
    console.log('============================================');
    console.log(`📊 SUMMARY:`);
    console.log(`   • Updated: ${updateResult.changes} leads`);
    console.log(`   • From: "AND Motels" or "and motels"`);
    console.log(`   • To: "Motels"`);
    console.log(`   • Total Motels now: ${newMotelsCount[0].count}`);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\n💡 Make sure you run this from the project root directory');
    console.error('📝 Command: node fix_motel_business_types.js');
    process.exit(1);
  }
}

// Run the fix
if (require.main === module) {
  fixMotelBusinessTypes();
}

module.exports = { fixMotelBusinessTypes }; 