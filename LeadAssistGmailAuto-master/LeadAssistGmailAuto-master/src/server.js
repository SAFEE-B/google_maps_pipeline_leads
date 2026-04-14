const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

const { setupDatabase } = require('./database/setup');
const { setupQueues } = require('./queues/setup');
const logger = require('./utils/logger');
const googleSheetsWorkflowService = require('./services/googleSheetsWorkflowService');

// Import routes
const leadsRoutes = require('./routes/leads');
const scraperRoutes = require('./routes/scraper');
const processingRoutes = require('./routes/processing');
const filesRoutes = require('./routes/files');
const statusRoutes = require('./routes/status');
const conversationRoutes = require('./routes/conversation');
const deliveryRoutes = require('./routes/delivery');
const authRoutes = require('./routes/auth');
const googleSheetsRoutes = require('./routes/googleSheets');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      /^https:\/\/.*\.ngrok\.io$/,          // ngrok tunnels
      /^https:\/\/.*\.ngrok-free\.app$/,     // ngrok free tunnels  
      /^https:\/\/.*\.loca\.lt$/,           // localtunnel
      /^https:\/\/.*\.onrender\.com$/,      // Render deployments
      /^https:\/\/.*\.vercel\.app$/,        // Vercel deployments
      /^https:\/\/.*\.netlify\.app$/,       // Netlify deployments
    ];
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // More lenient in development
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV === 'development' && req.ip === '::1') {
      return true;
    }
    return false;
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/outputs', express.static(path.join(__dirname, '..', 'Outputs')));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/scraper', scraperRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/conversation', conversationRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/sheets', googleSheetsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Initialize database and queues, then start server
async function startServer() {
  try {
    // Setup database
    await setupDatabase();
    
    // Setup queues
    await setupQueues();

    // Start Google Sheets monitoring if enabled
    if (process.env.ENABLE_SHEETS_MONITORING === 'true') {
      const intervalMinutes = parseInt(process.env.SHEETS_CHECK_INTERVAL_MINUTES) || 5;
      await googleSheetsWorkflowService.startMonitoring(intervalMinutes);
      logger.info(`Google Sheets monitoring started with ${intervalMinutes} minute interval`);
    }

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 