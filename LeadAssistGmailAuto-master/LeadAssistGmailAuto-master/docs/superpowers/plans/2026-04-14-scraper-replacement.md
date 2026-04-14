# Scraper Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python Selenium scraper (`maintemp.py`) with the `gosom/google-maps-scraper` Docker image in `scraperProcessor.js`, preserving all downstream pipeline behavior.

**Architecture:** Node.js parses `queries.txt`, groups queries by business type, runs the Docker scraper once per business type, maps the rich 34-column CSV output to the 9-column format the pipeline expects, merges all outputs into `LeadsApart.csv`, then the rest of the pipeline continues unchanged.

**Tech Stack:** Node.js, Docker (gosom/google-maps-scraper image), csv-parser (already installed), ExcelJS (already installed), child_process.spawn

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/queues/processors/scraperProcessor.js` | Modify | Replace `executePythonScraper()` with Docker-based scraper, add helper functions |
| `src/queues/processors/dockerScraper.js` | Create | All Docker execution logic isolated here — keeps scraperProcessor.js readable |
| `config.env` | Modify | Add 3 new Docker config env vars |

Splitting Docker logic into its own file keeps `scraperProcessor.js` from growing further and makes the new code independently testable.

---

## Task 1: Add Docker config variables

**Files:**
- Modify: `config.env`

- [ ] **Step 1: Add the three new env vars to config.env**

Open `config.env` and add the following block after the `# Scraper Configuration` section:

```env
# Docker Scraper Configuration
DOCKER_SCRAPER_IMAGE=gosom/google-maps-scraper
DOCKER_SCRAPER_DEPTH=1
DOCKER_SCRAPER_CONCURRENCY=4
```

- [ ] **Step 2: Verify the file looks correct**

Run:
```bash
grep DOCKER_SCRAPER config.env
```
Expected output:
```
DOCKER_SCRAPER_IMAGE=gosom/google-maps-scraper
DOCKER_SCRAPER_DEPTH=1
DOCKER_SCRAPER_CONCURRENCY=4
```

- [ ] **Step 3: Commit**

```bash
git add config.env
git commit -m "config: add Docker scraper env vars"
```

---

## Task 2: Create dockerScraper.js — query grouping and keyword file writing

**Files:**
- Create: `src/queues/processors/dockerScraper.js`

This file will hold all Docker-related logic. We build it function by function across Tasks 2–5.

- [ ] **Step 1: Write failing test for `groupQueriesByBusinessType`**

Create `src/queues/processors/dockerScraper.test.js`:

```js
const { groupQueriesByBusinessType } = require('./dockerScraper');

describe('groupQueriesByBusinessType', () => {
  test('groups single business type correctly', () => {
    const queries = [
      { businessType: 'rv park', query: 'rv park near 90210 US' },
      { businessType: 'rv park', query: 'rv park near 10001 US' },
    ];
    const result = groupQueriesByBusinessType(queries);
    expect(result).toEqual({
      'rv park': ['rv park near 90210 US', 'rv park near 10001 US'],
    });
  });

  test('groups multiple business types correctly', () => {
    const queries = [
      { businessType: 'rv park', query: 'rv park near 90210 US' },
      { businessType: 'nursing home', query: 'nursing home near 90210 US' },
      { businessType: 'rv park', query: 'rv park near 10001 US' },
    ];
    const result = groupQueriesByBusinessType(queries);
    expect(result).toEqual({
      'rv park': ['rv park near 90210 US', 'rv park near 10001 US'],
      'nursing home': ['nursing home near 90210 US'],
    });
  });

  test('returns empty object for empty input', () => {
    expect(groupQueriesByBusinessType([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | head -20
```
Expected: `Cannot find module './dockerScraper'`

- [ ] **Step 3: Create dockerScraper.js with groupQueriesByBusinessType**

Create `src/queues/processors/dockerScraper.js`:

```js
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

module.exports = { groupQueriesByBusinessType };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/queues/processors/dockerScraper.js src/queues/processors/dockerScraper.test.js
git commit -m "feat: add groupQueriesByBusinessType to dockerScraper"
```

---

## Task 3: Add convertToRelativeDate helper

**Files:**
- Modify: `src/queues/processors/dockerScraper.js`
- Modify: `src/queues/processors/dockerScraper.test.js`

- [ ] **Step 1: Add failing tests for `convertToRelativeDate`**

Append to `dockerScraper.test.js`:

```js
const { convertToRelativeDate } = require('./dockerScraper');

describe('convertToRelativeDate', () => {
  test('returns relative string for a date 3 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('3 days ago');
  });

  test('returns relative string for a date 2 weeks ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('2 weeks ago');
  });

  test('returns relative string for a date 3 months ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('3 months ago');
  });

  test('returns relative string for a date 2 years ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 730);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('2 years ago');
  });

  test('returns No review date for empty string', () => {
    expect(convertToRelativeDate('')).toBe('No review date');
  });

  test('returns No review date for null', () => {
    expect(convertToRelativeDate(null)).toBe('No review date');
  });

  test('returns No review date for invalid date string', () => {
    expect(convertToRelativeDate('not-a-date')).toBe('No review date');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | grep -E "FAIL|convertToRelativeDate"
```
Expected: `convertToRelativeDate is not a function`

- [ ] **Step 3: Implement convertToRelativeDate in dockerScraper.js**

Add this function before `module.exports` in `dockerScraper.js`:

```js
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
```

Update `module.exports`:
```js
module.exports = { groupQueriesByBusinessType, convertToRelativeDate };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 10 passed`

- [ ] **Step 5: Commit**

```bash
git add src/queues/processors/dockerScraper.js src/queues/processors/dockerScraper.test.js
git commit -m "feat: add convertToRelativeDate to dockerScraper"
```

---

## Task 4: Add mapRowToPipelineFormat helper

**Files:**
- Modify: `src/queues/processors/dockerScraper.js`
- Modify: `src/queues/processors/dockerScraper.test.js`

The new scraper CSV uses these column names (from `gmaps/entry.go` `CsvHeaders()`):
`input_id, link, title, category, address, open_hours, popular_times, website, phone, plus_code, review_count, review_rating, reviews_per_rating, latitude, longitude, cid, status, descriptions, reviews_link, thumbnail, timezone, price_range, data_id, place_id, images, reservations, order_online, menu, owner, complete_address, about, user_reviews, user_reviews_extended, emails`

- [ ] **Step 1: Add failing tests for `mapRowToPipelineFormat`**

Append to `dockerScraper.test.js`:

```js
const { mapRowToPipelineFormat } = require('./dockerScraper');

describe('mapRowToPipelineFormat', () => {
  const baseRow = {
    title: 'Sunset RV Park',
    category: 'RV park',
    address: '123 Main St, Los Angeles, CA 90210, United States',
    website: 'sunsetrv.com',
    review_count: '42',
    review_rating: '4.5',
    phone: '+1 310-555-0100',
    user_reviews: JSON.stringify([{ Name: 'John', When: '2026-1-10', Rating: 5 }]),
  };

  test('maps all fields correctly', () => {
    const result = mapRowToPipelineFormat(baseRow, 'rv park');
    expect(result['Type of Business']).toBe('rv park');
    expect(result['Sub-Category']).toBe('RV park');
    expect(result['Name of Business']).toBe('Sunset RV Park');
    expect(result['Website']).toBe('sunsetrv.com');
    expect(result['# of Reviews']).toBe('42');
    expect(result['Rating']).toBe('4.5');
    expect(result['Business Address']).toBe('123 Main St, Los Angeles, CA 90210, United States');
    expect(result['Phone Number']).toBe('+1 310-555-0100');
    expect(result['Latest Review Date']).toMatch(/ago$/);
  });

  test('returns No review date when user_reviews is empty array', () => {
    const row = { ...baseRow, user_reviews: '[]' };
    const result = mapRowToPipelineFormat(row, 'rv park');
    expect(result['Latest Review Date']).toBe('No review date');
  });

  test('returns No review date when user_reviews is malformed JSON', () => {
    const row = { ...baseRow, user_reviews: 'not-json' };
    const result = mapRowToPipelineFormat(row, 'rv park');
    expect(result['Latest Review Date']).toBe('No review date');
  });

  test('returns No review date when user_reviews is missing', () => {
    const row = { ...baseRow, user_reviews: undefined };
    const result = mapRowToPipelineFormat(row, 'rv park');
    expect(result['Latest Review Date']).toBe('No review date');
  });

  test('uses empty string for missing optional fields', () => {
    const row = { title: 'Test', category: 'Test', address: 'Test', user_reviews: '[]' };
    const result = mapRowToPipelineFormat(row, 'gym');
    expect(result['Website']).toBe('');
    expect(result['Phone Number']).toBe('');
    expect(result['# of Reviews']).toBe('');
    expect(result['Rating']).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | grep "mapRowToPipelineFormat"
```
Expected: `mapRowToPipelineFormat is not a function`

