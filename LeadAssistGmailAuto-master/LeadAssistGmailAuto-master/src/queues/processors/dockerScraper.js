'use strict';

const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { scraperLogger } = require('../../utils/logger');

const SCRAPER_DOCKERFILE_DIR = 'C:/Users/safee/Desktop/WORk/gmap_scrpaaer_gosom/google-maps-scraper';

const PIPELINE_HEADERS = [
  'Type of Business', 'Sub-Category', 'Name of Business', 'Website',
  '# of Reviews', 'Rating', 'Latest Review Date', 'Business Address', 'Phone Number',
];

function groupQueriesByBusinessType(queries) {
  const groups = {};
  for (const q of queries) {
    if (!groups[q.businessType]) groups[q.businessType] = [];
    const scraperLine = q.query.trim() + ' USA';
    groups[q.businessType].push(scraperLine);
  }
  return groups;
}

function get(row, key) {
  return row[key] || '';
}

async function ensureImageExists(image) {
  const check = await new Promise((resolve) => {
    const proc = spawn('docker', ['images', '-q', image], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('exit', () => resolve(out.trim()));
  });

  if (check) return;

  scraperLogger.info(`Docker image "${image}" not found — building from ${SCRAPER_DOCKERFILE_DIR}`);

  await new Promise((resolve, reject) => {
    const proc = spawn('docker', ['build', '-t', image, SCRAPER_DOCKERFILE_DIR], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.stdout.on('data', (d) => scraperLogger.info(`[docker:build] ${d.toString().trim()}`));
    proc.stderr.on('data', (d) => scraperLogger.info(`[docker:build] ${d.toString().trim()}`));
    proc.on('exit', (code) => {
      if (code === 0) { scraperLogger.info(`Docker image "${image}" built successfully`); resolve(); }
      else reject(new Error(`Failed to build Docker image "${image}" (exit code ${code})`));
    });
    proc.on('error', (err) => reject(new Error(`Failed to start Docker build: ${err.message}`)));
  });
}

// Truncate raw_results.csv to empty (matching reset_raw() in run_scraper.py)
async function resetRaw(rawResultsFile) {
  await fs.writeFile(rawResultsFile, '', 'utf8');
}

// Run docker for one batch — exactly mirrors run_docker() in run_scraper.py
async function runDocker(image, scraperQueriesFile, rawResultsFile, depth, concurrency, inactivity) {
  const winToDockerPath = (p) => p.replace(/\\/g, '/');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${winToDockerPath(scraperQueriesFile)}:/scraper_queries.txt`,
    '-v', `${winToDockerPath(rawResultsFile)}:/raw_results.csv`,
    image,
    '-input', '/scraper_queries.txt',
    '-results', '/raw_results.csv',
    '-depth', depth,
    '-c', concurrency,
    '-exit-on-inactivity', inactivity,
  ];

  scraperLogger.info(`Running: docker ${dockerArgs.join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    const timeoutId = setTimeout(() => {
      proc.kill();
      scraperLogger.warn('Docker process timed out after 2 hours');
      resolve(-1); // Return error code instead of reject, to skip batch and continue
    }, 7200 * 1000);

    proc.stdout.on('data', (d) => scraperLogger.info(`[docker] ${d.toString().trim()}`));
    proc.stderr.on('data', (d) => scraperLogger.warn(`[docker] ${d.toString().trim()}`));

    proc.on('exit', (code) => {
      clearTimeout(timeoutId);
      resolve(code);
    });
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      if (err.code === 'ENOENT') reject(new Error('Docker is not running or not installed. Please start Docker Desktop.'));
      else reject(new Error(`Failed to start Docker: ${err.message}`));
    });
  });
}

