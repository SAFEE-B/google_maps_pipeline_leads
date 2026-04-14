# Google Sheets & Gmail Integration Setup

This guide will help you set up the Google Sheets and Gmail integration for automated lead generation job processing.

## Overview

The system monitors Google Sheets for new job requests and automatically:
1. Reads job requests from your Google Sheet
2. Sends confirmation emails via Gmail
3. Starts scraping jobs upon confirmation
4. Sends final results via email with attachments

## Prerequisites

You'll need:
1. Google Cloud Project with APIs enabled
2. Service Account or OAuth2 credentials
3. Google Sheet with proper format
4. Gmail account with API access

## Step 1: Google Cloud Setup

### 1.1 Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one

### 1.2 Enable Required APIs
Enable these APIs in your project:
- Google Sheets API
- Gmail API

```bash
# Using gcloud CLI (optional)
gcloud services enable sheets.googleapis.com
gcloud services enable gmail.googleapis.com
```

### 1.3 Create Service Account (Recommended)
1. Go to IAM & Admin → Service Accounts
2. Create a new service account
3. Download the JSON key file
4. Keep this file secure - it contains your credentials

### 1.4 Alternative: OAuth2 Setup
If you prefer OAuth2:
1. Go to APIs & Credentials → Credentials
2. Create OAuth 2.0 Client ID
3. Download client configuration
4. Set up redirect URI for token refresh

## Step 2: Google Sheet Setup

### 2.1 Create Your Job Request Sheet
Create a Google Sheet with these columns:

| A | B | C | D | E |
|---|---|---|---|---|
| Name of List | Cities/Zipcodes | Types of Businesses | Status | Email |

**Column Descriptions:**
- **Name of List**: Descriptive name for the job (e.g., "Restaurants Seattle Q1")
- **Cities/Zipcodes**: Comma-separated list of locations (e.g., "Seattle, 98101, Tacoma")
- **Types of Businesses**: Comma-separated business types (e.g., "Restaurant, Cafe, Bar")
- **Status**: System updates this (pending, email_sent, processing, completed, failed)
- **Email**: Optional override for confirmation email

**Example:**
```
Name of List              | Cities/Zipcodes      | Types of Businesses    | Status  | Email
Restaurants Seattle Q1    | Seattle, Bellevue    | Restaurant, Cafe       | pending | user@company.com
Auto Shops King County    | 98001, 98002, 98003  | Auto Repair Shop       | pending |
```

### 2.2 Share Your Sheet
Share your Google Sheet with your service account email:
1. Click "Share" in your Google Sheet
2. Add your service account email (found in the JSON key file)
3. Give "Editor" permissions

## Step 3: Environment Configuration

Add these environment variables to your `config.env` file:

```env
# Google Sheets & Gmail Integration
ENABLE_SHEETS_MONITORING=true
SHEETS_CHECK_INTERVAL_MINUTES=5

# Google Authentication - Option 1: Service Account (Recommended)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project",...}

# Google Authentication - Option 2: OAuth2
# GOOGLE_CLIENT_ID=your-client-id
# GOOGLE_CLIENT_SECRET=your-client-secret
# GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
# GOOGLE_REFRESH_TOKEN=your-refresh-token

# Frontend URL for confirmation links
FRONTEND_URL=http://localhost:3000
```

## Step 4: Database Setup

The integration will automatically create required database tables when you start the server. These include:
- `sheets_job_requests` - Tracks job requests from Google Sheets
- `email_confirmations` - Manages email confirmations
- `sheets_config` - Stores sheet configurations

## Step 5: Configure Sheet Monitoring

### 5.1 Add Sheet Configuration via API

Use the API to add your sheet configuration:

```bash
curl -X POST http://localhost:3000/api/sheets/configs \
  -H "Content-Type: application/json" \
  -d '{
    "configName": "Main Job Requests",
    "spreadsheetId": "1RCHnSNYUH677ex8GcCAq448QBe7a_Oz12WBC-DRsH_w",
    "sheetRange": "AllOrders!A:E",
    "notificationEmail": "safee.bangash@gmail.com"
  }'
```