- [ ] **Step 3: Implement mapRowToPipelineFormat in dockerScraper.js**

Add this function before `module.exports` in `dockerScraper.js`:

```js
/**
 * Maps a single row from the new scraper's 34-column CSV to the
 * 9-column format expected by the rest of the pipeline.
 * @param {Object} row  CSV row parsed by csv-parser
 * @param {string} businessType  The business type used for this scraper run
 * @returns {Object} Row in pipeline format
 */
function mapRowToPipelineFormat(row, businessType) {
  let latestReviewDate = 'No review date';

  try {
    const reviews = JSON.parse(row.user_reviews || '[]');
    if (Array.isArray(reviews) && reviews.length > 0 && reviews[0].When) {
      latestReviewDate = convertToRelativeDate(reviews[0].When);
    }
  } catch (_) {
    // malformed JSON — leave as 'No review date'
  }

  return {
    'Type of Business': businessType,
    'Sub-Category': row.category || '',
    'Name of Business': row.title || '',
    'Website': row.website || '',
    '# of Reviews': row.review_count || '',
    'Rating': row.review_rating || '',
    'Latest Review Date': latestReviewDate,
    'Business Address': row.address || '',
    'Phone Number': row.phone || '',
  };
}
```

Update `module.exports`:
```js
module.exports = { groupQueriesByBusinessType, convertToRelativeDate, mapRowToPipelineFormat };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 14 passed`

- [ ] **Step 5: Commit**

```bash
git add src/queues/processors/dockerScraper.js src/queues/processors/dockerScraper.test.js
git commit -m "feat: add mapRowToPipelineFormat to dockerScraper"
```

---

## Task 5: Add executeDockerScraperForType and mergeOutputCSVs

**Files:**
- Modify: `src/queues/processors/dockerScraper.js`

These functions handle Docker execution and CSV merging. They use I/O and spawn so we don't unit test them — they'll be validated by end-to-end testing in Task 7.

- [ ] **Step 1: Add executeDockerScraperForType to dockerScraper.js**

Add the following before `module.exports` in `dockerScraper.js`:

