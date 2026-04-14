const { setupQueues, getQueueStats, getScraperQueue, getProcessingQueue } = require('./src/queues/setup');
const { queueLogger } = require('./src/utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Import database functions
let runQuery, getAll;
try {
    const { runQuery: dbRunQuery, getAll: dbGetAll } = require('./src/database/setup');
    runQuery = dbRunQuery;
    getAll = dbGetAll;
} catch (error) {
    console.warn('Database functions not available - will skip database cleanup');
}

async function clearAllQueues(options = {}) {
    const {
        clearWaiting = true,
        clearActive = false,
        clearCompleted = true,
        clearFailed = true,
        clearStalled = true,
        clearDatabase = true,
        clearFiles = true,
        clearRedis = true,
        force = false
    } = options;

    try {
        console.log('🚀 Initializing queues...');
        await setupQueues();
        
        // Get queue instances
        const scraperQueue = getScraperQueue();
        const processingQueue = getProcessingQueue();
        
        if (!scraperQueue || !processingQueue) {
            throw new Error('Failed to get queue instances. Make sure queues are properly initialized.');
        }

        // Get stats before cleaning
        console.log('\n📊 Queue stats BEFORE cleaning:');
        const beforeStats = await getQueueStats();
        console.log(JSON.stringify(beforeStats, null, 2));

        console.log('\n🧹 Starting comprehensive cleaning process...');

        // 1. Clean Redis Queues
        if (clearRedis) {
            await cleanRedisQueues(scraperQueue, processingQueue, {
                clearWaiting,
                clearActive,
                clearCompleted,
                clearFailed,
                clearStalled,
                force
            });
        }

        // 2. Clean Database Records
        if (clearDatabase && runQuery) {
            await cleanDatabaseRecords({
                clearCompleted,
                clearFailed,
                clearAll: force
            });
        } else if (clearDatabase && !runQuery) {
            console.log('\n⚠️  Database cleanup requested but database functions not available');
        }

        // 3. Clean Temporary Files
        if (clearFiles) {
            await cleanTemporaryFiles();
        }

        // 4. Clean Output Files (optional)
        if (clearFiles && force) {
            await cleanOutputFiles();
        }

        // Get stats after cleaning
        console.log('\n📊 Queue stats AFTER cleaning:');
        const afterStats = await getQueueStats();
        console.log(JSON.stringify(afterStats, null, 2));

        console.log('\n✅ Comprehensive cleaning completed successfully!');

    } catch (error) {
        console.error('❌ Error cleaning queues:', error.message);
        queueLogger.error('Queue cleaning failed', { error: error.message, stack: error.stack });
        throw error;
    }
}

async function cleanRedisQueues(scraperQueue, processingQueue, options) {
    const {
        clearWaiting,
        clearActive,
        clearCompleted,
        clearFailed,
        clearStalled,
        force
    } = options;

    console.log('\n🔴 Cleaning Redis Queues...');

    // Clean scraper queue
    await cleanQueue(scraperQueue, 'Scraper Queue', {
        clearWaiting,
        clearActive,
        clearCompleted,
        clearFailed,
        clearStalled,
        force
    });

    // Clean processing queue
    await cleanQueue(processingQueue, 'Processing Queue', {
        clearWaiting,
        clearActive,
        clearCompleted,
        clearFailed,
        clearStalled,
        force
    });

    // Force empty queues if requested
    if (force) {
        console.log('\n💥 Force emptying queues...');
        try {
            await scraperQueue.empty();
            console.log('   ✓ Scraper queue force emptied');
        } catch (error) {
            console.log(`   ⚠️  Could not force empty scraper queue: ${error.message}`);
        }
        
        try {
            await processingQueue.empty();
            console.log('   ✓ Processing queue force emptied');
        } catch (error) {
            console.log(`   ⚠️  Could not force empty processing queue: ${error.message}`);
        }
    }
}

async function cleanDatabaseRecords(options) {
    const { clearCompleted, clearFailed, clearAll } = options;
    
    console.log('\n🗄️  Cleaning Database Records...');
    
    try {
        let totalCleaned = 0;
        
        // Clean scraping_jobs table
        if (clearAll) {
            const allScrapingResult = await runQuery("DELETE FROM scraping_jobs", []);
            const allScrapingCount = allScrapingResult?.changes || 0;
            console.log(`   ✓ Cleared ALL ${allScrapingCount} scraping jobs from database`);
            totalCleaned += allScrapingCount;
        } else {
            if (clearCompleted) {
                const completedResult = await runQuery(
                    "DELETE FROM scraping_jobs WHERE status = 'completed'",
                    []
                );
                const completedCount = completedResult?.changes || 0;
                console.log(`   ✓ Cleared ${completedCount} completed scraping jobs from database`);
                totalCleaned += completedCount;
            }
            
            if (clearFailed) {
                const failedResult = await runQuery(
                    "DELETE FROM scraping_jobs WHERE status = 'failed'",
                    []
                );
                const failedCount = failedResult?.changes || 0;
                console.log(`   ✓ Cleared ${failedCount} failed scraping jobs from database`);
                totalCleaned += failedCount;
            }
        }
        
        // Clean processing_jobs table
        if (clearAll) {
            const allProcessingResult = await runQuery("DELETE FROM processing_jobs", []);
            const allProcessingCount = allProcessingResult?.changes || 0;
            console.log(`   ✓ Cleared ALL ${allProcessingCount} processing jobs from database`);
            totalCleaned += allProcessingCount;
        } else {
            if (clearCompleted) {
                const procCompletedResult = await runQuery(
                    "DELETE FROM processing_jobs WHERE status = 'completed'",
                    []
                );
                const procCompletedCount = procCompletedResult?.changes || 0;
                console.log(`   ✓ Cleared ${procCompletedCount} completed processing jobs from database`);
                totalCleaned += procCompletedCount;
            }
            
            if (clearFailed) {
                const procFailedResult = await runQuery(
                    "DELETE FROM processing_jobs WHERE status = 'failed'",
                    []
                );
                const procFailedCount = procFailedResult?.changes || 0;
                console.log(`   ✓ Cleared ${procFailedCount} failed processing jobs from database`);
                totalCleaned += procFailedCount;
            }
        }
        
        // Clean sheets_job_requests table
        if (clearAll) {
            const allSheetsResult = await runQuery("DELETE FROM sheets_job_requests", []);
            const allSheetsCount = allSheetsResult?.changes || 0;
            console.log(`   ✓ Cleared ALL ${allSheetsCount} sheet requests from database`);
            totalCleaned += allSheetsCount;
        } else {
            if (clearCompleted) {
                const sheetsCompletedResult = await runQuery(
                    "DELETE FROM sheets_job_requests WHERE sheet_status = 'completed'",
                    []
                );
                const sheetsCompletedCount = sheetsCompletedResult?.changes || 0;
                console.log(`   ✓ Cleared ${sheetsCompletedCount} completed sheet requests from database`);
                totalCleaned += sheetsCompletedCount;
            }
            
            if (clearFailed) {
                const sheetsFailedResult = await runQuery(
                    "DELETE FROM sheets_job_requests WHERE sheet_status = 'failed'",
                    []
                );
                const sheetsFailedCount = sheetsFailedResult?.changes || 0;
                console.log(`   ✓ Cleared ${sheetsFailedCount} failed sheet requests from database`);
                totalCleaned += sheetsFailedCount;
            }
        }

        // Clean search_queries table
        if (clearAll) {
            const allQueriesResult = await runQuery("DELETE FROM search_queries", []);
            const allQueriesCount = allQueriesResult?.changes || 0;
            console.log(`   ✓ Cleared ALL ${allQueriesCount} search queries from database`);
            totalCleaned += allQueriesCount;
        }

        // Clean deliveries table (old files)
        if (clearAll) {
            const allDeliveriesResult = await runQuery("DELETE FROM deliveries", []);
            const allDeliveriesCount = allDeliveriesResult?.changes || 0;
            console.log(`   ✓ Cleared ALL ${allDeliveriesCount} delivery records from database`);
            totalCleaned += allDeliveriesCount;
        }
        
        console.log(`   📋 Total database records cleaned: ${totalCleaned}`);
        
    } catch (error) {
        console.error(`   ❌ Error cleaning database records:`, error.message);
        // Don't throw - continue with other cleanup even if database cleanup fails
    }
}

async function cleanTemporaryFiles() {
    console.log('\n📁 Cleaning Temporary Files...');
    
    const tempFiles = [
        './queries.txt',
        './temp_queries.txt',
        './scraped_data_temp.csv'
    ];
    
    let cleanedCount = 0;
    
    for (const filePath of tempFiles) {
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            console.log(`   ✓ Deleted temporary file: ${filePath}`);
            cleanedCount++;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.log(`   ⚠️  Could not delete ${filePath}: ${error.message}`);
            }
        }
    }
    
    console.log(`   📋 Total temporary files cleaned: ${cleanedCount}`);
}

