const fs = require('fs').promises;
const path = require('path');
const { queueLogger } = require('../../utils/logger');
const { runQuery } = require('../../database/setup');

async function queryGeneratorProcessor(job) {
  const { jobId, businessTypes, zipCodes, states, outputFile } = job.data;
  
  queueLogger.info(`Starting query generation job ${jobId}`, { 
    businessTypes: businessTypes?.length || 0, 
    zipCodes: zipCodes?.length || 0,
    outputFile 
  });
  
  try {
    // Create processing job record
    await runQuery(
      'INSERT INTO processing_jobs (job_id, type, output_file, status, started_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [jobId, 'generate_queries', outputFile, 'processing']
    );

    // Update progress
    job.progress(10);

    // Generate search queries
    const queries = generateSearchQueries(businessTypes, zipCodes, states);
    
    queueLogger.info(`Generated ${queries.length} search queries`);
    
    // Update progress
    job.progress(50);

    // Write queries to file
    await writeQueriesToFile(queries, outputFile);
    
    // Update progress
    job.progress(80);

    // Store queries in database for tracking
    await storeQueriesInDatabase(queries, jobId);

    // Verify output file was created
    const outputStats = await fs.stat(outputFile);
    
    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, results = ? WHERE job_id = ?',
      [
        'completed', 
        JSON.stringify({
          outputFile,
          queriesGenerated: queries.length,
          fileSize: outputStats.size,
          businessTypes: businessTypes?.length || 0,
          zipCodes: zipCodes?.length || 0
        }),
        jobId
      ]
    );

    job.progress(100);

    queueLogger.info(`Query generation job ${jobId} completed`, { 
      queriesGenerated: queries.length,
      outputFile 
    });
    
    return {
      success: true,
      queriesGenerated: queries.length,
      outputFile,
      fileSize: outputStats.size,
      message: 'Query generation completed successfully'
    };

  } catch (error) {
    queueLogger.error(`Query generation job ${jobId} failed`, { error: error.message });
    
    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
      ['failed', error.message, jobId]
    );

    throw error;
  }
}

function generateSearchQueries(businessTypes, zipCodes, states) {
  const queries = [];
  
  if (!businessTypes || !Array.isArray(businessTypes) || businessTypes.length === 0) {
    throw new Error('Business types are required for query generation');
  }
  
  if (!zipCodes || !Array.isArray(zipCodes) || zipCodes.length === 0) {
    throw new Error('Zip codes are required for query generation');
  }

  businessTypes.forEach(businessType => {
    zipCodes.forEach(zipCode => {
      // Clean and format the inputs
      const cleanBusinessType = businessType.trim().toLowerCase();
      const cleanZipCode = zipCode.trim();
      
      // Generate different query formats based on your existing pattern
      const queryFormats = [
        `${cleanBusinessType} near ${cleanZipCode}`,
        `${cleanBusinessType} in ${cleanZipCode}`,
        `${cleanBusinessType} ${cleanZipCode}`
      ];

      // Use the first format for consistency with existing system
      const queryText = queryFormats[0];
      
      queries.push({
        businessType: cleanBusinessType,
        location: cleanZipCode,
        queryText: queryText,
        searchQuery: `"${cleanBusinessType}", "${queryText}"` // Format matching queries.txt
      });
    });
  });

  // If states are provided, also generate state-based queries
  if (states && Array.isArray(states) && states.length > 0) {
    businessTypes.forEach(businessType => {
      states.forEach(state => {
        const cleanBusinessType = businessType.trim().toLowerCase();
        const cleanState = state.trim().toUpperCase();
        
        const queryText = `${cleanBusinessType} in ${cleanState}`;
        
        queries.push({
          businessType: cleanBusinessType,
          location: cleanState,
          queryText: queryText,
          searchQuery: `"${cleanBusinessType}", "${queryText}"`
        });
      });
    });
  }

  return queries;
}

async function writeQueriesToFile(queries, outputFile) {
  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });

    // Format queries in the same format as your existing queries.txt
    const queryLines = queries.map(q => q.searchQuery);
    const content = queryLines.join('\n');

    await fs.writeFile(outputFile, content, 'utf8');
    
    queueLogger.info(`Wrote ${queries.length} queries to ${outputFile}`);
    
  } catch (error) {
    queueLogger.error(`Failed to write queries to file: ${error.message}`);
    throw new Error(`Failed to write queries to file: ${error.message}`);
  }
}

async function storeQueriesInDatabase(queries, scrapingJobId) {
  try {
    // Store each query in the database for tracking
    for (const query of queries) {
      await runQuery(
        'INSERT INTO search_queries (business_type, location, query_text, scraping_job_id) VALUES (?, ?, ?, ?)',
        [query.businessType, query.location, query.queryText, scrapingJobId]
      );
    }
    
    queueLogger.info(`Stored ${queries.length} queries in database`);
    
  } catch (error) {
    // Don't fail the job if database storage fails, just log the error
    queueLogger.error(`Failed to store queries in database: ${error.message}`);
  }
}

module.exports = queryGeneratorProcessor; 