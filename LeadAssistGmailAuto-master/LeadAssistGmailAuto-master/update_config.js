const { setupDatabase, getAll, runQuery } = require('./src/database/setup');

async function updateConfig() {
  try {
    // Initialize database
    await setupDatabase();
    
    const oldSheetId = '1RCHnSNYUH677ex8GcCAq448QBe7a_Oz12WBC-DRsH_w';
    const newSheetId = '1qKKADkliFy2xMI1ukkJfKC2YZx7QkrN8a85iJ1lfc94';
    
    console.log('🔄 Updating sheet configuration...');
    console.log(`Old Sheet ID: ${oldSheetId}`);
    console.log(`New Sheet ID: ${newSheetId}`);
    
    // Update the spreadsheet_id and updated_at timestamp
    const result = await runQuery(`
      UPDATE sheets_config 
      SET spreadsheet_id = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `, [newSheetId]);
    
    console.log(`✅ Updated ${result.changes} record(s)`);
    
    // Verify the update
    const updatedConfig = await getAll('SELECT * FROM sheets_config WHERE id = 1');
    console.log('\n📊 Updated Configuration:');
    console.log(`ID: ${updatedConfig[0].id}`);
    console.log(`Name: ${updatedConfig[0].config_name}`);
    console.log(`Spreadsheet ID: ${updatedConfig[0].spreadsheet_id}`);
    console.log(`Sheet Range: ${updatedConfig[0].sheet_range}`);
    console.log(`Notification Email: ${updatedConfig[0].notification_email}`);
    console.log(`Is Active: ${updatedConfig[0].is_active ? 'Yes' : 'No'}`);
    console.log(`Updated: ${updatedConfig[0].updated_at}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating config:', error);
    process.exit(1);
  }
}

updateConfig(); 