const { setupQueues, getQueueStats, getScraperQueue, getProcessingQueue } = require('./src/queues/setup');
const { queueLogger } = require('./src/utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Import database functions
let runQuery, getAll, setupDatabase;
try {
    const { runQuery: dbRunQuery, getAll: dbGetAll, setupDatabase: dbSetup } = require('./src/database/setup');
    runQuery = dbRunQuery;
    getAll = dbGetAll;
    setupDatabase = dbSetup;
} catch (error) {
    console.warn('Database functions not available - will skip database cleanup');
}

async function nuclearClearAll() {
    console.log('☢️  NUCLEAR CLEAR ALL - This will clear EVERYTHING!');
    console.log('⚠️  WARNING: This will delete ALL data, jobs, files, and reset the system!');
    console.log('⚠️  This action is IRREVERSIBLE!');
    
    try {
        console.log('\n🚀 Initializing system...');
        
        // Setup database if available
        if (setupDatabase) {
            await setupDatabase();
        }
        
        // Setup queues
        await setupQueues();
        
        // Get queue instances
        const scraperQueue = getScraperQueue();
        const processingQueue = getProcessingQueue();
        
        if (!scraperQueue || !processingQueue) {
            throw new Error('Failed to get queue instances');
        }

        console.log('\n📊 Current system state:');
        const beforeStats = await getQueueStats();
        console.log(JSON.stringify(beforeStats, null, 2));

        console.log('\n☢️  Starting NUCLEAR CLEAR process...');

        // 1. NUCLEAR CLEAR REDIS QUEUES
        console.log('\n🔴 NUCLEAR CLEARING REDIS QUEUES...');
        await nuclearClearRedisQueues(scraperQueue, processingQueue);

        // 2. NUCLEAR CLEAR DATABASE
        if (runQuery) {
            console.log('\n🗄️  NUCLEAR CLEARING DATABASE...');
            await nuclearClearDatabase();
        }

        // 3. NUCLEAR CLEAR ALL FILES
        console.log('\n📁 NUCLEAR CLEARING ALL FILES...');
        await nuclearClearAllFiles();

        // 4. RESET SYSTEM STATE
        console.log('\n🔄 RESETTING SYSTEM STATE...');
        await resetSystemState();

        // Get final stats
        console.log('\n📊 Final system state:');
        const afterStats = await getQueueStats();
        console.log(JSON.stringify(afterStats, null, 2));

        console.log('\n✅ NUCLEAR CLEAR completed! System has been completely reset.');

    } catch (error) {
        console.error('❌ Error during nuclear clear:', error.message);
        queueLogger.error('Nuclear clear failed', { error: error.message, stack: error.stack });
        throw error;
    }
}

async function nuclearClearRedisQueues(scraperQueue, processingQueue) {
    console.log('   💥 Force emptying ALL Redis queues...');
    
    const queues = [
        { name: 'Scraper Queue', queue: scraperQueue },
        { name: 'Processing Queue', queue: processingQueue }
    ];
    
    for (const { name, queue } of queues) {
        try {
            // Clear all job types
            const jobTypes = ['wait', 'active', 'completed', 'failed', 'delayed', 'stalled'];
            let totalCleared = 0;
            
            for (const jobType of jobTypes) {
                try {
                    const cleared = await queue.clean(0, jobType);
                    if (cleared.length > 0) {
                        console.log(`     ✓ Cleared ${cleared.length} ${jobType} jobs from ${name}`);
                        totalCleared += cleared.length;
                    }
                } catch (error) {
                    console.log(`     ⚠️  Could not clear ${jobType} jobs from ${name}: ${error.message}`);
                }
            }
            
            // Force empty the queue completely
            try {
                await queue.empty();
                console.log(`     💥 Force emptied ${name}`);
            } catch (error) {
                console.log(`     ⚠️  Could not force empty ${name}: ${error.message}`);
            }
            
            console.log(`     📋 Total cleared from ${name}: ${totalCleared} jobs`);
            
        } catch (error) {
            console.log(`     ❌ Error clearing ${name}: ${error.message}`);
        }
    }
}

async function nuclearClearDatabase() {
    console.log('   💥 Clearing ALL database tables...');
    
    const tables = [
        'scraping_jobs',
        'processing_jobs', 
        'sheets_job_requests',
        'search_queries',
        'deliveries',
        'client_requests',
        'email_confirmations'
    ];
    
    let totalCleared = 0;
    
    for (const table of tables) {
        try {
            const result = await runQuery(`DELETE FROM ${table}`, []);
            const count = result?.changes || 0;
            if (count > 0) {
                console.log(`     ✓ Cleared ALL ${count} records from ${table}`);
                totalCleared += count;
            }
        } catch (error) {
            console.log(`     ⚠️  Could not clear ${table}: ${error.message}`);
        }
    }
    
    console.log(`     📋 Total database records cleared: ${totalCleared}`);
}

async function nuclearClearAllFiles() {
    console.log('   💥 Deleting ALL temporary and output files...');
    
    const filesToDelete = [
        './queries.txt',
        './temp_queries.txt',
        './scraped_data_temp.csv',
        './scraped_data.csv',
        './formatted_data.csv',
        './final_output.csv'
    ];
    
    const directoriesToClean = [
        './Outputs',
        './Files/Deliveries',
        './Files',
        './logs'
    ];
    
    let filesDeleted = 0;
    
    // Delete specific files
    for (const filePath of filesToDelete) {
        try {
            await fs.access(filePath);
            await fs.unlink(filePath);
            console.log(`     ✓ Deleted file: ${filePath}`);
            filesDeleted++;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.log(`     ⚠️  Could not delete ${filePath}: ${error.message}`);
            }
        }
    }
    
    // Clean directories
    for (const dirPath of directoriesToClean) {
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const stats = await fs.stat(filePath);
                    if (stats.isFile()) {
                        await fs.unlink(filePath);
                        console.log(`     ✓ Deleted file: ${filePath}`);
                        filesDeleted++;
                    }
                } catch (error) {
                    console.log(`     ⚠️  Could not delete ${filePath}: ${error.message}`);
                }
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.log(`     ⚠️  Could not clean directory ${dirPath}: ${error.message}`);
            }
        }
    }
    
    console.log(`     📋 Total files deleted: ${filesDeleted}`);
}

