const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Lead Generation Backend...\n');

// Required directories
const directories = [
  'data',
  'logs', 
  'uploads',
  'src/routes',
  'src/queues/processors',
  'src/database',
  'src/utils'
];

// Create directories
console.log('📁 Creating required directories...');
directories.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`   ✅ Created: ${dir}`);
  } else {
    console.log(`   ✨ Exists: ${dir}`);
  }
});

// Check if .env exists, if not copy from config.env
console.log('\n🔧 Checking environment configuration...');
const envPath = path.join(process.cwd(), '.env');
const configEnvPath = path.join(process.cwd(), 'config.env');

if (!fs.existsSync(envPath) && fs.existsSync(configEnvPath)) {
  fs.copyFileSync(configEnvPath, envPath);
  console.log('   ✅ Created .env from config.env');
  console.log('   ⚠️  Please review and update .env with your configuration');
} else if (fs.existsSync(envPath)) {
  console.log('   ✨ .env file exists');
} else {
  console.log('   ❌ No environment configuration found');
  console.log('   ℹ️  Please create .env file with required configuration');
}

// Create .gitignore if it doesn't exist
console.log('\n📝 Creating .gitignore...');
const gitignorePath = path.join(process.cwd(), '.gitignore');
const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs/
*.log

# Database
data/
*.db
*.sqlite

# Uploads
uploads/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary files
tmp/
temp/

# Python
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
.pytest_cache/

# Chrome
chromedriver
chromedriver.exe
`;

if (!fs.existsSync(gitignorePath)) {
  fs.writeFileSync(gitignorePath, gitignoreContent);
  console.log('   ✅ Created .gitignore');
} else {
  console.log('   ✨ .gitignore exists');
}

// Check if Redis is available
console.log('\n🔍 Checking dependencies...');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
if (majorVersion >= 16) {
  console.log(`   ✅ Node.js ${nodeVersion} (>= 16.0.0)`);
} else {
  console.log(`   ❌ Node.js ${nodeVersion} (requires >= 16.0.0)`);
}

// Check if Redis is running (simple check)
console.log('   ⏳ Checking Redis...');
const { spawn } = require('child_process');

const redisCheck = spawn('redis-cli', ['ping'], { stdio: 'pipe' });
redisCheck.on('close', (code) => {
  if (code === 0) {
    console.log('   ✅ Redis is running');
  } else {
    console.log('   ❌ Redis not running or not installed');
    console.log('   ℹ️  Install Redis: npm run setup:redis');
  }
});

redisCheck.on('error', () => {
  console.log('   ❌ Redis not found');
  console.log('   ℹ️  Please install Redis server');
});

// Create sample directories structure info
console.log('\n📋 Directory structure created:');
console.log(`
├── src/
│   ├── server.js              # Main server file
│   ├── database/              # Database setup and helpers
│   ├── queues/                # Queue setup and processors
│   ├── routes/                # API routes
│   └── utils/                 # Utilities and helpers
├── data/                      # SQLite database files
├── logs/                      # Application logs
├── uploads/                   # User uploaded files
├── Files/                     # Processed lead files
├── Outputs/                   # Generated output files
├── config.env                 # Environment configuration
└── package.json              # Dependencies and scripts
`);

console.log('\n🎉 Setup complete!\n');
console.log('📚 Next steps:');
console.log('   1. Install dependencies: npm install');
console.log('   2. Start Redis server: redis-server');
console.log('   3. Update .env configuration');
console.log('   4. Start development: npm run dev');
console.log('   5. Visit: http://localhost:3000/health\n');

console.log('💡 Quick start commands:');
console.log('   npm install');
console.log('   npm run dev');
console.log('');

module.exports = { directories }; 