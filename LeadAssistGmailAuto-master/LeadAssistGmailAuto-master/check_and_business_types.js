#!/usr/bin/env node

const { setupDatabase, getAll } = require('./src/database/setup');

async function checkAndBusinessTypes() {
  try {
    console.log('🔍 CHECKING FOR OTHER "AND" BUSINESS TYPE ISSUES');
    console.log('================================================\n');

    // Initialize database
    await setupDatabase();
    
    // Find all unique business types that contain "AND"
    const andBusinessTypes = await getAll(`
      SELECT 
        type_of_business,
        COUNT(*) as count
      FROM leads 
      WHERE type_of_business LIKE '%AND%' 
         OR type_of_business LIKE '%and%'
         OR type_of_business LIKE '%And%'
      GROUP BY type_of_business 
      ORDER BY count DESC
    `);
    
    console.log(`Found ${andBusinessTypes.length} business types containing "AND":\n`);
    
    if (andBusinessTypes.length === 0) {
      console.log('✅ No business types with "AND" found!');
      return;
    }
    
    // Show results
    andBusinessTypes.forEach((type, index) => {
      console.log(`${index + 1}. "${type.type_of_business}" (${type.count} leads)`);
    });
    
    // Check for potential issues
    console.log('\n🔍 POTENTIAL ISSUES TO FIX:');
    const potentialIssues = [];
    
    andBusinessTypes.forEach(type => {
      const businessType = type.type_of_business;
      
      // Check for patterns like "AND Something" or "and Something"
      if (businessType.match(/^(AND|and|And)\s+/)) {
        potentialIssues.push({
          current: businessType,
          suggested: businessType.replace(/^(AND|and|And)\s+/, ''),
          count: type.count
        });
      }
    });
    
    if (potentialIssues.length > 0) {
      console.log('⚠️  Found potential issues:');
      potentialIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. "${issue.current}" → "${issue.suggested}" (${issue.count} leads)`);
      });
      
      console.log('\n💡 Consider creating fix scripts for these issues.');
    } else {
      console.log('✅ No obvious "AND" parsing issues found.');
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

// Run the check
if (require.main === module) {
  checkAndBusinessTypes();
}

module.exports = { checkAndBusinessTypes }; 