async function cleanOutputFiles() {
    console.log('\n📁 Cleaning Output Files...');
    
    const outputDirs = [
        './Outputs',
        './Files/Deliveries'
    ];
    
    let cleanedCount = 0;
    
    for (const dirPath of outputDirs) {
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                if (file.endsWith('.csv') || file.endsWith('.xlsx') || file.endsWith('.xls')) {
                    const filePath = path.join(dirPath, file);
                    await fs.unlink(filePath);
                    console.log(`   ✓ Deleted output file: ${filePath}`);
                    cleanedCount++;
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.log(`   ⚠️  Could not clean directory ${dirPath}: ${error.message}`);
            }
        }
    }
    
    console.log(`   📋 Total output files cleaned: ${cleanedCount}`);
}

async function cleanQueue(queue, queueName, options) {
    const {
        clearWaiting,
        clearActive,
        clearCompleted,
        clearFailed,
        clearStalled,
        force
    } = options;

    console.log(`\n🔧 Cleaning ${queueName}...`);

    try {
        // Get current counts
        const counts = await queue.getJobCounts();
        console.log(`   Current counts: ${JSON.stringify(counts)}`);

        let totalCleaned = 0;

        // Clear waiting jobs
        if (clearWaiting && counts.waiting > 0) {
            const cleaned = await queue.clean(0, 'wait');
            console.log(`   ✓ Cleared ${cleaned.length} waiting jobs`);
            totalCleaned += cleaned.length;
        }

        // Clear active jobs (be careful with this!)
        if (clearActive && counts.active > 0) {
            if (force) {
                const cleaned = await queue.clean(0, 'active');
                console.log(`   ⚠️  Cleared ${cleaned.length} active jobs (FORCED)`);
                totalCleaned += cleaned.length;
            } else {
                console.log(`   ⚠️  Skipping ${counts.active} active jobs (use --force to clear active jobs)`);
            }
        }

        // Clear completed jobs
        if (clearCompleted && counts.completed > 0) {
            const cleaned = await queue.clean(0, 'completed');
            console.log(`   ✓ Cleared ${cleaned.length} completed jobs`);
            totalCleaned += cleaned.length;
        }

        // Clear failed jobs
        if (clearFailed && counts.failed > 0) {
            const cleaned = await queue.clean(0, 'failed');
            console.log(`   ✓ Cleared ${cleaned.length} failed jobs`);
            totalCleaned += cleaned.length;
        }

        // Clear stalled jobs
        if (clearStalled && counts.stalled > 0) {
            const cleaned = await queue.clean(0, 'stalled');
            console.log(`   ✓ Cleared ${cleaned.length} stalled jobs`);
            totalCleaned += cleaned.length;
        }

        console.log(`   📋 Total jobs cleaned from ${queueName}: ${totalCleaned}`);

    } catch (error) {
        console.error(`   ❌ Error cleaning ${queueName}:`, error.message);
        throw error;
    }
}

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        clearWaiting: true,
        clearActive: false,
        clearCompleted: true,
        clearFailed: true,
        clearStalled: true,
        clearDatabase: true,
        clearFiles: true,
        clearRedis: true,
        force: false
    };

    args.forEach(arg => {
        switch (arg) {
            case '--no-waiting':
                options.clearWaiting = false;
                break;
            case '--active':
                options.clearActive = true;
                break;
            case '--no-completed':
                options.clearCompleted = false;
                break;
            case '--no-failed':
                options.clearFailed = false;
                break;
            case '--no-stalled':
                options.clearStalled = false;
                break;
            case '--no-database':
                options.clearDatabase = false;
                break;
            case '--no-files':
                options.clearFiles = false;
                break;
            case '--no-redis':
                options.clearRedis = false;
                break;
            case '--force':
                options.force = true;
                break;
            case '--waiting-only':
                options.clearWaiting = true;
                options.clearActive = false;
                options.clearCompleted = false;
                options.clearFailed = false;
                options.clearStalled = false;
                options.clearDatabase = false;
                options.clearFiles = false;
                options.clearRedis = false;
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
                break;
        }
    });

    return options;
}

