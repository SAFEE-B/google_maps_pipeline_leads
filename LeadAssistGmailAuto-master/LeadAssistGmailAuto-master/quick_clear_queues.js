const { setupQueues, getQueueStats, getScraperQueue, getProcessingQueue } = require('./src/queues/setup');

async function quickClearQueues() {
    try {
        console.log('🚀 Quick Queue Clear - Initializing...');
        
        // Setup queues
        await setupQueues();
        
        // Get queue instances
        const scraperQueue = getScraperQueue();
        const processingQueue = getProcessingQueue();
        
        if (!scraperQueue || !processingQueue) {
            throw new Error('Failed to get queue instances');
        }

        console.log('📊 Getting current stats...');
        const beforeStats = await getQueueStats();
        console.log('Before:', JSON.stringify(beforeStats, null, 2));

        // Quick clean both queues - waiting and failed jobs only
        console.log('\n🧹 Clearing waiting and failed jobs...');
        
        // Scraper Queue
        const scraperWaiting = await scraperQueue.clean(0, 'wait');
        const scraperFailed = await scraperQueue.clean(0, 'failed');
        console.log(`✓ Scraper Queue: ${scraperWaiting.length} waiting + ${scraperFailed.length} failed = ${scraperWaiting.length + scraperFailed.length} jobs cleared`);
        
        // Processing Queue  
        const processingWaiting = await processingQueue.clean(0, 'wait');
        const processingFailed = await processingQueue.clean(0, 'failed');
        console.log(`✓ Processing Queue: ${processingWaiting.length} waiting + ${processingFailed.length} failed = ${processingWaiting.length + processingFailed.length} jobs cleared`);

        const totalCleared = scraperWaiting.length + scraperFailed.length + processingWaiting.length + processingFailed.length;
        console.log(`\n🎯 Total jobs cleared: ${totalCleared}`);

        console.log('\n📊 Final stats:');
        const afterStats = await getQueueStats();
        console.log('After:', JSON.stringify(afterStats, null, 2));

        console.log('\n✅ Quick clear completed!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        process.exit(0);
    }
}

// Run the script
quickClearQueues(); 