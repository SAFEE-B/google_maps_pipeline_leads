# 🚀 LeadAssistAI Backend

## 📋 Overview

LeadAssistAI Backend is a comprehensive lead generation and management system that combines Node.js/Express backend with Python-powered web scraping capabilities. The system uses Redis-based queue management for scalable background processing and SQLite for data persistence.

## 🏗️ Architecture

### Core Components

- **Node.js Express Server** - RESTful API and request handling
- **Python Scraping Engine** - Google Maps scraping with Selenium
- **Redis Queue System** - Background job processing with Bull Queue
- **SQLite Database** - Data persistence and lead management
- **AI Integration** - Google Gemini AI for intelligent query processing

### Tech Stack

```
Backend Framework:    Node.js + Express
Queue Management:     Redis + Bull Queue
Database:            SQLite3
Scraping Engine:     Python + Selenium + BeautifulSoup
AI Integration:      Google Gemini AI
Authentication:      JWT
File Processing:     Pandas + XLSX generation
```

## 🚀 Quick Start

### Prerequisites

```bash
# Required Software
- Node.js (v16+)
- Python (v3.8+)
- Redis Server
- Chrome Browser + ChromeDriver
```

### Installation

1. **Clone and Setup**
```bash
cd Backend
npm install
pip install selenium pandas beautifulsoup4
```

2. **Environment Configuration**
```bash
cp config.env.example config.env
# Edit config.env with your settings
```

3. **Database Setup**
```bash
# Database will be auto-created on first run
mkdir data
```

4. **Start Services**
```bash
# Start Redis (required for queues)
redis-server

# Start the backend server
npm start

# For development with auto-restart
npm run dev
```

## ⚙️ Configuration

### Environment Variables (`config.env`)

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=./data/leads.db

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# Python Scripts
PYTHON_INTERPRETER=python
SCRAPER_SCRIPT_PATH=./maintemp.py
FORMATTER_SCRIPT_PATH=./formatter.py
FINDLEADS_SCRIPT_PATH=./FindLeadsAndAddSource.py

# File Paths
FILES_DIRECTORY=./Files
OUTPUTS_DIRECTORY=./Outputs
QUERIES_FILE=./queries.txt

# Security
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=24h
```

## 📚 API Documentation

### Authentication Routes (`/api/auth`)

```http
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
```

### Lead Management (`/api/leads`)

```http
GET    /api/leads/search          # Search leads with filters
GET    /api/leads/export          # Export leads to Excel/CSV
POST   /api/leads/import          # Import leads from file
DELETE /api/leads/:id             # Delete specific lead
GET    /api/leads/stats           # Get lead statistics
GET    /api/leads/recent          # Get recent leads
```

### Scraper Management (`/api/scraper`)

```http
POST /api/scraper/start           # Start scraping job
GET  /api/scraper/status/:jobId   # Get job status
POST /api/scraper/stop/:jobId     # Stop scraping job
```

### Queue Status (`/api/status`)

```http
GET /api/status/queues            # Get queue statistics
GET /api/status/jobs              # Get job details
GET /api/status/health            # System health check
```

### File Management (`/api/files`)

```http
GET    /api/files/download/:fileId  # Download generated files
POST   /api/files/upload           # Upload files for processing
DELETE /api/files/:fileId          # Delete files
GET    /api/files/list             # List available files
```

### Conversation AI (`/api/conversation`)

```http
POST /api/conversation/chat       # Chat with AI assistant
GET  /api/conversation/history    # Get conversation history
```

### Delivery Management (`/api/delivery`)

```http
GET /api/delivery/recent          # Get recent deliveries
GET /api/delivery/:id             # Get specific delivery details
```

## 🔧 Core Modules

### 1. Scraper Engine (`maintemp.py`)

**Features:**
- Selenium-powered Google Maps scraping
- Multi-threaded processing
- Anti-detection mechanisms
- Review date extraction
- Business information collection

**Usage:**
```python
# Processes search queries from queries.txt
# Outputs raw scraped data to CSV
# Handles dynamic content loading
# Extracts: Name, Address, Phone, Reviews, Ratings
```

### 2. Data Formatter (`formatter.py`)

**Features:**
- Business type filtering with sub-categories
- Duplicate removal by phone number
- Data quality validation
- Excel file generation with styling
- US geographic filtering

**Configurable Filters:**
```python
business_filters = {
    "rv park": ['rv park', 'campground', 'mobile home park'],
    "nursing homes": ['assisted living facility', 'nursing home'],
    "auto repair shop": ['mechanic', 'auto repair shop'],
    # ... extensive business type mapping
}
```

### 3. Lead Finder (`FindLeadsAndAddSource.py`)

**Features:**
- Additional data enrichment
- Source tracking
- Contact information validation
- Database integration

### 4. Queue Processors

**Scraper Processor:**
- Manages scraping job lifecycle
- Handles Python script execution
- Progress tracking and error handling
- Result aggregation

**Format Processor:**
- Data cleaning and formatting
- Excel file generation
- Quality assurance checks

**Query Generator:**
- AI-powered search query generation
- Business type and location optimization
- Query diversity and coverage

## 📊 Database Schema

### Key Tables

```sql
-- Business leads storage
leads (
    id, name_of_business, type_of_business, sub_category,
    website, num_reviews, rating, latest_review,
    business_address, phone_number, email, notes,
    source_file, zip_code, state, city, scraped_at
)