async function resetSystemState() {
    console.log('   🔄 Resetting system state...');
    
    try {
        // Reset any system metadata
        if (runQuery) {
            try {
                await runQuery("DELETE FROM system_metadata", []);
                console.log('     ✓ Reset system metadata');
            } catch (error) {
                console.log(`     ⚠️  Could not reset system metadata: ${error.message}`);
            }
        }
        
        // Create fresh directories if they don't exist
        const directories = ['./Outputs', './Files/Deliveries', './logs', './data'];
        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                console.log(`     ✓ Ensured directory exists: ${dir}`);
            } catch (error) {
                console.log(`     ⚠️  Could not create directory ${dir}: ${error.message}`);
            }
        }
        
        console.log('     ✅ System state reset complete');
        
    } catch (error) {
        console.log(`     ❌ Error resetting system state: ${error.message}`);
    }
}

// Command line interface
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        confirm: false,
        help: false
    };

    for (const arg of args) {
        switch (arg) {
            case '--confirm':
                options.confirm = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                console.log(`Unknown option: ${arg}`);
                options.help = true;
                break;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
☢️  NUCLEAR CLEAR ALL - Complete System Reset

This script will clear EVERYTHING:
- All Redis queues (waiting, active, completed, failed, stalled)
- All database records (jobs, requests, queries, deliveries)
- All temporary files (queries.txt, scraped data, etc.)
- All output files (CSV, Excel files)
- Reset system state

⚠️  WARNING: This action is IRREVERSIBLE!

Usage:
  node nuclear_clear_all.js --confirm

Options:
  --confirm    Required confirmation flag (safety measure)
  --help, -h   Show this help message

Examples:
  node nuclear_clear_all.js --confirm    # Clear everything
  node nuclear_clear_all.js --help       # Show help
`);
}

// Main execution
async function main() {
    const options = parseArguments();

    if (options.help) {
        showHelp();
        return;
    }

    if (!options.confirm) {
        console.log('❌ NUCLEAR CLEAR requires --confirm flag for safety!');
        console.log('Run: node nuclear_clear_all.js --confirm');
        process.exit(1);
    }

    console.log('⚠️  FINAL WARNING: This will delete ALL data and reset the system!');
    console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...\n');

    // Give user 5 seconds to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));

    await nuclearClearAll();
    console.log('\n🎉 Nuclear clear completed successfully!');
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Nuclear clear failed:', error.message);
        process.exit(1);
    });
}

module.exports = { nuclearClearAll }; 