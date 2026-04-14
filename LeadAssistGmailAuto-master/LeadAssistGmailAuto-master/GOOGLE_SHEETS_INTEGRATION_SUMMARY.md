# Google Sheets Integration - Implementation Summary

## What Has Been Implemented

I've successfully implemented a complete Google Sheets and Gmail integration for your lead generation backend system. Here's what the system now does:

### 🔄 Automated Workflow
1. **Monitors Google Sheets** - Periodically checks for new job requests
2. **Sends Confirmation Emails** - Automatically emails you when new requests are found
3. **Waits for Confirmation** - Jobs only start after you click the confirmation link
4. **Processes Jobs** - Runs your existing scraping pipeline 
5. **Sends Results** - Emails the final lead file as an attachment

### 📊 Google Sheet Format
Your Google Sheet should have these columns:
- **Column A**: Name of List (e.g., "Restaurants Seattle Q1")
- **Column B**: Cities/Zipcodes (e.g., "Seattle, 98101, Tacoma")
- **Column C**: Types of Businesses (e.g., "Restaurant, Cafe, Bar")
- **Column D**: Status (automatically updated by the system)
- **Column E**: Email (optional override for notifications)

## Files Created/Modified

### New Services
- `src/services/googleSheetsService.js` - Google Sheets API integration
- `src/services/gmailService.js` - Gmail API integration for sending emails
- `src/services/googleSheetsWorkflowService.js` - Main workflow orchestration

### New Routes
- `src/routes/googleSheets.js` - API endpoints for managing the integration

### Database Updates
- Updated `src/database/setup.js` with new tables:
  - `sheets_job_requests` - Tracks job requests from Google Sheets
  - `email_confirmations` - Manages email confirmations
  - `sheets_config` - Stores sheet configurations

### Integration Updates
- Modified `src/server.js` to include new routes and auto-start monitoring
- Updated `src/queues/processors/scraperProcessor.js` to trigger completion emails

### Documentation & Setup
- `GOOGLE_SHEETS_SETUP.md` - Complete setup guide
- `scripts/setup_google_sheets.js` - Automated setup script
- `config.env.example` - Updated with new configuration variables

## API Endpoints Added

### Public Endpoints (No Auth Required)
- `GET /api/sheets/confirm/:token` - Confirm a job request
- `GET /api/sheets/confirmation/:token` - Get confirmation details

### Admin Endpoints
- `GET /api/sheets/configs` - List sheet configurations
- `POST /api/sheets/configs` - Add new sheet configuration
- `PUT /api/sheets/configs/:id` - Update sheet configuration
- `GET /api/sheets/requests` - List job requests
- `POST /api/sheets/check-sheets` - Manual sheet check
- `POST /api/sheets/monitoring/start` - Start monitoring
- `POST /api/sheets/monitoring/stop` - Stop monitoring
- `GET /api/sheets/monitoring/status` - Get monitoring status
- `POST /api/sheets/test-connection` - Test sheet connection

## Configuration Required

### Environment Variables (add to config.env)
```env
# Enable the integration
ENABLE_SHEETS_MONITORING=true
SHEETS_CHECK_INTERVAL_MINUTES=5

# Google Service Account credentials (recommended)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account"...}

# OR OAuth2 credentials (alternative)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Frontend URL for confirmation links
FRONTEND_URL=http://localhost:3000
```

## How to Set Up

### 1. Google Cloud Setup
1. Create a Google Cloud project
2. Enable Google Sheets API and Gmail API
3. Create a service account
4. Download the JSON key file
5. Set `GOOGLE_SERVICE_ACCOUNT_KEY` in your config.env

### 2. Google Sheet Setup
1. Create a Google Sheet with the required columns
2. Share it with your service account email
3. Note the spreadsheet ID from the URL

### 3. Configure the System
1. Run the setup script: `node scripts/setup_google_sheets.js`
2. Or manually add sheet configuration via API
3. Start your server: `npm start`

### 4. Test the Workflow
1. Add a test row to your Google Sheet
2. The system will send you a confirmation email
3. Click the confirmation link
4. Monitor the job progress
5. Receive the final results via email

## Workflow Example

1. **Add to Sheet**: 
   ```
   Restaurant Leads | Seattle, Bellevue | Restaurant, Cafe | pending | admin@company.com
   ```

2. **System Detects**: Monitoring finds the new row (every 5 minutes)

3. **Email Sent**: You receive confirmation email with job details

4. **You Confirm**: Click the link in the email to start the job

5. **Job Processes**: System runs your existing scraping pipeline

6. **Results Delivered**: Final Excel/CSV file sent to your email

## Monitoring & Management

### Check Status
```bash
# Check if monitoring is running
curl http://localhost:3000/api/sheets/monitoring/status

# View recent job requests
curl http://localhost:3000/api/sheets/requests

# View sheet configurations
curl http://localhost:3000/api/sheets/configs
```

### Manual Operations
```bash
# Check sheets manually
curl -X POST http://localhost:3000/api/sheets/check-sheets

# Test connection to a sheet
curl -X POST http://localhost:3000/api/sheets/test-connection \
  -H "Content-Type: application/json" \
  -d '{"spreadsheetId": "your-sheet-id"}'
```

## Database Tables

The integration uses these new tables:

### sheets_job_requests
Tracks each job request from Google Sheets with status progression.

### email_confirmations  
Manages confirmation tokens and tracks email confirmations.

### sheets_config
Stores Google Sheet configurations for monitoring.

## Error Handling

The system includes comprehensive error handling:
- Failed API calls don't crash the system
- Invalid sheet data is logged and skipped
- Email failures are logged but don't stop job processing
- Database connection issues are handled gracefully

## Security Features

- Confirmation tokens expire after 24 hours
- Email confirmations track IP addresses and user agents
- All API credentials are environment-variable based
- Sheet access requires explicit sharing with service account

## Next Steps

1. **Set up your Google Cloud project** and download credentials
2. **Create your Google Sheet** with the required format
3. **Configure environment variables** in config.env
4. **Run the setup script** to test connectivity
5. **Add your first test job** to the sheet

The system is now ready to automate your lead generation workflow with Google Sheets integration!

## Support

For issues:
1. Check the logs in `logs/combined.log`
2. Verify Google API credentials and permissions
3. Ensure your sheet is shared with the service account
4. Review the setup documentation in `GOOGLE_SHEETS_SETUP.md` 