const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { queueLogger } = require('../../utils/logger');
const { runQuery } = require('../../database/setup');
const { addProcessingJob } = require('../setup');

async function formatProcessor(job) {
  const { jobId, inputFile, outputFile, parentJobId } = job.data;
  
  queueLogger.info(`Starting format job ${jobId}`, { inputFile, outputFile });
  
  try {
    // Create processing job record
    await runQuery(
      'INSERT INTO processing_jobs (job_id, type, input_file, output_file, status, started_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [jobId, 'format', inputFile, outputFile, 'processing']
    );

    // Update progress
    job.progress(10);

    // Verify input file exists
    try {
      await fs.access(inputFile);
    } catch (error) {
      throw new Error(`Input file not found: ${inputFile}`);
    }

    // Update formatter.py configuration
    await updateFormatterConfig(inputFile, outputFile);
    
    // Update progress
    job.progress(20);

    // Execute Python formatter script
    const result = await executePythonFormatter(job);
    
    // Update progress
    job.progress(80);

    // Verify output file was created
    try {
      const stats = await fs.stat(outputFile);
      queueLogger.info(`Format job ${jobId} created output file`, { 
        outputFile, 
        size: stats.size 
      });
    } catch (error) {
      throw new Error(`Output file was not created: ${outputFile}`);
    }

    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, completed_at = CURRENT_TIMESTAMP, output_file = ? WHERE job_id = ?',
      ['completed', outputFile, jobId]
    );

    // Automatically trigger findleads job
    await addProcessingJob('findleads', {
      jobId: `findleads_${parentJobId || jobId}`,
      inputFile: outputFile,
      outputFile: outputFile.replace('.xlsx', '_final.xlsx'),
      parentJobId: parentJobId || jobId
    });

    job.progress(100);

    queueLogger.info(`Format job ${jobId} completed successfully`);
    
    return {
      success: true,
      outputFile,
      message: 'Formatting completed successfully'
    };

  } catch (error) {
    queueLogger.error(`Format job ${jobId} failed`, { error: error.message });
    
    // Update job status
    await runQuery(
      'UPDATE processing_jobs SET status = ?, error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE job_id = ?',
      ['failed', error.message, jobId]
    );

    throw error;
  }
}

async function updateFormatterConfig(inputFile, outputFile) {
  const formatterPath = process.env.FORMATTER_SCRIPT_PATH || './formatter.py';
  
  try {
    // Read the current formatter.py file
    let formatterContent = await fs.readFile(formatterPath, 'utf8');
    
    // Update the file paths in the formatter
    formatterContent = formatterContent
      .replace(/file_path\s*=\s*['"][^'"]*['"]/, `file_path = '${inputFile}'`)
      .replace(/output_file\s*=\s*['"][^'"]*['"]/, `output_file = '${outputFile}'`);
    
    // Write the updated content back
    await fs.writeFile(formatterPath, formatterContent, 'utf8');
    
    queueLogger.info('Updated formatter configuration', { inputFile, outputFile });
    
  } catch (error) {
    queueLogger.error('Failed to update formatter configuration', { error: error.message });
    throw new Error(`Failed to update formatter configuration: ${error.message}`);
  }
}

async function executePythonFormatter(job) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_INTERPRETER || 'python';
    const scriptPath = process.env.FORMATTER_SCRIPT_PATH || './formatter.py';
    
    queueLogger.info(`Executing Python formatter: ${pythonPath} ${scriptPath}`);
    
    const pythonProcess = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      queueLogger.info(`Formatter stdout: ${output.trim()}`);
      
      // Update job progress based on output patterns
      if (output.includes('leads left')) {
        job.progress(Math.min(job.progress() + 10, 75));
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      queueLogger.warn(`Formatter stderr: ${error.trim()}`);
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        queueLogger.info('Python formatter completed successfully');
        resolve({ stdout, stderr, exitCode: code });
      } else {
        queueLogger.error(`Python formatter exited with code ${code}`, { stderr });
        reject(new Error(`Formatter failed with exit code ${code}: ${stderr}`));
      }
    });

    pythonProcess.on('error', (error) => {
      queueLogger.error('Failed to start Python formatter', { error: error.message });
      reject(new Error(`Failed to start formatter: ${error.message}`));
    });

    // Set timeout for formatter execution (10 minutes)
    setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error('Formatter execution timed out after 10 minutes'));
    }, 10 * 60 * 1000);
  });
}

module.exports = formatProcessor; 