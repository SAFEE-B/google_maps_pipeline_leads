const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
}

function updateConfigFile(backendUrl) {
  const configPath = path.join(__dirname, 'config.env');
  
  if (!fs.existsSync(configPath)) {
    console.log('❌ config.env file not found!');
    return false;
  }

  try {
    let configContent = fs.readFileSync(configPath, 'utf8');
    
    // Update BACKEND_URL
    const backendUrlRegex = /BACKEND_URL=.*/;
    if (backendUrlRegex.test(configContent)) {
      configContent = configContent.replace(backendUrlRegex, `BACKEND_URL=${backendUrl}`);
    } else {
      // If not found, add it after the port line
      configContent = configContent.replace(
        /PORT=3000/,
        `PORT=3000\nBACKEND_URL=${backendUrl}`
      );
    }
    
    fs.writeFileSync(configPath, configContent, 'utf8');
    console.log('✅ config.env updated successfully!');
    return true;
  } catch (error) {
    console.log('❌ Error updating config.env:', error.message);
    return false;
  }
}

function printInstructions() {
  const localIP = getLocalIPAddress();
  
  console.log('\n🌐 EXTERNAL ACCESS SETUP FOR GMAIL CONFIRMATIONS\n');
  console.log('The confirmation emails need to work from any device (mobile, etc.).');
  console.log('Choose one of these options:\n');
  
  console.log('📱 OPTION 1: Use Local IP Address (Same Network Only)');
  console.log('='.repeat(60));
  console.log(`Your local IP address: ${localIP}`);
  console.log(`This will work for devices on the same WiFi network.`);
  console.log(`Update BACKEND_URL to: http://${localIP}:3000\n`);
  
  console.log('🌍 OPTION 2: Use ngrok (Public Internet Access)');
  console.log('='.repeat(60));
  console.log('1. Install ngrok: https://ngrok.com/download');
  console.log('2. Run: ngrok http 3000');
  console.log('3. Copy the https URL (e.g., https://abc123.ngrok.io)');
  console.log('4. Update BACKEND_URL to that URL\n');
  
  console.log('☁️  OPTION 3: Deploy to Cloud (Production)');
  console.log('='.repeat(60));
  console.log('Deploy your backend to Heroku, Vercel, Railway, etc.');
  console.log('Update BACKEND_URL to your deployment URL\n');
  
  console.log('🔧 Quick Setup Commands:');
  console.log('='.repeat(60));
  console.log(`node setup_external_access.js local    # Use local IP (${localIP})`);
  console.log('node setup_external_access.js custom <your-url>  # Use custom URL');
  console.log('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'local') {
    const localIP = getLocalIPAddress();
    const backendUrl = `http://${localIP}:3000`;
    
    console.log(`\n🔧 Setting up local IP access...`);
    console.log(`Backend URL: ${backendUrl}`);
    
    if (updateConfigFile(backendUrl)) {
      console.log('\n✅ Setup complete!');
      console.log(`Devices on your local network can now access: ${backendUrl}`);
      console.log('\n⚠️  Important: Restart your server for changes to take effect');
      console.log('Run: npm start\n');
    }
    
  } else if (command === 'custom' && args[1]) {
    const customUrl = args[1];
    
    console.log(`\n🔧 Setting up custom URL...`);
    console.log(`Backend URL: ${customUrl}`);
    
    if (updateConfigFile(customUrl)) {
      console.log('\n✅ Setup complete!');
      console.log(`Confirmation links will now use: ${customUrl}`);
      console.log('\n⚠️  Important: Restart your server for changes to take effect');
      console.log('Run: npm start\n');
    }
    
  } else {
    printInstructions();
  }
}

main().catch(console.error); 