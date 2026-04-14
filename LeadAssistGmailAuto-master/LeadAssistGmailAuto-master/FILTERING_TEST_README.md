# Filtering Test for GoogleSheetsWorkflowService

This test script validates the sub-category filtering logic used in the GoogleSheetsWorkflowService before file generation.

## 🎯 Purpose

The test verifies that:
- ✅ **Basic filters work**: phone numbers, US addresses, review counts, recent reviews
- ✅ **Sub-category filtering works**: Only allows appropriate subcategories for specific business types
- ✅ **Business types without filtering rules pass through**: Restaurants, etc.
- ✅ **Edge cases are handled properly**: Missing data, invalid formats

## 📁 Files

- `test_filtering.js` - Main test script with comprehensive test data
- `run_test.js` - Simple runner script
- `FILTERING_TEST_README.md` - This documentation

## 🚀 How to Run

### Option 1: Direct execution
```bash
node test_filtering.js
```

### Option 2: Using the runner
```bash
node run_test.js
```

### Option 3: With npm (if added to package.json)
```bash
npm run test:filtering
```

## 📊 Test Data

The test includes **16 test leads** covering these scenarios:

### ✅ **Should PASS filtering:**
- **Acme Manufacturing Corp** (factories → manufacturer) ✅
- **Miami Steel Works** (factories → steel fabricator) ✅  
- **Fitness First Gym** (gyms → gym) ✅
- **Miami Fitness Center** (gyms → fitness center) ✅
- **Sunny RV Resort** (rv parks → rv park) ✅
- **Oaks Campground** (rv parks → campground) ✅
- **Best Pizza Ever** (restaurants → no filtering rules) ✅
- **Fancy Steakhouse** (restaurants → no filtering rules) ✅

### ❌ **Should FAIL sub-category filtering:**
- **Joe's Pizza Palace** (factories → restaurant) ❌ Wrong subcategory
- **Office Depot Store** (factories → office supply store) ❌ Wrong subcategory
- **Tony's Pizza Gym** (gyms → restaurant) ❌ Wrong subcategory
- **RV Park Diner** (rv parks → restaurant) ❌ Wrong subcategory

### ❌ **Should FAIL basic filtering:**
- **No Phone Business** (no phone number) ❌
- **Few Reviews Corp** (< 4 reviews) ❌  
- **Old Reviews Inc** (no "ago" in latest review) ❌
- **Foreign Business** (not in United States) ❌

## 🔍 Expected Results

### **Summary:**
- **Input**: 16 leads
- **Expected to pass basic filters**: 12 leads
- **Expected to pass sub-category filters**: 8 leads
- **Final output**: 8 leads

### **Validation Checks:**
- ✅ All passing leads have phone numbers
- ✅ All passing leads have US addresses  
- ✅ All passing leads have 4+ reviews
- ✅ All restaurant leads pass (no filtering rules)

## 📋 Business Types Tested

The test uses these business types:
- **Warehouses** 🏭 (has filtering rules)
- **Factories** 🏭 (has filtering rules)
- **Gyms** 💪 (has filtering rules)  
- **RV Parks** 🏕️ (has filtering rules)
- **Restaurants** 🍕 (no filtering rules)
- **Mobile Home Parks** 🏘️ (has filtering rules)

## 🔧 Debugging

The test provides detailed logging showing:
- Which business types have filtering rules
- Which leads get filtered and why
- Counts and breakdowns at each step
- Validation of results

Look for these log patterns:
- `📋 REQUESTED BUSINESS TYPES` - What was requested
- `🔍 BUSINESS TYPES WITH SUBCATEGORY FILTERING` - Which have rules
- `🚫 FILTERED OUT` - Individual leads being filtered
- `📊 FILTERING RESULTS` - Summary of results

## 🛠️ Customizing the Test

### Adding New Test Cases:
Edit `testLeads` array in `test_filtering.js`:

```javascript
const testLeads = [
  // Add your test case here
  {
    name_of_business: "Your Business Name",
    type_of_business: "your_type",
    sub_category: "your_subcategory", 
    phone_number: "555-0000",
    business_address: "Address, City, State, United States",
    num_reviews: "10",
    latest_review: "1 week ago",
    rating: "4.0"
  },
  // ... existing test cases
];
```

### Testing Different Business Types:
Edit `testBusinessTypes` array in `test_filtering.js`:

```javascript
const testBusinessTypes = [
  "Your Business Type",
  // ... existing types
];
```

## 📝 Notes

- The test uses the **same filtering logic** as the production system
- Test data is designed to cover **edge cases** and **common scenarios**
- The test is **read-only** - it doesn't modify any database or files
- Results should be **consistent** across runs

## 🐛 Troubleshooting

### "Cannot find module" error:
- Make sure you're running from the project root directory
- Check that `src/services/googleSheetsWorkflowService.js` exists

### Import/Export errors:
- The service is exported as an instance, not a class
- Test script accounts for this automatically

### Unexpected results:
- Check the filtering rules in `SUB_CATEGORY_FILTERS`
- Verify test data matches expected format
- Review debug logging for detailed filtering decisions 