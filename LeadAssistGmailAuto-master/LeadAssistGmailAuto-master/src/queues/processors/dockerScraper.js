'use strict';

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { scraperLogger } = require('../../utils/logger');

/**
 * Groups an array of query objects by their businessType.
 * @param {Array<{businessType: string, query: string}>} queries
 * @returns {Object} e.g. { 'rv park': ['rv park near 90210 US', ...] }
 */
function groupQueriesByBusinessType(queries) {
  const groups = {};
  for (const q of queries) {
    if (!groups[q.businessType]) {
      groups[q.businessType] = [];
    }
    groups[q.businessType].push(q.query);
  }
  return groups;
}

/**
 * Converts a "YYYY-M-D" date string from the scraper into a relative
 * string like "3 weeks ago". Returns "No review date" if input is invalid.
 * @param {string|null} when  e.g. "2026-2-10"
 * @returns {string}
 */
function convertToRelativeDate(when) {
  if (!when) return 'No review date';

  // Parse "YYYY-M-D" — new Date() is unreliable with this format, parse manually
  const parts = String(when).split('-');
  if (parts.length !== 3) return 'No review date';

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // months are 0-indexed in JS
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return 'No review date';

  const reviewDate = new Date(year, month, day);
  if (isNaN(reviewDate.getTime())) return 'No review date';

  const now = new Date();
  const diffMs = now - reviewDate;
  if (diffMs < 0) return 'No review date'; // future date, shouldn't happen

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Maps a single row from the new scraper's 34-column CSV to the
 * 9-column format expected by the rest of the pipeline.
 * @param {Object} row  CSV row parsed by csv-parser
 * @param {string} businessType  The business type used for this scraper run
 * @returns {Object} Row in pipeline format
 */
function mapRowToPipelineFormat(row, businessType) {
  return {
    'Type of Business': businessType,
    'Sub-Category': row.category || '',
    'Name of Business': row.title || '',
    'Website': row.website || '',
    '# of Reviews': row.review_count || '',
    'Rating': row.review_rating || '',
    'Latest Review Date': row.latest_review_date || 'No review date',
    'Business Address': row.address || '',
    'Phone Number': row.phone || '',
  };
}

const SCRAPER_DOCKERFILE_DIR = 'C:/Users/safee/Desktop/WORk/gmap_scrpaaer_gosom/google-maps-scraper';

async function ensureImageExists(image) {
  const check = await new Promise((resolve) => {
    const proc = spawn('docker', ['images', '-q', image], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('exit', () => resolve(out.trim()));
  });

  if (check) return; // image exists

  scraperLogger.info(`Docker image "${image}" not found — building from ${SCRAPER_DOCKERFILE_DIR}`);

  await new Promise((resolve, reject) => {
    const proc = spawn('docker', ['build', '-t', image, SCRAPER_DOCKERFILE_DIR], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => scraperLogger.info(`[docker:build] ${d.toString().trim()}`));
    proc.stderr.on('data', (d) => scraperLogger.info(`[docker:build] ${d.toString().trim()}`));
    proc.on('exit', (code) => {
      if (code === 0) {
        scraperLogger.info(`Docker image "${image}" built successfully`);
        resolve();
      } else {
        reject(new Error(`Failed to build Docker image "${image}" (exit code ${code})`));
      }
    });
    proc.on('error', (err) => reject(new Error(`Failed to start Docker build: ${err.message}`)));
  });
}

/**
 * Sanitizes a business type string for use as a filename component.
 * e.g. "rv park" -> "rv_park"
 * @param {string} businessType
 * @returns {string}
 */
function sanitizeForFilename(businessType) {
  return businessType.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * Runs the google-maps-scraper Docker container for a single business type.
 * Writes a temp keywords file, runs Docker, returns path to output CSV.
 * Throws if Docker exits with non-zero code.
 *
 * @param {string} businessType
 * @param {string[]} keywords  Plain search query strings (one per keyword)
 * @param {string} outputsDir  Absolute path to ./Outputs directory
 * @returns {Promise<string>}  Absolute path to the output CSV file
 */
async function executeDockerScraperForType(businessType, keywords, outputsDir) {
  const image = process.env.DOCKER_SCRAPER_IMAGE || 'google-maps-scraper';
  const depth = process.env.DOCKER_SCRAPER_DEPTH || '1';
  const concurrency = process.env.DOCKER_SCRAPER_CONCURRENCY || '3';
  const inactivity = process.env.DOCKER_SCRAPER_INACTIVITY || '10m';
  await ensureImageExists(image);

  const sanitized = sanitizeForFilename(businessType);

  const keywordsFile = path.join(outputsDir, `temp_keywords_${sanitized}.txt`);
  const outputCsvFile = path.join(outputsDir, `temp_${sanitized}.csv`);

  // Write keywords file (one keyword per line)
  await fs.writeFile(keywordsFile, keywords.join('\n'), 'utf8');
  scraperLogger.info(`Written ${keywords.length} keywords for "${businessType}" to ${keywordsFile}`);

  // Pre-create the output CSV so Docker can write to it without needing dir-create permission
  await fs.writeFile(outputCsvFile, '', 'utf8');

  // Use Windows-style absolute paths with forward slashes for Docker volume mounts
  const winToDockerPath = (p) => p.replace(/\\/g, '/');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${winToDockerPath(keywordsFile)}:/scraper_queries.txt`,
    '-v', `${winToDockerPath(outputCsvFile)}:/raw_results.csv`,
    image,
    '-input', '/scraper_queries.txt',
    '-results', '/raw_results.csv',
    '-depth', depth,
    '-c', concurrency,
    '-exit-on-inactivity', inactivity,
  ];

  scraperLogger.info(`Running Docker scraper for "${businessType}": docker ${dockerArgs.join(' ')}`);

  await new Promise((resolve, reject) => {
    const proc = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Drain stdout/stderr to prevent pipe buffer backpressure blocking process exit
    proc.stdout.on('data', (data) => {
      scraperLogger.info(`[docker:${sanitized}] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      scraperLogger.warn(`[docker:${sanitized}] ${data.toString().trim()}`);
    });

    // Use 'exit' not 'close' — exit fires when the process terminates regardless
    // of whether stdio pipes are fully drained. 'close' can hang indefinitely
    // when Docker produces large output that fills pipe buffers.
    proc.on('exit', (code) => {
      if (code === 0) {
        scraperLogger.info(`Docker scraper for "${businessType}" completed successfully`);
        resolve();
      } else {
        reject(new Error(`Docker scraper for "${businessType}" exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('Docker is not running or not installed. Please start Docker Desktop.'));
      } else {
        reject(new Error(`Failed to start Docker: ${err.message}`));
      }
    });
  });

  return outputCsvFile;
}

/**
 * Reads a CSV file produced by executeDockerScraperForType and maps rows
 * to pipeline format, injecting the businessType.
 *
 * @param {string} csvPath  Absolute path to the temp output CSV
 * @param {string} businessType
 * @returns {Promise<Object[]>}  Array of pipeline-format row objects
 */
async function readAndMapCsvFile(csvPath, businessType) {
  const rows = [];

  const fileExists = await fs.access(csvPath).then(() => true).catch(() => false);
  if (!fileExists) {
    scraperLogger.warn(`Output CSV not found for "${businessType}": ${csvPath}`);
    return rows;
  }

  return new Promise((resolve, reject) => {
    require('fs').createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        rows.push(mapRowToPipelineFormat(row, businessType));
      })
      .on('end', () => {
        scraperLogger.info(`Mapped ${rows.length} rows for "${businessType}"`);
        resolve(rows);
      })
      .on('error', (err) => {
        scraperLogger.error(`Error reading ${csvPath}: ${err.message}`);
        resolve([]); // partial failure — return empty, don't crash whole job
      });
  });
}

/**
 * Writes the final merged CSV to LeadsApart.csv.
 * @param {Object[]} allRows  All pipeline-format rows from all business types
 * @param {string} outputPath  Absolute path to LeadsApart.csv
 */
async function writeMergedCsv(allRows, outputPath) {
  const headers = [
    'Type of Business', 'Sub-Category', 'Name of Business', 'Website',
    '# of Reviews', 'Rating', 'Latest Review Date', 'Business Address', 'Phone Number',
  ];

  const lines = [headers.join(',')];

  for (const row of allRows) {
    const values = headers.map((h) => {
      const val = String(row[h] || '').replace(/"/g, '""');
      return `"${val}"`;
    });
    lines.push(values.join(','));
  }

  await fs.writeFile(outputPath, lines.join('\n'), 'utf8');
  scraperLogger.info(`Merged CSV written to ${outputPath} with ${allRows.length} rows`);
}

/**
 * Cleans up all temp_*.csv and temp_keywords_*.txt files in outputsDir.
 * @param {string} outputsDir
 */
async function cleanupTempFiles(outputsDir) {
  try {
    const files = await fs.readdir(outputsDir);
    const tempFiles = files.filter(
      (f) => (f.startsWith('temp_') && f.endsWith('.csv')) ||
              (f.startsWith('temp_keywords_') && f.endsWith('.txt'))
    );
    await Promise.all(tempFiles.map((f) => fs.unlink(path.join(outputsDir, f)).catch(() => {})));
    if (tempFiles.length > 0) {
      scraperLogger.info(`Cleaned up ${tempFiles.length} temp files from ${outputsDir}`);
    }
  } catch (err) {
    scraperLogger.warn(`Could not clean up temp files: ${err.message}`);
  }
}

module.exports = {
  groupQueriesByBusinessType,
  convertToRelativeDate,
  mapRowToPipelineFormat,
  executeDockerScraperForType,
  readAndMapCsvFile,
  writeMergedCsv,
  cleanupTempFiles,
};
