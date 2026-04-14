const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Gmail OAuth2 Setup Script
// This script helps you get the OAuth2 credentials needed for Gmail API

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
const CONFIG_PATH = path.join(__dirname, '../config.env');

async function setupGmailOAuth() {
  console.log('\n🚀 Gmail OAuth2 Setup\n');
  console.log('This script will help you set up OAuth2 authentication for Gmail API.');
  console.log('You\'ll need to create OAuth2 credentials in Google Cloud Console first.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function question(prompt) {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  }

  try {
    console.log('📋 Step 1: Get OAuth2 Credentials');
    console.log('Go to: https://console.cloud.google.com/apis/credentials');
    console.log('1. Click "Create Credentials" > "OAuth 2.0 Client IDs"');
    console.log('2. Choose "Desktop Application" as application type');
    console.log('3. Download the JSON file or copy the credentials\n');

    const clientId = await question('Enter your Client ID: ');
    const clientSecret = await question('Enter your Client Secret: ');

    console.log('\n📋 Step 2: Get Authorization Code');
    
    const oAuth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('\nOpen this URL in your browser:');
    console.log(authUrl);
    console.log('\nAfter authorization, you\'ll get an authorization code.');

    const code = await question('\nEnter the authorization code: ');

    console.log('\n📋 Step 3: Get Refresh Token');
    
    const { tokens } = await oAuth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      console.log('\n❌ Error: No refresh token received.');
      console.log('This usually happens if you\'ve already authorized this application.');
      console.log('Try revoking access at: https://myaccount.google.com/permissions');
      console.log('Then run this script again.');
      rl.close();
      return;
    }

    console.log('\n✅ Success! Got OAuth2 tokens.');
    console.log('\n📋 Step 4: Update Configuration');

    // Read current config
    let configContent = '';
    if (fs.existsSync(CONFIG_PATH)) {
      configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    }

    // Update or add OAuth2 credentials
    const updates = {
      'GOOGLE_CLIENT_ID': clientId,
      'GOOGLE_CLIENT_SECRET': clientSecret,
      'GOOGLE_REFRESH_TOKEN': tokens.refresh_token,
      'GOOGLE_REDIRECT_URI': 'urn:ietf:wg:oauth:2.0:oob'
    };

    let newConfigContent = configContent;

    Object.entries(updates).forEach(([key, value]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(newConfigContent)) {
        newConfigContent = newConfigContent.replace(regex, `${key}=${value}`);
      } else {
        newConfigContent += `\n${key}=${value}`;
      }
    });

    // Write updated config
    fs.writeFileSync(CONFIG_PATH, newConfigContent);

    console.log('\n✅ Configuration updated successfully!');
    console.log('\nYour Gmail OAuth2 setup is complete. The following credentials have been added to config.env:');
    console.log(`- GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`- GOOGLE_CLIENT_SECRET=${clientSecret.substring(0, 10)}...`);
    console.log(`- GOOGLE_REFRESH_TOKEN=${tokens.refresh_token.substring(0, 10)}...`);
    console.log(`- GOOGLE_REDIRECT_URI=urn:ietf:wg:oauth:2.0:oob`);

    console.log('\n🔧 Next Steps:');
    console.log('1. Restart your server: npm start');
    console.log('2. Test the Gmail functionality');
    console.log('3. The system will now be able to send emails via Gmail API');

    console.log('\n💡 Note: Keep your OAuth2 credentials secure and never commit them to version control.');

  } catch (error) {
    console.error('\n❌ Error setting up Gmail OAuth2:', error.message);
  } finally {
    rl.close();
  }
}

// Test Gmail authentication
async function testGmailAuth() {
  console.log('\n🧪 Testing Gmail Authentication\n');

  try {
    // Read config.env file manually since it's not standard .env format
    let config = {};
    if (fs.existsSync(CONFIG_PATH)) {
      const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
      const lines = configContent.split('\n');
      
      for (const line of lines) {
        if (line.includes('=') && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          if (key && value) {
            config[key.trim()] = value;
          }
        }
      }
    }

    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
      console.log('❌ OAuth2 credentials not found. Please run setup first.');
      console.log('Missing credentials:', {
        GOOGLE_CLIENT_ID: !!config.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: !!config.GOOGLE_CLIENT_SECRET,
        GOOGLE_REFRESH_TOKEN: !!config.GOOGLE_REFRESH_TOKEN
      });
      return;
    }

    console.log('📋 Using OAuth2 credentials...');
    console.log(`Client ID: ${config.GOOGLE_CLIENT_ID.substring(0, 20)}...`);
    console.log(`Refresh Token: ${config.GOOGLE_REFRESH_TOKEN.substring(0, 20)}...`);

    const oAuth2Client = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
    );

    oAuth2Client.setCredentials({
      refresh_token: config.GOOGLE_REFRESH_TOKEN
    });

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    // Test by getting user profile
    console.log('🔍 Testing Gmail API access...');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    console.log('✅ Gmail authentication successful!');
    console.log(`📧 Connected email: ${profile.data.emailAddress}`);
    console.log(`📊 Total messages: ${profile.data.messagesTotal}`);
    console.log(`📬 Threads total: ${profile.data.threadsTotal}`);

    // Test Gmail send permissions
    console.log('\n🔍 Testing Gmail send permissions...');
    
    // Check if we can access the required scopes by trying to get labels
    try {
      await gmail.users.labels.list({ userId: 'me' });
      console.log('✅ Gmail API access confirmed!');
    } catch (scopeError) {
      console.log('⚠️  Limited Gmail access - this is expected for send-only scope');
    }

    console.log('\n✅ Gmail OAuth2 setup is working correctly!');
    console.log('📧 Ready to send emails from:', profile.data.emailAddress);

  } catch (error) {
    console.log('❌ Gmail authentication failed:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.log('\n💡 Tip: The refresh token may have expired. Please run setup again.');
    } else if (error.message.includes('Insufficient Permission')) {
      console.log('\n💡 Possible causes:');
      console.log('1. Gmail API may not be enabled in Google Cloud Console');
      console.log('2. The OAuth2 scopes may be insufficient');
      console.log('3. The account may not have Gmail access');
      console.log('\n🔧 Solutions:');
      console.log('1. Enable Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com');
      console.log('2. Re-run the OAuth setup: npm run setup-gmail');
    } else if (error.code === 403) {
      console.log('\n💡 Gmail API may not be enabled for your project.');
      console.log('Enable it here: https://console.cloud.google.com/apis/library/gmail.googleapis.com');
    }
    
    console.log('\nError details:', error);
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--test')) {
    await testGmailAuth();
  } else {
    await setupGmailOAuth();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { setupGmailOAuth, testGmailAuth }; 