#!/usr/bin/env node

/**
 * Reset Row Position Script
 * 
 * This script allows you to reset the Google Sheets monitoring 
 * to start processing from a specific row number.
 * 
 * Usage:
 *   node scripts/reset_row_position.js <row_number>
 *   node scripts/reset_row_position.js 172
 *   node scripts/reset_row_position.js 200
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

const { setupDatabase, runQuery, getAll } = require('../src/database/setup');

async function resetRowPosition() {
  try {
    // Get row number from command line arguments
    const rowNumber = process.argv[2];
    
    if (!rowNumber) {
      console.log('❌ Error: Please provide a row number');
      console.log('');
      console.log('Usage:');
      console.log('  node scripts/reset_row_position.js <row_number>');
      console.log('');
      console.log('Examples:');
      console.log('  node scripts/reset_row_position.js 172');
      console.log('  node scripts/reset_row_position.js 200');
      console.log('  node scripts/reset_row_position.js 1');
      process.exit(1);
    }

    const targetRow = parseInt(rowNumber);
    
    if (isNaN(targetRow) || targetRow < 1) {
      console.log('❌ Error: Row number must be a positive integer');
      process.exit(1);
    }

    console.log(`🎯 Resetting monitoring to start from row ${targetRow}...\n`);

    // Setup database
    await setupDatabase();
    console.log('✅ Database connected');

    // Show current configuration before change
    console.log('📊 Current configuration:');
    const beforeConfigs = await getAll('SELECT * FROM sheets_config', []);
    
    if (beforeConfigs.length === 0) {
      console.log('❌ No Google Sheets configurations found!');
      console.log('   Run setup_google_sheets.js first to create a configuration.');
      process.exit(1);
    }

    beforeConfigs.forEach(config => {
      console.log(`   • ${config.config_name}`);
      console.log(`     Current last_check_row: ${config.last_check_row}`);
      console.log(`     Sheet range: ${config.sheet_range}`);
      console.log(`     Active: ${config.is_active ? 'Yes' : 'No'}`);
    });

    // Update all active configurations to the new row
    console.log(`\n🔄 Updating last_check_row to ${targetRow}...`);
    
    const result = await runQuery(
      'UPDATE sheets_config SET last_check_row = ?, updated_at = CURRENT_TIMESTAMP WHERE is_active = 1',
      [targetRow]
    );

    if (result.changes === 0) {
      console.log('⚠️  No active configurations found to update');
      process.exit(1);
    }

    console.log(`✅ Updated ${result.changes} configuration(s)`);

    // Show updated configuration
    console.log('\n📋 Updated configuration:');
    const afterConfigs = await getAll('SELECT * FROM sheets_config WHERE is_active = 1', []);
    
    afterConfigs.forEach(config => {
      console.log(`   • ${config.config_name}`);
      console.log(`     New last_check_row: ${config.last_check_row}`);
      console.log(`     Sheet range: ${config.sheet_range}`);
      console.log(`     Updated: ${config.updated_at}`);
    });

    console.log('\n✅ Row position reset successfully!');
    console.log(`🚀 Monitoring will now start from row ${targetRow}`);
    console.log(`📝 Next row to be processed: ${targetRow + 1}`);
    console.log('');
    console.log('Next steps:');
    console.log('1. Restart server if it\'s running: npm start');
    console.log(`2. Add new rows starting from ${targetRow + 1}+ to trigger processing`);

  } catch (error) {
    console.error('❌ Error resetting row position:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Operation cancelled');
  process.exit(0);
});

// Run the script
resetRowPosition(); 