const { setupQueues, getQueueStats, getScraperQueue, getProcessingQueue } = require('./src/queues/setup');

async function forceClearAllQueues() {
    try {
        console.log('💥 FORCE CLEAR ALL QUEUES - This will stop active jobs!');
        console.log('🚀 Initializing...');
        
        // Setup queues
        await setupQueues();
        
        // Get queue instances
        const scraperQueue = getScraperQueue();
        const processingQueue = getProcessingQueue();
        
        if (!scraperQueue || !processingQueue) {
            throw new Error('Failed to get queue instances');
        }

        console.log('📊 Current stats:');
        const beforeStats = await getQueueStats();
        console.log(JSON.stringify(beforeStats, null, 2));

        console.log('\n💥 FORCE CLEARING ALL JOB TYPES (including active)...');
        
        const jobTypes = ['wait', 'active', 'completed', 'failed', 'delayed'];
        let totalCleared = 0;
        
        // Clear scraper queue completely
        console.log('\n🔧 Scraper Queue:');
        for (const jobType of jobTypes) {
            try {
                const cleared = await scraperQueue.clean(0, jobType);
                if (cleared.length > 0) {
                    console.log(`   ✓ Cleared ${cleared.length} ${jobType} jobs`);
                    totalCleared += cleared.length;
                }
            } catch (error) {
                console.log(`   ⚠️  Could not clear ${jobType} jobs: ${error.message}`);
            }
        }
        
        // Clear processing queue completely
        console.log('\n🔧 Processing Queue:');
        for (const jobType of jobTypes) {
            try {
                const cleared = await processingQueue.clean(0, jobType);
                if (cleared.length > 0) {
                    console.log(`   ✓ Cleared ${cleared.length} ${jobType} jobs`);
                    totalCleared += cleared.length;
                }
            } catch (error) {
                console.log(`   ⚠️  Could not clear ${jobType} jobs: ${error.message}`);
            }
        }

        console.log(`\n🎯 Total jobs cleared: ${totalCleared}`);

        // Optional: Also empty the queues completely
        console.log('\n🧹 Emptying queues completely...');
        try {
            await scraperQueue.empty();
            console.log('   ✓ Scraper queue emptied');
        } catch (error) {
            console.log(`   ⚠️  Could not empty scraper queue: ${error.message}`);
        }
        
        try {
            await processingQueue.empty();
            console.log('   ✓ Processing queue emptied');
        } catch (error) {
            console.log(`   ⚠️  Could not empty processing queue: ${error.message}`);
        }

        console.log('\n📊 Final stats:');
        const afterStats = await getQueueStats();
        console.log(JSON.stringify(afterStats, null, 2));

        console.log('\n✅ FORCE CLEAR completed! All queues should be empty now.');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        process.exit(0);
    }
}

// Run the script
console.log('⚠️  WARNING: This will forcefully clear ALL jobs including active ones!');
console.log('⚠️  This may interrupt work in progress!');
console.log('⚠️  Press Ctrl+C within 3 seconds to cancel...\n');

setTimeout(() => {
    forceClearAllQueues();
}, 3000); 