-- Scraping job tracking
scraping_jobs (
    id, job_id, client_name, business_types, zip_codes,
    status, queries_generated, leads_found, error_message,
    created_at, started_at, completed_at
)

-- File delivery tracking
deliveries (
    id, file_id, filename, format, lead_count,
    filters, request_type, file_size, file_path,
    status, created_at, downloaded_at
)

-- Queue job management
processing_jobs (
    id, job_id, type, input_file, output_file,
    status, progress, results, error_message,
    created_at, started_at, completed_at
)
```

## 🎯 Queue System

### Queue Types

1. **Scraper Queue** - Google Maps scraping jobs
2. **Formatter Queue** - Data processing and Excel generation
3. **FindLeads Queue** - Lead enrichment and validation
4. **Query Generator Queue** - AI-powered query generation

### Job Lifecycle

```
Pending → Processing → Completed/Failed
    ↓         ↓            ↓
  Queue   Background    Results
  Entry   Processing    Storage
```

### Queue Management

```javascript
// Queue monitoring
GET /api/status/queues

// Job control
POST /api/scraper/start
GET  /api/scraper/status/:jobId
```

## 🤖 AI Integration

### Google Gemini AI Features

- **Intelligent Query Generation** - Optimizes search terms
- **Business Type Recognition** - Classifies business categories
- **Conversation Interface** - Natural language lead requests
- **Data Analysis** - Provides insights on lead quality

### Usage Examples

```javascript
// Natural language requests
"Find auto repair shops in Miami, FL"
"Export all nursing homes in Texas to Excel"
"How many gyms are in California?"
```

## 🔍 Business Filtering System

### Configurable Business Types

The system supports intelligent filtering for specific business categories:

```javascript
// Supported business types with sub-category filtering
- RV Parks / Mobile Home Parks / Trailer Parks
- Nursing Homes / Assisted Living Facilities
- Apartment Buildings / Housing Complexes
- High Schools / Middle Schools
- Laundromats / Laundry Services
- Auto Repair Shops / Mechanics
- Motels / Hotels
- Gyms / Fitness Centers
- Warehouses / Manufacturers
```

### Filtering Logic

- **Strict Filtering**: Applied to predefined business types
- **Open Filtering**: Allows all results for undefined types (e.g., coffee shops, restaurants)
- **Sub-category Matching**: Validates business sub-categories against allowed lists

## 🛡️ Security Features

### Authentication & Authorization
- JWT token-based authentication
- Rate limiting (100 requests/15min in production)
- CORS protection
- Input validation with Joi

### Security Headers
- Helmet.js security headers
- Request sanitization
- File upload restrictions

## 📈 Monitoring & Logging

### Health Checks
```http
GET /health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

### Logging
- Winston-based structured logging
- Request/response logging
- Error tracking
- Queue job monitoring

## 🔧 Development

### Project Structure

```
Backend/
├── src/
│   ├── server.js              # Express server setup
│   │   └── setup.js          # SQLite database schema
│   ├── routes/               # API route handlers
│   │   ├── auth.js          # Authentication routes
│   │   ├── leads.js         # Lead management
│   │   ├── scraper.js       # Scraper control
│   │   ├── conversation.js  # AI chat interface
│   │   └── ...
│   ├── queues/
│   │   ├── setup.js         # Queue configuration
│   │   └── processors/      # Background job processors
│   └── utils/
│       └── logger.js        # Logging utilities
├── maintemp.py              # Google Maps scraper
├── formatter.py             # Data formatting
├── FindLeadsAndAddSource.py # Lead enrichment
├── config.env               # Environment configuration
└── package.json            # Node.js dependencies
```

### Scripts

```bash
npm start        # Production server
npm run dev      # Development with nodemon
npm test         # Run tests
```

### Testing

```bash
# Test API endpoints
curl http://localhost:3000/health

# Test scraper job
curl -X POST http://localhost:3000/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{"businessTypes":["coffee shops"], "zipCodes":["10001"]}'
```

## 🚀 Deployment

### Production Environment

1. **Environment Setup**
```bash
NODE_ENV=production
# Configure production Redis instance
# Set up proper Python environment
# Configure ChromeDriver path
```

2. **Database Migration**
```bash
# Backup existing data
# Run database setup
# Verify table creation
```

3. **Process Management**
```bash
# Use PM2 for process management
pm2 start src/server.js --name "leadassistai-backend"
pm2 startup
pm2 save
```

### Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache python3 py3-pip chromium chromium-chromedriver
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔍 Troubleshooting

### Common Issues

1. **Chrome/ChromeDriver Issues**
```bash
# Ensure ChromeDriver is in PATH
# Update Chrome browser
# Check Selenium version compatibility
```

2. **Redis Connection Issues**
```bash
# Verify Redis is running
redis-cli ping
# Check Redis configuration
```

3. **Python Dependencies**
```bash
# Install required packages
pip install selenium pandas beautifulsoup4
# Verify Python path in config.env
```

4. **Queue Processing Issues**
```bash
# Monitor queue status
GET /api/status/queues
# Check Redis queue contents
redis-cli KEYS "bull:*"
```

### Logs Location

```bash
# Application logs
./logs/app.log
./logs/error.log

# Queue processing logs
./logs/queue.log

# Scraper logs
./logs/scraper.log
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📞 Support

For technical support or questions:
- Check the troubleshooting section
- Review API documentation
- Monitor application logs
- Verify environment configuration 