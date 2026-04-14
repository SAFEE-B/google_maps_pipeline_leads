const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

let db;

const DB_PATH = process.env.DATABASE_URL || './data/leads.db';

async function setupDatabase() {
  try {
    // If database is already initialized, return early
    if (db) {
      logger.debug('Database already initialized');
      return;
    }

    // Ensure data directory exists
    const dbDir = path.dirname(DB_PATH);
    await fs.mkdir(dbDir, { recursive: true });

    // Create database connection and wait for it to be ready
    await new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Error opening database:', err);
          reject(err);
        } else {
          logger.info('Connected to SQLite database');
          resolve();
      }
      });
    });

    // Enable foreign keys
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create tables
      await createTables();
  
  // Run migrations to add missing columns
  await runMigrations();
  
  logger.info('Database setup completed');

  // Call the function to create indexes
  if (db) {
    createOptimizationIndexes();
  }
  } catch (error) {
    logger.error('Database setup failed:', error);
    throw error;
  }
}

async function createTables() {
  const tables = [
    // Users table - stores user authentication data
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Leads table - stores all business leads
    `CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_of_business TEXT NOT NULL,
      type_of_business TEXT,
      sub_category TEXT,
      website TEXT,
      num_reviews INTEGER DEFAULT 0,
      rating REAL,
      latest_review TEXT,
      business_address TEXT,
      phone_number TEXT,
      email TEXT,
      notes TEXT,
      source_file TEXT,
      zip_code TEXT,
      state TEXT,
      city TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(phone_number) ON CONFLICT REPLACE
    )`,

    // Scraping jobs table - tracks scraper queue jobs
    `CREATE TABLE IF NOT EXISTS scraping_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE NOT NULL,
      client_name TEXT,
      business_types TEXT, -- JSON array
      zip_codes TEXT, -- JSON array
      states TEXT, -- JSON array
      status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
      queries_generated INTEGER DEFAULT 0,
      leads_found INTEGER DEFAULT 0,
      error_message TEXT,
      result TEXT, -- JSON result with file paths and stats
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    )`,

    // Processing jobs table - tracks formatting and findleads jobs
    `CREATE TABLE IF NOT EXISTS processing_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'format', 'findleads', 'generate_queries'
      input_file TEXT,
      output_file TEXT,
      status TEXT DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      results TEXT, -- JSON results
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      completed_at DATETIME
    )`,

    // Client requests table - tracks requests from Google Sheets or frontend
    `CREATE TABLE IF NOT EXISTS client_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      request_data TEXT, -- JSON data from Google Sheets
      business_types TEXT,
      locations TEXT,
      status TEXT DEFAULT 'received', -- received, processing, completed
      output_file TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME
    )`,

    // Search queries table - stores generated search queries
    `CREATE TABLE IF NOT EXISTS search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_type TEXT NOT NULL,
      location TEXT NOT NULL,
      query_text TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, completed, failed
      leads_found INTEGER DEFAULT 0,
      scraping_job_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      scraped_at DATETIME,
      FOREIGN KEY (scraping_job_id) REFERENCES scraping_jobs(job_id)
    )`,

    // System metadata table
    `CREATE TABLE IF NOT EXISTS system_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Deliveries table - tracks generated files for download
    `CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT UNIQUE NOT NULL,
      filename TEXT NOT NULL,
      format TEXT NOT NULL, -- 'csv', 'excel', 'xlsx'
      lead_count INTEGER DEFAULT 0,
      filters TEXT, -- JSON filters used to generate the file
      request_type TEXT, -- 'export', 'search', etc.
      file_size INTEGER DEFAULT 0,
      file_path TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      downloaded_at DATETIME
    )`,

    // Google Sheets job requests table - tracks jobs from Google Sheets
    `CREATE TABLE IF NOT EXISTS sheets_job_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      name_of_list TEXT NOT NULL,
      business_types TEXT NOT NULL, -- JSON array
      locations TEXT NOT NULL, -- JSON array
      email TEXT, -- Confirmation email address
      confirmation_token TEXT,
      confirmation_status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled'
      sheet_status TEXT DEFAULT 'new', -- 'new', 'email_sent', 'confirmed', 'processing', 'completed', 'failed'
      scraping_job_id TEXT, -- Links to scraping_jobs table
      final_file_path TEXT, -- Path to completed file
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      email_sent_at DATETIME,
      confirmed_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (scraping_job_id) REFERENCES scraping_jobs(job_id)
    )`,

    // Email confirmations table - tracks email confirmations
    `CREATE TABLE IF NOT EXISTS email_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      confirmation_token TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      request_type TEXT NOT NULL, -- 'sheets_job', 'other'
      request_id TEXT NOT NULL, -- Links to sheets_job_requests or other tables
      status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'expired'
      expires_at DATETIME NOT NULL,
      confirmed_at DATETIME,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    // Google Sheets configuration table - stores sheet configurations
    `CREATE TABLE IF NOT EXISTS sheets_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_name TEXT UNIQUE NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      sheet_range TEXT DEFAULT 'Sheet1!A:E',
      notification_email TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      last_check_row INTEGER DEFAULT 1, -- Last processed row number
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const tableSQL of tables) {
    await new Promise((resolve, reject) => {
      db.run(tableSQL, (err) => {
        if (err) {
          logger.error('Error creating table:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Create indexes for better performance
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_leads_business_type ON leads(type_of_business)',
    'CREATE INDEX IF NOT EXISTS idx_leads_zip_code ON leads(zip_code)',
    'CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state)',
    'CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_search_queries_status ON search_queries(status)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_file_id ON deliveries(file_id)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON deliveries(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_sheets_requests_status ON sheets_job_requests(sheet_status)',
    'CREATE INDEX IF NOT EXISTS idx_sheets_requests_token ON sheets_job_requests(confirmation_token)',
    'CREATE INDEX IF NOT EXISTS idx_sheets_requests_spreadsheet ON sheets_job_requests(spreadsheet_id)',
    'CREATE INDEX IF NOT EXISTS idx_email_confirmations_token ON email_confirmations(confirmation_token)',
    'CREATE INDEX IF NOT EXISTS idx_email_confirmations_status ON email_confirmations(status)',
    'CREATE INDEX IF NOT EXISTS idx_sheets_config_active ON sheets_config(is_active)'
  ];

  for (const indexSQL of indexes) {
    await new Promise((resolve, reject) => {
      db.run(indexSQL, (err) => {
        if (err) {
          logger.error('Error creating index:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Add missing columns for existing databases
  await addMissingColumns();
}

async function addMissingColumns() {
  // Add job_id column to leads table if it doesn't exist
  try {
    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE leads ADD COLUMN job_id TEXT', (err) => {
        if (err) {
          // Column might already exist, check if it's a "duplicate column" error
          if (err.message.includes('duplicate column name')) {
            logger.debug('job_id column already exists in leads table');
            resolve();
          } else {
            logger.error('Error adding job_id column to leads table:', err);
            reject(err);
          }
        } else {
          logger.info('Added job_id column to leads table');
          resolve();
        }
      });
    });

    // Add index for the new column
    await new Promise((resolve, reject) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_leads_job_id ON leads(job_id)', (err) => {
        if (err) {
          logger.error('Error creating index for job_id:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

  } catch (error) {
    logger.error('Error in addMissingColumns:', error);
    // Don't throw error, continue with database setup
  }
}

// Run database migrations for schema updates
async function runMigrations() {
  try {
    // Add result column to scraping_jobs if it doesn't exist
    try {
      await runQuery(`ALTER TABLE scraping_jobs ADD COLUMN result TEXT`);
      logger.info('✅ Added result column to scraping_jobs table');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        logger.debug('Result column already exists in scraping_jobs table');
      } else {
        logger.warn('Could not add result column to scraping_jobs:', error.message);
      }
    }
    
  } catch (error) {
    logger.error('Migration failed:', error);
  }
}

// Create indexes for optimization queries
const createOptimizationIndexes = () => {
  // Index for business type and location optimization queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_biztype_location 
    ON leads (type_of_business, city, zip_code)
  `);
  
  // Index for sub_category optimization queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_subcategory_location 
    ON leads (sub_category, city, zip_code)
  `);
  
  // Index for created_at for ordering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_created_at 
    ON leads (created_at DESC)
  `);
  
  console.log('📊 Database indexes for optimization created');
};

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return db;
}

// Helper function to run queries with promises
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call setupDatabase() first.'));
      return;
    }
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper function to get single row
function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call setupDatabase() first.'));
      return;
    }
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to get all rows
function getAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call setupDatabase() first.'));
      return;
    }
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  setupDatabase,
  getDatabase,
  runQuery,
  getOne,
  getAll
}; 