function showHelp() {
    console.log(`
🧹 Queue Cleaner Script
Usage: node clear_all_queues.js [options]

Options:
  --no-waiting      Don't clear waiting jobs (default: clear waiting)
  --active          Clear active jobs (default: don't clear active)
  --no-completed    Don't clear completed jobs (default: clear completed)
  --no-failed       Don't clear failed jobs (default: clear failed)
  --no-stalled      Don't clear stalled jobs (default: clear stalled)
  --no-database     Don't clear database records (default: clear database)
  --no-files        Don't clear temporary files (default: clear temporary files)
  --no-redis        Don't clear Redis queues (default: clear Redis queues)
  --force           Force clear active jobs (dangerous!)
  --waiting-only    Only clear waiting jobs (skips database)
  --help, -h        Show this help message

Examples:
  node clear_all_queues.js                    # Clear queues and database records
  node clear_all_queues.js --waiting-only     # Clear only waiting jobs
  node clear_all_queues.js --no-database      # Clear queues but not database
  node clear_all_queues.js --active --force   # Clear all including active jobs (dangerous!)
    `);
}

// Main execution
if (require.main === module) {
    const options = parseArguments();
    
    console.log('🧹 Queue Cleaner Starting...');
    console.log('Options:', options);

    clearAllQueues(options)
        .then(() => {
            console.log('\n🎉 All done! Exiting...');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Fatal error:', error.message);
            process.exit(1);
        });
}

module.exports = { clearAllQueues, cleanQueue }; 