// Append rows from raw_results.csv into the open LeadsApart.csv write stream
// Mirrors append_results() in run_scraper.py
function appendResults(businessType, rawResultsFile, writeStream) {
  return new Promise((resolve, reject) => {
    let count = 0;

    fsSync.createReadStream(rawResultsFile, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (row) => {
        const fields = {
          'Type of Business':   businessType,
          'Sub-Category':       get(row, 'category'),
          'Name of Business':   get(row, 'title'),
          'Website':            get(row, 'website'),
          '# of Reviews':       get(row, 'review_count'),
          'Rating':             get(row, 'review_rating'),
          'Latest Review Date': get(row, 'latest_review_date'),
          'Business Address':   get(row, 'address'),
          'Phone Number':       get(row, 'phone'),
        };
        // QUOTE_MINIMAL: only quote if value contains comma, quote, or newline
        const values = PIPELINE_HEADERS.map((h) => {
          const val = String(fields[h]);
          return /[,"\n\r]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val;
        });
        writeStream.write(values.join(',') + '\n');
        count++;
      })
      .on('end', () => resolve(count))
      .on('error', (err) => {
        scraperLogger.error(`Error reading ${rawResultsFile}: ${err.message}`);
        resolve(0);
      });
  });
}

// Main orchestrator — mirrors the top-level logic of run_scraper.py exactly
async function executeDockerScraper(job, optimizedQueries) {
  const image = process.env.DOCKER_SCRAPER_IMAGE || 'google-maps-scraper';
  const depth = process.env.DOCKER_SCRAPER_DEPTH || '1';
  const concurrency = process.env.DOCKER_SCRAPER_CONCURRENCY || '3';
  const inactivity = process.env.DOCKER_SCRAPER_INACTIVITY || '10m';

  await ensureImageExists(image);

  const outputsDir = process.env.LEADS_APART_FILE
    ? path.dirname(path.join(process.cwd(), process.env.LEADS_APART_FILE))
    : path.join(process.cwd(), './Outputs');

  await fs.mkdir(outputsDir, { recursive: true });

  // Fixed filenames — same as run_scraper.py's SCRAPER_QUERIES and RAW_RESULTS
  const scraperQueriesFile = path.join(outputsDir, 'scraper_queries.txt');
  const rawResultsFile = path.join(outputsDir, 'raw_results.csv');

  const finalOutput = process.env.LEADS_APART_FILE
    ? path.join(process.cwd(), process.env.LEADS_APART_FILE)
    : path.join(process.cwd(), './Outputs/LeadsApart.csv');

  // Group queries by business type — same as batches = OrderedDict() in run_scraper.py
  const groups = groupQueriesByBusinessType(optimizedQueries);
  const businessTypes = Object.keys(groups);

  scraperLogger.info(`${businessTypes.length} business types, ${optimizedQueries.length} total queries`);

  // Open LeadsApart.csv for writing and write header immediately — same as run_scraper.py
  const writeStream = fsSync.createWriteStream(finalOutput, { encoding: 'utf8' });
  writeStream.write(PIPELINE_HEADERS.join(',') + '\n');

  let totalCount = 0;

  for (let i = 0; i < businessTypes.length; i++) {
    const businessType = businessTypes[i];
    const queries = groups[businessType];

    try {
      scraperLogger.info(`[${i + 1}/${businessTypes.length}] Business type: '${businessType}' (${queries.length} queries)`);

      // Write keywords file — same as writing SCRAPER_QUERIES in run_scraper.py
      await fs.writeFile(scraperQueriesFile, queries.join('\n') + '\n', 'utf8');

      // Reset raw results — same as reset_raw() in run_scraper.py
      await resetRaw(rawResultsFile);

      const code = await runDocker(image, scraperQueriesFile, rawResultsFile, depth, concurrency, inactivity);
      scraperLogger.info(`Docker exit code: ${code}`);

      if (code !== 0) {
        scraperLogger.warn(`WARNING: Docker exited with code ${code}, skipping batch.`);
        continue;
      }

      // Append results directly to LeadsApart.csv — same as append_results() + fout.flush() in run_scraper.py
      const count = await appendResults(businessType, rawResultsFile, writeStream);
      totalCount += count;
      scraperLogger.info(`${count} businesses written for '${businessType}'`);
      scraperLogger.info(`Moving to next batch...`);

    } catch (err) {
      scraperLogger.error(`ERROR in batch '${businessType}': ${err.message}`);
      continue;
    }

    if (job.progress) {
      job.progress(20 + Math.floor(((i + 1) / businessTypes.length) * 50));
    }
  }

  await new Promise((resolve, reject) => {
    writeStream.end((err) => err ? reject(err) : resolve());
  });

  scraperLogger.info(`Done. Results saved to ${finalOutput} (${totalCount} total rows)`);

  return { stdout: '', stderr: '', exitCode: 0 };
}

module.exports = {
  groupQueriesByBusinessType,
  executeDockerScraper,
};
