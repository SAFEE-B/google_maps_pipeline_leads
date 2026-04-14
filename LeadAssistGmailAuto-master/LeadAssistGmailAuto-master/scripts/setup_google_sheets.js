#!/usr/bin/env node

/**
 * Google Sheets Integration Setup Script
 * 
 * This script helps initialize the Google Sheets integration by:
 * 1. Testing Google API connectivity
 * 2. Creating initial sheet configurations
 * 3. Verifying database tables
 * 4. Starting monitoring
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

const { setupDatabase } = require('../src/database/setup');
const googleSheetsService = require('../src/services/googleSheetsService');
const googleSheetsWorkflowService = require('../src/services/googleSheetsWorkflowService');
const { runQuery, getAll } = require('../src/database/setup');

console.log('🚀 Google Sheets Integration Setup');
console.log('=====================================\n');

async function main() {
  try {
    // Step 1: Verify database setup
    console.log('📊 Setting up database...');
    await setupDatabase();
    console.log('✅ Database setup complete\n');

    // Step 2: Test Google Sheets API
    console.log('🔗 Testing Google Sheets API...');
    
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY && !process.env.GOOGLE_CLIENT_ID) {
      console.log('❌ No Google credentials found in environment variables');
      console.log('Please set either GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
      console.log('See GOOGLE_SHEETS_SETUP.md for detailed instructions\n');
      process.exit(1);
    }

    try {
      await googleSheetsService.initialize();
      console.log('✅ Google Sheets API connection successful\n');
    } catch (error) {
      console.log('❌ Google Sheets API connection failed:', error.message);
      console.log('Please check your credentials and try again\n');
      process.exit(1);
    }

    // Step 3: Check if we have a test spreadsheet ID
    const testSpreadsheetId = process.env.TEST_SPREADSHEET_ID;
    
    if (testSpreadsheetId) {
      console.log('📋 Testing Google Sheet access...');
      try {
        const sheetInfo = await googleSheetsService.getSheetInfo(testSpreadsheetId);
        console.log(`✅ Successfully accessed sheet: "${sheetInfo.title}"`);
        console.log(`   Sheets: ${sheetInfo.sheets.map(s => s.title).join(', ')}\n`);

        // Test reading data
        console.log('📖 Testing sheet data reading...');
        const jobRequests = await googleSheetsService.readJobRequests(testSpreadsheetId);
        console.log(`✅ Found ${jobRequests.length} potential job requests\n`);

        // Step 4: Create sheet configuration
        console.log('⚙️ Creating sheet configuration...');
        
        const notificationEmail = process.env.NOTIFICATION_EMAIL || 'admin@company.com';
        
        try {
          await googleSheetsWorkflowService.addSheetConfig(
            'Test Configuration',
            testSpreadsheetId,
            'Sheet1!A:E',
            notificationEmail
          );
          console.log('✅ Sheet configuration created\n');
        } catch (configError) {
          if (configError.message.includes('UNIQUE constraint failed')) {
            console.log('⚠️ Sheet configuration already exists\n');
          } else {
            throw configError;
          }
        }

      } catch (sheetError) {
        console.log('❌ Cannot access test spreadsheet:', sheetError.message);
        console.log('Please ensure:');
        console.log('  1. TEST_SPREADSHEET_ID is correct');
        console.log('  2. Sheet is shared with your service account');
        console.log('  3. Service account has proper permissions\n');
      }
    } else {
      console.log('⚠️ No TEST_SPREADSHEET_ID provided, skipping sheet access test');
      console.log('To test sheet access, set TEST_SPREADSHEET_ID in your config.env\n');
    }

    // Step 5: Show current configurations
    console.log('📋 Current sheet configurations:');
    const configs = await googleSheetsWorkflowService.getSheetConfigs();
    
    if (configs.length === 0) {
      console.log('   No configurations found');
      console.log('   Use the API to add configurations:');
      console.log('   POST /api/sheets/configs\n');
    } else {
      configs.forEach(config => {
        console.log(`   • ${config.config_name}`);
        console.log(`     Spreadsheet: ${config.spreadsheet_id}`);
        console.log(`     Email: ${config.notification_email}`);
        console.log(`     Active: ${config.is_active ? 'Yes' : 'No'}`);
        console.log('');
      });
    }

    // Step 6: Check monitoring settings
    console.log('🔄 Monitoring configuration:');
    console.log(`   Enabled: ${process.env.ENABLE_SHEETS_MONITORING || 'false'}`);
    console.log(`   Interval: ${process.env.SHEETS_CHECK_INTERVAL_MINUTES || '5'} minutes`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}\n`);

    // Step 7: Optional - start monitoring
    if (process.env.ENABLE_SHEETS_MONITORING === 'true' && configs.length > 0) {
      console.log('🚀 Starting Google Sheets monitoring...');
      
      const intervalMinutes = parseInt(process.env.SHEETS_CHECK_INTERVAL_MINUTES) || 5;
      await googleSheetsWorkflowService.startMonitoring(intervalMinutes);
      
      console.log(`✅ Monitoring started with ${intervalMinutes} minute interval`);
      console.log('   The system will now check for new job requests automatically\n');
      
      // Keep the process running for demonstration
      console.log('🔍 Performing initial check for new requests...');
      await googleSheetsWorkflowService.checkForNewRequests();
      console.log('✅ Initial check complete\n');
      
      console.log('📝 Setup complete! The system is now monitoring your Google Sheets.');
      console.log('   Add new rows to your sheet to test the workflow.');
      console.log('   Press Ctrl+C to stop monitoring.\n');
      
      // Keep process alive to demonstrate monitoring
      setInterval(() => {
        console.log(`🔄 Monitoring active... (${new Date().toLocaleTimeString()})`);
      }, 60000); // Log every minute to show it's active
      
    } else {
      console.log('📝 Setup complete!');
      
      if (process.env.ENABLE_SHEETS_MONITORING !== 'true') {
        console.log('   To enable monitoring, set ENABLE_SHEETS_MONITORING=true in config.env');
      }
      
      if (configs.length === 0) {
        console.log('   Add sheet configurations via the API to start monitoring');
      }
      
      console.log('\n🚀 Start your server with: npm start');
      console.log('📚 See GOOGLE_SHEETS_SETUP.md for detailed documentation\n');
      
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down monitoring...');
  googleSheetsWorkflowService.stopMonitoring();
  console.log('👋 Goodbye!');
  process.exit(0);
});

// Run the setup
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 