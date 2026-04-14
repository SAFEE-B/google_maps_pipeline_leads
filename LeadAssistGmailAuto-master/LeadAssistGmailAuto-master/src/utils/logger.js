const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = 'logs';
require('fs').mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'lead-generation-backend' },
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Write all logs with level 'info' and below to 'combined.log'
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Separate log for scraper activities
    new winston.transports.File({ 
      filename: path.join(logDir, 'scraper.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

// If we're not in production, log to the console with a simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
      })
    )
  }));
}

// Create specialized loggers for different components
const scraperLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'SCRAPER' }),
    winston.format.json()
  ),
  defaultMeta: { component: 'scraper' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'scraper.log'),
      maxsize: 5242880,
      maxFiles: 3
    }),
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

const queueLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: 'QUEUE' }),
    winston.format.json()
  ),
  defaultMeta: { component: 'queue' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'queue.log'),
      maxsize: 5242880,
      maxFiles: 3
    }),
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

module.exports = {
  logger,
  scraperLogger,
  queueLogger
};

// Export default logger
module.exports = logger;
module.exports.scraperLogger = scraperLogger;
module.exports.queueLogger = queueLogger; 