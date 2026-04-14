# Zip Code Fix Scripts

This directory contains scripts to fix incorrect zip codes in the database where the `zip_code` field contains street numbers instead of the actual zip codes from addresses.

## Problem Description

The database has leads with addresses like:
```
"11101 hawks street, OH,78978,United States"
```

Where the `zip_code` field incorrectly contains `11101` (the street number) instead of `78978` (the actual zip code from the address).

## Scripts Overview

### 1. `test_zip_extraction.js` - Test the Extraction Logic
**Purpose**: Tests the zip code extraction logic with various address formats  
**Safety**: 100% safe - no database interaction  

```bash
npm run test-zip-extraction
# OR
node test_zip_extraction.js
```

**What it does**:
- Tests the extraction function with 20+ different address formats
- Validates the logic handles edge cases correctly
- Shows success rate of extraction
- No database access - purely logic testing

### 2. `dry_run_zip_fix.js` - Analyze Without Changes
**Purpose**: Analyzes the first 50 leads to show what would be updated  
**Safety**: 100% safe - opens database in READ-ONLY mode  

```bash
npm run dry-run-zip-fix
# OR
node dry_run_zip_fix.js
```

**What it does**:
- Opens database in READ-ONLY mode (no changes possible)
- Analyzes first 50 leads with addresses
- Shows examples of what would be updated
- Provides statistics on potential changes
- Shows problematic addresses where zip codes can't be extracted

### 3. `fix_zip_codes.js` - Actual Database Update
**Purpose**: Updates the database with corrected zip codes  
**Safety**: ⚠️ MODIFIES DATABASE - BACKUP REQUIRED  

```bash
npm run fix-zip-codes
# OR
node fix_zip_codes.js
```

**What it does**:
- Processes ALL leads with addresses
- Extracts zip codes from the last 30 characters of addresses
- Updates the `zip_code` field where corrections are needed
- Provides detailed progress and statistics
- Shows examples of updates being made

## Recommended Workflow

### Step 1: Test the Logic
```bash
npm run test-zip-extraction
```
Verify the extraction logic works correctly with various address formats.

### Step 2: Analyze Impact
```bash
npm run dry-run-zip-fix
```
See examples of what would be updated and get statistics on the changes needed.

### Step 3: Backup Database
**CRITICAL**: Always backup your database before making changes!
```bash
cp data/leads.db data/leads_backup_$(date +%Y%m%d_%H%M%S).db
```

### Step 4: Run the Fix
```bash
npm run fix-zip-codes
```
Execute the actual database updates.

## How the Extraction Works

The script looks at the **last 30 characters** of each address and uses multiple regex patterns to find valid zip codes:

1. **Standard format**: `"City, State 12345, United States"`
2. **ZIP+4 format**: `"City, State 12345-6789, United States"`
3. **No spaces**: `"City,State,12345,United States"`
4. **State abbreviation**: `"City, ST, 12345"`
5. **Before "United States"**: `"12345, United States"`

### Validation Rules

The extracted zip code must:
- Be exactly 5 digits
- Not be `00000`, `11111`, or `99999` (invalid patterns)
- Pass format validation

### Examples

| Address | Current Zip | Extracted Zip | Action |
|---------|-------------|---------------|---------|
| `11101 hawks street, OH,78978,United States` | `11101` | `78978` | ✅ Update |
| `123 Main St, Phoenix, AZ 85001, United States` | `85001` | `85001` | ✔️ Already correct |
| `456 Oak Ave, Los Angeles, CA, 90210` | `90210` | `90210` | ✔️ Already correct |
| `789 Incomplete St, Somewhere` | `null` | `null` | ⚠️ No zip found |

## Safety Features

### Database Protection
- **Test script**: No database access
- **Dry run**: READ-ONLY database access
- **Update script**: Creates backup-friendly statistics and logs

### Progress Tracking
- Shows progress every 1000 leads
- Logs first 10 updates for verification
- Comprehensive statistics at completion

### Error Handling
- Continues processing if individual leads fail
- Tracks and reports errors
- Graceful handling of edge cases

## Output Statistics

After running the fix script, you'll see:

```
📈 FINAL STATISTICS:
═══════════════════════════════════════
📊 Total leads processed: 15,234
🏠 Leads with addresses: 14,891
🔍 Zip codes found in addresses: 13,456
✅ Zip codes updated: 1,234
☑️  Zip codes already correct: 12,222
❌ Zip codes not found: 1,435
⚠️  Errors encountered: 0
═══════════════════════════════════════
```

## Troubleshooting

### If extraction tests fail:
1. Review the test output to see which patterns failed
2. Check if your addresses have unusual formatting
3. Consider adding new regex patterns to handle your specific cases

### If dry run shows unexpected results:
1. Review the examples shown
2. Check if the extraction is working correctly for your data
3. Consider running on a larger sample by modifying the LIMIT in `dry_run_zip_fix.js`

### If the update script fails:
1. Check database permissions
2. Ensure the database isn't locked by other processes
3. Review error messages for specific issues
4. Restore from backup if needed

## Technical Details

### File Structure
```
zip-code-fix/
├── fix_zip_codes.js           # Main update script
├── test_zip_extraction.js     # Logic testing
├── dry_run_zip_fix.js        # Safe analysis
└── ZIP_CODE_FIX_README.md    # This documentation
```

### Dependencies
- `sqlite3`: Database access
- `path`: File path utilities

### Database Schema
Updates the `leads` table:
```sql
UPDATE leads SET zip_code = ? WHERE id = ?
```

## Support

If you encounter issues:
1. Check the console output for specific error messages
2. Verify your database isn't corrupted by running a simple query
3. Ensure you have sufficient disk space for the backup
4. Review the test results to ensure the extraction logic works for your data

---

**Remember**: Always backup your database before running the update script! 