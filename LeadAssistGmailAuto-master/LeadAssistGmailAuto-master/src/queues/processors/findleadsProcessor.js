const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { queueLogger } = require('../../utils/logger');
const { runQuery } = require('../../database/setup');

async function findleadsProcessor(job) {
  const { jobId, businessTypes, zipCodes, states, outputFile, clientName } = job.data;
  
  queueLogger.info(`Starting findleads job ${jobId}`, { 
    businessTypes, 
    zipCodes: zipCodes?.length || 0,
    outputFile 
  });
  
  try {
    // Create processing job record
    await runQuery(
      'INSERT INTO processing_jobs (job_id, type, output_file, status, started_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [jobId, 'findleads', outputFile, 'processing']
    );

    // Update progress
    job.progress(10);

    // Update FindLeadsAndAddSource.py configuration
    await updateFindleadsConfig(businessTypes, zipCodes, states, outputFile);
    
    // Update progress
    job.progress(20);

    // Execute Python findleads script
    const result = await executePythonFindleads(job);
    
    // Update progress
    job.progress(80);

    // Verify output file was created
    let outputStats = null;
    try {
      outputStats = await fs.stat(outputFile);
      queueLogger.info(`Findleads job ${jobId} created output file`, { 
        outputFile, 
        size: outputStats.size 
      });
    } catch (error) {
      queueLogger.warn(`Output file may not have been created: ${outputFile}`);
      // Don't throw error as the job may have completed successfully but with different output
    }

    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, results = ? WHERE job_id = ?',
      [
        'completed', 
        JSON.stringify({
          outputFile,
          fileSize: outputStats?.size || 0,
          businessTypesProcessed: businessTypes?.length || 0,
          zipCodesProcessed: zipCodes?.length || 0
        }),
        jobId
      ]
    );

    job.progress(100);

    queueLogger.info(`Findleads job ${jobId} completed successfully`);
    
    return {
      success: true,
      outputFile,
      fileSize: outputStats?.size || 0,
      message: 'Findleads processing completed successfully'
    };

  } catch (error) {
    queueLogger.error(`Findleads job ${jobId} failed`, { error: error.message });
    
    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
      ['failed', error.message, jobId]
    );

    throw error;
  }
}

async function updateFindleadsConfig(businessTypes, zipCodes, states, outputFile) {
  const findleadsPath = process.env.FINDLEADS_SCRIPT_PATH || './FindLeadsAndAddSource.py';
  
  try {
    // Read the current FindLeadsAndAddSource.py file
    let findleadsContent = await fs.readFile(findleadsPath, 'utf8');
    
    // Update the business types configuration
    if (businessTypes && businessTypes.length > 0) {
      const businessTypesString = businessTypes.join(', ');
      findleadsContent = findleadsContent.replace(
        /TARGET_BUSINESS_TYPES_INPUT\s*=\s*["'][^"']*["']/,
        `TARGET_BUSINESS_TYPES_INPUT = "${businessTypesString}"`
      );
    }
    
    // Update the zip codes configuration
    if (zipCodes && zipCodes.length > 0) {
      const zipCodesString = zipCodes.join(', ');
      findleadsContent = findleadsContent.replace(
        /zip_codes_input\s*=\s*["'][^"']*["']/,
        `zip_codes_input = "${zipCodesString}"`
      );
    }
    
    // Update the output filename
    if (outputFile) {
      const outputFilename = path.basename(outputFile);
      findleadsContent = findleadsContent.replace(
        /OUTPUT_FILENAME\s*=\s*["'][^"']*["']/,
        `OUTPUT_FILENAME = "${outputFilename}"`
      );
    }
    
    // Update state filter if provided
    if (states && states.length > 0) {
      const statesArray = states.map(s => `'${s}'`).join(', ');
      findleadsContent = findleadsContent.replace(
        /State_Filter\s*=\s*\[[^\]]*\]/,
        `State_Filter = [${statesArray}]`
      );
    }
    
    // Write the updated content back
    await fs.writeFile(findleadsPath, findleadsContent, 'utf8');
    
    queueLogger.info('Updated findleads configuration', { 
      businessTypes: businessTypes?.length || 0,
      zipCodes: zipCodes?.length || 0,
      states: states?.length || 0,
      outputFile 
    });
    
  } catch (error) {
    queueLogger.error('Failed to update findleads configuration', { error: error.message });
    throw new Error(`Failed to update findleads configuration: ${error.message}`);
  }
}

async function executePythonFindleads(job) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_INTERPRETER || 'python';
    const scriptPath = process.env.FINDLEADS_SCRIPT_PATH || './FindLeadsAndAddSource.py';
    
    queueLogger.info(`Executing Python findleads: ${pythonPath} ${scriptPath}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      queueLogger.info(`Findleads stdout: ${output.trim()}`);
      
      // Update job progress based on output patterns
      if (output.includes('Processing') || output.includes('Found')) {
        job.progress(Math.min(job.progress() + 5, 75));
      }
      
      if (output.includes('Writing') || output.includes('Saving')) {
        job.progress(Math.min(job.progress() + 10, 75));
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      queueLogger.warn(`Findleads stderr: ${error.trim()}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        queueLogger.info('Python findleads completed successfully');
        resolve({ stdout, stderr, exitCode: code });
      } else {
        queueLogger.error(`Python findleads exited with code ${code}`, { stderr });
        reject(new Error(`Findleads failed with exit code ${code}: ${stderr}`));
      }
    });

    pythonProcess.on('error', (error) => {
      queueLogger.error('Failed to start Python findleads', { error: error.message });
      reject(new Error(`Failed to start findleads: ${error.message}`));
    });

    // Set timeout for findleads execution (15 minutes)
    setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error('Findleads execution timed out after 15 minutes'));
    }, 15 * 60 * 1000);
  });
}

module.exports = findleadsProcessor; 