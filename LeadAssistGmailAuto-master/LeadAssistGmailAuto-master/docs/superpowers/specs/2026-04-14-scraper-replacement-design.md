# Scraper Replacement Design

**Date:** 2026-04-14  
**Status:** Approved  
**Scope:** Replace Python Selenium scraper (`maintemp.py`) with Go-based `google-maps-scraper` running via Docker

---

## Background

The current pipeline uses a Python Selenium scraper (`maintemp.py`) that:
- Reads `queries.txt` in format `"business type", "search query"`
- Outputs `./Outputs/LeadsApart.csv` with 9 columns
- Is called by `scraperProcessor.js` via `child_process.spawn()`

The new scraper (`gosom/google-maps-scraper`) is a Go binary distributed as a Docker image that:
- Takes a plain text file of keywords (one per line)
- Outputs a rich CSV with 34 columns including structured address, reviews, emails, lat/lon
- Is faster, more reliable, and actively maintained

---

## Goals

- Replace `maintemp.py` with the Docker-based Go scraper
- Preserve all existing downstream pipeline behavior unchanged (deduplication, filtering, database saving, Gmail delivery, Excel generation)
- Maintain `Type of Business` tracking per lead
- Preserve `Latest Review Date` in relative format ("X weeks ago") for existing filter logic

---

## Out of Scope

- Changes to database schema
- Changes to Gmail delivery workflow
- Changes to deduplication logic
- Changes to Excel/file generation
- Changes to any route handlers
- Fast mode (does not work reliably)

---

## Architecture

Only `scraperProcessor.js` changes. All other files remain untouched.

### Before
```
queries.txt (tuple format)
  → python.exe maintemp.py
  → ./Outputs/LeadsApart.csv (9 columns)
  → scraperProcessor.js reads CSV → saves to DB
```

### After
```
queries.txt (tuple format, unchanged)
  → scraperProcessor.js parses + groups by business type
  → per business type:
      write temp keywords file (one keyword per line)
      docker run gosom/google-maps-scraper → temp output CSV
      map 34-column output → 9-column pipeline format
      inject Type of Business
  → merge all temp CSVs → ./Outputs/LeadsApart.csv
  → rest of pipeline unchanged
```

---

## Detailed Design

### 1. Query File Format

`queries.txt` format is **unchanged**:
```
"rv park", "rv park near 90210 US"
"rv park", "rv park near 10001 US"
"nursing home", "nursing home near 90210 US"
"nursing home", "nursing home near 10001 US"
```

`scraperProcessor.js` already writes this file. No changes needed there.

### 2. Grouping by Business Type

Before calling Docker, Node.js parses `queries.txt` and groups lines by business type:

```js
// Result:
{
  "rv park": ["rv park near 90210 US", "rv park near 10001 US"],
  "nursing home": ["nursing home near 90210 US", "nursing home near 10001 US"]
}
```

### 3. Docker Execution (per business type)

For each business type group:

1. Write a temporary keywords file: `./Outputs/temp_keywords_{sanitized_type}.txt`
   - One keyword per line (plain text, no quotes or tuples)
2. Run Docker container:
```bash
docker run --rm \
  -v {absolutePathToKeywordsFile}:/app/input.txt \
  -v {absolutePathToOutputsDir}:/app/outputs \
  gosom/google-maps-scraper \
  -input /app/input.txt \
  -results /app/outputs/temp_{sanitized_type}.csv \
  -depth 1 \
  -c 4
```
3. Wait for container to exit (synchronous, same as current Python spawn)
4. Read `temp_{sanitized_type}.csv`

Runs are **sequential** (one business type at a time) to avoid resource contention.

### 4. Column Mapping

The new scraper outputs 34 CSV columns. We map to the 9 columns the pipeline expects:

| Pipeline column | New scraper column | Notes |
|---|---|---|
| `Type of Business` | _(injected)_ | From the business type key used for this run |
| `Sub-Category` | `category` | Direct mapping |
| `Name of Business` | `title` | Direct mapping |
| `Website` | `website` | Direct mapping |
| `# of Reviews` | `review_count` | Direct mapping |
| `Rating` | `review_rating` | Direct mapping |
| `Latest Review Date` | `user_reviews` | Parse JSON array, extract first review's `When`, convert to relative string |
| `Business Address` | `address` | Direct mapping |
| `Phone Number` | `phone` | Direct mapping |

### 5. Latest Review Date Conversion

The new scraper's `user_reviews` column is a JSON array of review objects. Each has a `When` field in `"YYYY-M-D"` format (e.g. `"2026-2-10"`).

Conversion logic:
1. Parse the `user_reviews` JSON string
2. If empty or parse fails → use `"No review date"`
3. Take `reviews[0].When` (first = most recent, Google returns newest-first)
4. Parse the date, compute days difference from today
5. Convert to relative string:
   - < 7 days → `"X days ago"`
   - < 30 days → `"X weeks ago"`
   - < 365 days → `"X months ago"`
   - >= 365 days → `"X years ago"`
6. If date parse fails → use `"No review date"`

This satisfies the existing filter: `REQUIRED_REVIEW_TEXT = "ago"`.

### 6. Output Merging

After all Docker runs complete:
1. Collect all `temp_{type}.csv` files from `./Outputs/`
2. Write merged CSV to `./Outputs/LeadsApart.csv` with headers:
   ```
   Type of Business, Sub-Category, Name of Business, Website,
   # of Reviews, Rating, Latest Review Date, Business Address, Phone Number
   ```
3. Delete all `temp_*.csv` and `temp_keywords_*.txt` files
4. Temp file cleanup also runs at the **start** of each scraper job (before Docker runs) to ensure no stale files from a previous crashed run affect results

### 7. Fallback / Error Handling

- If Docker is not running → throw error with clear message ("Docker is not running. Please start Docker Desktop.")
- If a single business type Docker run fails → log warning, continue with remaining types (partial results)
- If `user_reviews` JSON is malformed → fall back to `"No review date"` for that row
- If output CSV is empty after all runs → return 0 leads (same behavior as today)

---

## Configuration

New environment variables added to `config.env`:

| Variable | Default | Description |
|---|---|---|
| `DOCKER_SCRAPER_IMAGE` | `gosom/google-maps-scraper` | Docker image name/tag |
| `DOCKER_SCRAPER_DEPTH` | `1` | Max scrape depth per keyword |
| `DOCKER_SCRAPER_CONCURRENCY` | `4` | Concurrent browser tabs |

Existing variables that remain in use:
- `LEADS_APART_FILE` — output path for merged CSV
- `QUERIES_FILE` — input queries.txt path

---

## Files Changed

| File | Change |
|---|---|
| `src/queues/processors/scraperProcessor.js` | Replace `executePythonScraper()` with `executeDockerScraper()`, add `groupQueriesByBusinessType()`, add `mapNewScraperRowToPipelineFormat()`, add `convertToRelativeDate()`, add `mergeOutputCSVs()` |
| `config.env` | Add 3 new Docker config variables |

---

## Files Unchanged

- All route handlers
- Database setup and schema
- Gmail delivery service
- Google Sheets workflow service
- File generation service
- Lead optimization service
- All queue setup
- All other processors