### 5.2 Get Your Sheet ID
Your Google Sheet ID is in the URL:
```
https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit
```

## Step 6: Test the Integration

### 6.1 Test Google Sheets Connection
```bash
curl -X POST http://localhost:3000/api/sheets/test-connection \
  -H "Content-Type: application/json" \
  -d '{"spreadsheetId": "your-sheet-id"}'
```

### 6.2 Manual Sheet Check
```bash
curl -X POST http://localhost:3000/api/sheets/check-sheets
```

### 6.3 Start Monitoring
```bash
curl -X POST http://localhost:3000/api/sheets/monitoring/start \
  -H "Content-Type: application/json" \
  -d '{"intervalMinutes": 5}'
```

## Step 7: Workflow Testing

1. **Add a test row** to your Google Sheet:
   ```
   Test Job | Seattle | Restaurant | pending | your-email@company.com
   ```

2. **Check monitoring status**:
   ```bash
   curl http://localhost:3000/api/sheets/monitoring/status
   ```

3. **Verify email was sent** - Check your email for confirmation

4. **Confirm the job** by clicking the confirmation link

5. **Monitor job progress** via the API or database

## API Endpoints

### Sheet Configuration
- `GET /api/sheets/configs` - List all configurations
- `POST /api/sheets/configs` - Add new configuration
- `PUT /api/sheets/configs/:id` - Update configuration

### Monitoring
- `GET /api/sheets/monitoring/status` - Get monitoring status
- `POST /api/sheets/monitoring/start` - Start monitoring
- `POST /api/sheets/monitoring/stop` - Stop monitoring

### Job Requests
- `GET /api/sheets/requests` - List job requests
- `GET /api/sheets/confirmation/:token` - Get confirmation details
- `GET /api/sheets/confirm/:token` - Confirm job (public endpoint)

### Utilities
- `POST /api/sheets/check-sheets` - Manual sheet check
- `POST /api/sheets/test-connection` - Test sheet connection
- `POST /api/sheets/resend-confirmation/:requestId` - Resend confirmation

## Troubleshooting

### Common Issues

1. **"Cannot access Google Sheet"**
   - Check service account permissions
   - Verify sheet is shared with service account email
   - Confirm sheet ID is correct

2. **"Gmail authentication failed"**
   - Verify Gmail API is enabled
   - Check service account has necessary scopes
   - Ensure authentication credentials are correct

3. **"No new requests found"**
   - Check sheet format matches expected columns
   - Verify `last_check_row` in database
   - Ensure status column isn't already "processed"

4. **Email delivery issues**
   - Check Gmail API quotas
   - Verify sender email permissions
   - Check spam/junk folders

### Logs

Monitor these log files for debugging:
- `logs/combined.log` - General application logs
- `logs/queue.log` - Queue processing logs
- `logs/error.log` - Error logs

### Database Queries

Check job request status:
```sql
SELECT * FROM sheets_job_requests ORDER BY created_at DESC LIMIT 10;
```

Check email confirmations:
```sql
SELECT * FROM email_confirmations WHERE status = 'pending';
```

## Security Considerations

1. **Keep credentials secure** - Never commit the service account JSON
2. **Use environment variables** for all sensitive data
3. **Limit sheet access** to necessary users only
4. **Monitor API usage** to prevent quota exhaustion
5. **Set up proper logging** for audit trails

## Production Deployment

For production:
1. Use a dedicated Google Cloud project
2. Set up proper IAM roles and permissions
3. Configure email delivery monitoring
4. Set up alerting for failed jobs
5. Implement backup and recovery procedures
6. Consider using Google Cloud Secret Manager for credentials

## Support

For issues or questions:
1. Check the logs first
2. Verify configuration settings
3. Test individual components
4. Review database state
5. Contact system administrator if needed 