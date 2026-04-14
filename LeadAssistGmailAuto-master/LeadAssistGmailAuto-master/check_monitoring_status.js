const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'config.env') });

async function checkStatus() {
  console.log('📊 Google Sheets Monitoring Status Check');
  console.log('========================================\n');

  try {
    // Check server endpoint
    const response = await fetch('http://localhost:3000/api/status', { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      console.log('✅ Server is running on port 3000');
    } else {
      console.log('❌ Server not responding properly');
    }
  } catch (error) {
    console.log('❌ Server not reachable:', error.message);
  }

  console.log('\n📋 Configuration:');
  console.log(`   • Monitoring enabled: ${process.env.ENABLE_SHEETS_MONITORING}`);
  console.log(`   • Check interval: ${process.env.SHEETS_CHECK_INTERVAL_MINUTES} minutes (${parseFloat(process.env.SHEETS_CHECK_INTERVAL_MINUTES) * 60} seconds)`);
  console.log(`   • Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`   • Notification email: ${process.env.NOTIFICATION_EMAIL}`);
  
  console.log('\n🎯 Current Setup:');
  console.log('   • System monitors Google Sheet every 30 seconds');
  console.log('   • Only processes NEW rows (after row 165)');
  console.log('   • Existing 163 rows are protected and ignored');
  
  console.log('\n🧪 To Test:');
  console.log('1. Add a new row to your Google Sheet (row 166+):');
  console.log('   Column B: Test job name (e.g., "test_job_001")');
  console.log('   Column C: Cities (e.g., "New York, Boston")');
  console.log('   Column D: State (e.g., "New York")');
  console.log('   Column E: Business types (e.g., "restaurants, cafes")');
  console.log('2. Wait up to 30 seconds');
  console.log('3. Check your email for confirmation');
  console.log('4. Click the confirmation link to start processing');
  
  console.log('\n📊 Check logs for monitoring activity:');
  console.log('   Look for "Checking Google Sheets for new requests..." messages');
}

checkStatus().catch(console.error); 