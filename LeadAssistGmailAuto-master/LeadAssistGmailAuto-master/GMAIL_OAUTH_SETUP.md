# Gmail OAuth2 Setup Guide

This guide will help you set up Gmail OAuth2 authentication to fix the "Precondition check failed" error.

## Why OAuth2 is Required

Service accounts cannot send emails from personal Gmail accounts. You need OAuth2 authentication for personal Gmail accounts like `safee.bangash@gmail.com`.

## Setup Steps

### 1. Create OAuth2 Credentials in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your project: `luminous-smithy-455011-u5`
3. Click **"Create Credentials"** > **"OAuth 2.0 Client IDs"**
4. Choose **"Desktop Application"** as the application type
5. Give it a name like "Lead Generation Gmail"
6. Click **"Create"**
7. Note down the **Client ID** and **Client Secret**

### 2. Run the OAuth2 Setup Script

```bash
cd Backend
npm run setup-gmail
```

The script will:
- Ask for your Client ID and Client Secret
- Generate an authorization URL
- Help you get the authorization code
- Generate a refresh token
- Update your `config.env` file automatically

### 3. Follow the Authorization Process

1. The script will show you a URL - open it in your browser
2. Sign in with your Gmail account (`safee.bangash@gmail.com`)
3. Grant permission for the application to send emails
4. Copy the authorization code and paste it back into the script

### 4. Test the Setup

```bash
npm run test-gmail
```

This will verify that your Gmail authentication is working correctly.

## What Gets Added to Your Config

The script will add these variables to your `config.env`:

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REFRESH_TOKEN=your_refresh_token_here
GOOGLE_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob
```

## Restart Your Server

After setup is complete:

```bash
npm start
```

Your Gmail integration should now work without the "Precondition check failed" error!

## Troubleshooting

### "No refresh token received"
This happens if you've already authorized the application. To fix:
1. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
2. Remove the Lead Generation app
3. Run the setup script again

### "invalid_grant" error
The refresh token may have expired. Run the setup script again to get a new one.

## Security Notes

- Keep your OAuth2 credentials secure
- Never commit them to version control
- The refresh token allows sending emails on your behalf 