```js
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
  const image = process.env.DOCKER_SCRAPER_IMAGE || 'gosom/google-maps-scraper';
  const depth = process.env.DOCKER_SCRAPER_DEPTH || '1';
  const concurrency = process.env.DOCKER_SCRAPER_CONCURRENCY || '4';
  const sanitized = sanitizeForFilename(businessType);

  const keywordsFile = path.join(outputsDir, `temp_keywords_${sanitized}.txt`);
  const outputCsvFile = path.join(outputsDir, `temp_${sanitized}.csv`);
  const containerKeywordsPath = '/app/input.txt';
  const containerOutputPath = `/app/outputs/temp_${sanitized}.csv`;

  // Write keywords file (one keyword per line)
  await fs.writeFile(keywordsFile, keywords.join('\n'), 'utf8');
  scraperLogger.info(`Written ${keywords.length} keywords for "${businessType}" to ${keywordsFile}`);

  // Build Docker args
  // Use Windows-style absolute paths with forward slashes for Docker volume mounts
  const winToDockerPath = (p) => p.replace(/\\/g, '/');

  const dockerArgs = [
    'run', '--rm',
    '-v', `${winToDockerPath(keywordsFile)}:${containerKeywordsPath}`,
    '-v', `${winToDockerPath(outputsDir)}:/app/outputs`,
    image,
    '-input', containerKeywordsPath,
    '-results', containerOutputPath,
    '-depth', depth,
    '-c', concurrency,
  ];

  scraperLogger.info(`Running Docker scraper for "${businessType}": docker ${dockerArgs.join(' ')}`);

  await new Promise((resolve, reject) => {
    const proc = spawn('docker', dockerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data) => {
      scraperLogger.info(`[docker:${sanitized}] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      scraperLogger.warn(`[docker:${sanitized}] ${data.toString().trim()}`);
    });

    proc.on('close', (code) => {
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
```

Update `module.exports`:
```js
module.exports = {
  groupQueriesByBusinessType,
  convertToRelativeDate,
  mapRowToPipelineFormat,
  executeDockerScraperForType,
  readAndMapCsvFile,
  writeMergedCsv,
  cleanupTempFiles,
};
```

- [ ] **Step 2: Run existing tests to make sure nothing broke**

```bash
cd src/queues/processors && npx jest dockerScraper.test.js --no-coverage 2>&1 | tail -10
```
Expected: `Tests: 14 passed`

- [ ] **Step 3: Commit**

```bash
git add src/queues/processors/dockerScraper.js
git commit -m "feat: add Docker execution and CSV merge functions to dockerScraper"
```

---

## Task 6: Replace executePythonScraper in scraperProcessor.js

**Files:**
- Modify: `src/queues/processors/scraperProcessor.js`

This task wires everything together. We replace the `executePythonScraper()` call with a new `executeDockerScraper()` function that uses the helpers from `dockerScraper.js`.

- [ ] **Step 1: Add the import for dockerScraper at the top of scraperProcessor.js**

Find the existing imports block at the top of `scraperProcessor.js` (around line 1-10) and add:

```js
const {
  groupQueriesByBusinessType,
  executeDockerScraperForType,
  readAndMapCsvFile,
  writeMergedCsv,
  cleanupTempFiles,
} = require('./dockerScraper');
```

- [ ] **Step 2: Add the executeDockerScraper function**

Add the following new function directly after the existing `executePythonScraper` function (around line 475 in the original file). Do NOT delete `executePythonScraper` yet — we keep it commented out as fallback reference until end-to-end testing passes (Task 7):

```js
/**
 * Replaces executePythonScraper. Runs the gosom/google-maps-scraper Docker
 * image once per business type, maps results to pipeline CSV format,
 * and writes the merged output to LeadsApart.csv.
 *
 * @param {Object} job  Bull job object
 * @param {Array<{businessType: string, query: string}>} optimizedQueries
 */
async function executeDockerScraper(job, optimizedQueries) {
  let outputsDir;
  if (process.env.LEADS_APART_FILE) {
    outputsDir = path.dirname(path.join(process.cwd(), process.env.LEADS_APART_FILE));
  } else {
    outputsDir = path.join(process.cwd(), './Outputs');
  }

  // Ensure outputs directory exists
  await fs.mkdir(outputsDir, { recursive: true });

  // Clean up any stale temp files from a previous crashed run
  await cleanupTempFiles(outputsDir);

  const groups = groupQueriesByBusinessType(optimizedQueries);
  const businessTypes = Object.keys(groups);

  scraperLogger.info(`Running Docker scraper for ${businessTypes.length} business type(s): ${businessTypes.join(', ')}`);

  const allRows = [];

  for (let i = 0; i < businessTypes.length; i++) {
    const businessType = businessTypes[i];
    const keywords = groups[businessType];

    try {
      const csvPath = await executeDockerScraperForType(businessType, keywords, outputsDir);
      const rows = await readAndMapCsvFile(csvPath, businessType);
      allRows.push(...rows);
      scraperLogger.info(`"${businessType}": ${rows.length} results`);
    } catch (err) {
      scraperLogger.error(`Docker scraper failed for "${businessType}": ${err.message}`);
      // Continue with remaining business types — partial results are better than none
    }

    // Update progress proportionally across the 20-70% range used by the scraper step
    if (job.progress) {
      const progressPct = 20 + Math.floor(((i + 1) / businessTypes.length) * 50);
      job.progress(progressPct);
    }
  }

  // Write merged CSV to LeadsApart.csv
  let csvFile;
  if (process.env.LEADS_APART_FILE) {
    csvFile = path.join(process.cwd(), process.env.LEADS_APART_FILE);
  } else {
    csvFile = path.join(process.cwd(), './Outputs/LeadsApart.csv');
  }

  await writeMergedCsv(allRows, csvFile);

  // Clean up temp files
  await cleanupTempFiles(outputsDir);

  scraperLogger.info(`Docker scraper complete. Total rows written: ${allRows.length}`);

  return { stdout: '', stderr: '', exitCode: 0 };
}
```

- [ ] **Step 3: Replace the call to executePythonScraper with executeDockerScraper**

Find this line in `scraperProcessor.js` (around line 278):
```js
const scraperResult = await executePythonScraper(job);
```

Replace with:
```js
const scraperResult = await executeDockerScraper(job, optimizedQueries);
```

- [ ] **Step 4: Verify the file parses without errors**

```bash
node -e "require('./src/queues/processors/scraperProcessor.js')" 2>&1
```
Expected: No output (or only the usual "Database functions not available" warning — that's fine).

- [ ] **Step 5: Commit**

```bash
git add src/queues/processors/scraperProcessor.js
git commit -m "feat: replace Python scraper with Docker scraper in scraperProcessor"
```

---

## Task 7: End-to-end test

**Files:** No code changes — this is a manual verification step.

- [ ] **Step 1: Make sure Docker Desktop is running**

```bash
docker info 2>&1 | head -5
```
Expected: Shows Docker server info without errors.

- [ ] **Step 2: Make sure the scraper image is pulled**

```bash
docker images gosom/google-maps-scraper
```
If not shown, pull it:
```bash
docker pull gosom/google-maps-scraper
```

- [ ] **Step 3: Start the Node.js pipeline**

```bash
cd LeadAssistGmailAuto-master
node src/server.js
```

- [ ] **Step 4: Submit a small test scraping job via the API**

In a new terminal:
```bash
curl -X POST http://localhost:3000/api/scraper/start \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "test",
    "businessTypes": ["gym"],
    "zipCodes": ["90210"],
    "priority": 0
  }'
```
Expected: `{"success":true,"jobId":"...","queriesGenerated":1,...}`

- [ ] **Step 5: Watch the logs and verify the Docker run**

In the server terminal, you should see:
```
Running Docker scraper for 1 business type(s): gym
Written 1 keywords for "gym" to .../Outputs/temp_keywords_gym.txt
Running Docker scraper for "gym": docker run --rm ...
[docker:gym] ... (scraper output)
Docker scraper for "gym" completed successfully
Mapped N rows for "gym"
Merged CSV written to .../Outputs/LeadsApart.csv with N rows
```

- [ ] **Step 6: Verify LeadsApart.csv has correct columns**

```bash
head -2 Outputs/LeadsApart.csv
```
Expected first line:
```
Type of Business,Sub-Category,Name of Business,Website,# of Reviews,Rating,Latest Review Date,Business Address,Phone Number
```
Expected second line: a row with `gym` as the first field, review date ending in `ago`.

- [ ] **Step 7: Verify leads reach the database**

```bash
node -e "
const db = require('./src/database/setup');
db.setupDatabase().then(async () => {
  const { getAll } = require('./src/database/setup');
  const leads = await getAll('SELECT name_of_business, type_of_business, latest_review FROM leads ORDER BY scraped_at DESC LIMIT 5', []);
  console.log(JSON.stringify(leads, null, 2));
  process.exit(0);
});
"
```
Expected: Array of 5 leads with `latest_review` values ending in `ago`.

- [ ] **Step 8: Commit test confirmation note**

```bash
git commit --allow-empty -m "test: end-to-end Docker scraper verified working"
```

---

## Task 8: Remove old Python scraper call (cleanup)

**Files:**
- Modify: `src/queues/processors/scraperProcessor.js`
- Modify: `config.env`

Only do this after Task 7 passes completely.

- [ ] **Step 1: Remove or comment out executePythonScraper from scraperProcessor.js**

Find the `executePythonScraper` function (starts around line 403) and delete it entirely. It is no longer called.

- [ ] **Step 2: Remove Python interpreter env vars from config.env**

In `config.env`, remove or comment out:
```env
PYTHON_INTERPRETER=python
SCRAPER_SCRIPT_PATH=./maintemp.py
```
(Leave `FORMATTER_SCRIPT_PATH` and `FINDLEADS_SCRIPT_PATH` — those are used by other processors.)

- [ ] **Step 3: Verify the file still parses without errors**

```bash
node -e "require('./src/queues/processors/scraperProcessor.js')" 2>&1
```
Expected: No errors.

- [ ] **Step 4: Run all unit tests to make sure nothing broke**

```bash
npx jest --no-coverage 2>&1 | tail -15
```
Expected: All previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/queues/processors/scraperProcessor.js config.env
git commit -m "chore: remove Python scraper, clean up unused env vars"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Replace `executePythonScraper()` with Docker | Task 6 |
| Group queries by business type | Task 2 |
| Run Docker once per business type | Task 5, 6 |
| Map 34-column CSV to 9-column pipeline format | Task 4 |
| Inject `Type of Business` from query | Task 4 |
| Convert `user_reviews[0].When` to relative date | Task 3 |
| Merge all temp CSVs into `LeadsApart.csv` | Task 5 |
| Clean up temp files at start and end of job | Task 5, 6 |
| Error handling: Docker not running | Task 5 |
| Error handling: single business type failure continues | Task 6 |
| Add 3 Docker env vars to config.env | Task 1 |
| Remove Python env vars | Task 8 |
| End-to-end validation | Task 7 |

All spec requirements covered.
