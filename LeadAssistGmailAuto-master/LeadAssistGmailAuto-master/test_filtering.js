const GoogleSheetsWorkflowService = require('./src/services/googleSheetsWorkflowService');

// Test data - mix of leads that should pass and fail filtering
const testLeads = [
  // FACTORIES - Should be filtered based on subcategory
  {
    name_of_business: "Acme Manufacturing Corp",
    type_of_business: "factories", 
    sub_category: "manufacturer",
    phone_number: "555-0001",
    business_address: "123 Factory St, Miami, FL, United States",
    num_reviews: "10",
    latest_review: "2 weeks ago",
    rating: "4.5"
  },
  {
    name_of_business: "Miami Steel Works",
    type_of_business: "factories",
    sub_category: "steel fabricator", 
    phone_number: "555-0002",
    business_address: "456 Industrial Ave, Miami, FL, United States",
    num_reviews: "25",
    latest_review: "1 month ago",
    rating: "4.2"
  },
  {
    name_of_business: "Joe's Pizza Palace", // Should be FILTERED OUT
    type_of_business: "factories",
    sub_category: "restaurant",
    phone_number: "555-0003", 
    business_address: "789 Food St, Miami, FL, United States",
    num_reviews: "50",
    latest_review: "3 days ago",
    rating: "4.8"
  },
  {
    name_of_business: "Office Depot Store", // Should be FILTERED OUT
    type_of_business: "factories",
    sub_category: "office supply store",
    phone_number: "555-0004",
    business_address: "321 Retail Blvd, Miami, FL, United States", 
    num_reviews: "100",
    latest_review: "1 week ago",
    rating: "4.0"
  },

  // GYMS - Should be filtered based on subcategory
  {
    name_of_business: "Fitness First Gym",
    type_of_business: "gyms",
    sub_category: "gym",
    phone_number: "555-0005",
    business_address: "555 Fitness Way, Miami, FL, United States",
    num_reviews: "75",
    latest_review: "5 days ago", 
    rating: "4.3"
  },
  {
    name_of_business: "Miami Fitness Center",
    type_of_business: "gyms", 
    sub_category: "fitness center",
    phone_number: "555-0006",
    business_address: "666 Health St, Miami, FL, United States",
    num_reviews: "30",
    latest_review: "2 weeks ago",
    rating: "4.7"
  },
  {
    name_of_business: "Tony's Pizza Gym", // Should be FILTERED OUT
    type_of_business: "gyms",
    sub_category: "restaurant", 
    phone_number: "555-0007",
    business_address: "777 Wrong Way, Miami, FL, United States",
    num_reviews: "20",
    latest_review: "1 week ago",
    rating: "3.5"
  },

  // RV PARKS - Should be filtered based on subcategory
  {
    name_of_business: "Sunny RV Resort",
    type_of_business: "rv parks",
    sub_category: "rv park",
    phone_number: "555-0008", 
    business_address: "888 RV Lane, Miami, FL, United States",
    num_reviews: "45",
    latest_review: "4 days ago",
    rating: "4.1"
  },
  {
    name_of_business: "Oaks Campground",
    type_of_business: "rv parks",
    sub_category: "campground",
    phone_number: "555-0009",
    business_address: "999 Nature Trail, Miami, FL, United States", 
    num_reviews: "15",
    latest_review: "6 days ago",
    rating: "4.6"
  },
  {
    name_of_business: "RV Park Diner", // Should be FILTERED OUT
    type_of_business: "rv parks",
    sub_category: "restaurant",
    phone_number: "555-0010",
    business_address: "111 Food Court, Miami, FL, United States",
    num_reviews: "8",
    latest_review: "2 days ago", 
    rating: "3.8"
  },

  // RESTAURANTS - No filtering rules, should all pass
  {
    name_of_business: "Best Pizza Ever",
    type_of_business: "restaurants", 
    sub_category: "pizza restaurant",
    phone_number: "555-0011",
    business_address: "222 Pizza St, Miami, FL, United States",
    num_reviews: "200",
    latest_review: "1 day ago",
    rating: "4.9"
  },
  {
    name_of_business: "Fancy Steakhouse", 
    type_of_business: "restaurants",
    sub_category: "steakhouse",
    phone_number: "555-0012",
    business_address: "333 Steak Ave, Miami, FL, United States",
    num_reviews: "150",
    latest_review: "3 days ago",
    rating: "4.4"
  },

  // LEADS THAT SHOULD FAIL BASIC FILTERS
  {
    name_of_business: "No Phone Business",
    type_of_business: "factories",
    sub_category: "manufacturer", 
    phone_number: "", // Should fail - no phone
    business_address: "444 No Phone St, Miami, FL, United States",
    num_reviews: "10",
    latest_review: "1 week ago",
    rating: "4.0"
  },
  {
    name_of_business: "Few Reviews Corp",
    type_of_business: "factories",
    sub_category: "manufacturer",
    phone_number: "555-0013",
    business_address: "555 Low Reviews Rd, Miami, FL, United States",
    num_reviews: "2", // Should fail - less than 4 reviews
    latest_review: "1 month ago", 
    rating: "4.0"
  },
  {
    name_of_business: "Old Reviews Inc",
    type_of_business: "factories", 
    sub_category: "manufacturer",
    phone_number: "555-0014",
    business_address: "666 Old St, Miami, FL, United States",
    num_reviews: "50",
    latest_review: "Last updated 2022", // Should fail - no "ago"
    rating: "4.0"
  },
  {
    name_of_business: "Foreign Business",
    type_of_business: "factories",
    sub_category: "manufacturer",
    phone_number: "555-0015", 
    business_address: "777 International Blvd, Toronto, Canada", // Should fail - not US
    num_reviews: "25", 
    latest_review: "2 weeks ago",
    rating: "4.0"
  }
];

// Test business types to request
const testBusinessTypes = [
  "Warehouses",
  "Factories", 
  "Gyms",
  "RV Parks",
  "Restaurants", // No filtering rules
  "Mobile Home Parks"
];

async function runFilteringTest() {
  console.log('🧪 STARTING FILTERING TEST');
  console.log('=' .repeat(60));
  
  try {
    // Get the already instantiated service
    const workflowService = GoogleSheetsWorkflowService;
    
    console.log(`📊 TEST DATA: ${testLeads.length} leads, ${testBusinessTypes.length} business types`);
    console.log(`📋 BUSINESS TYPES TO TEST: ${testBusinessTypes.join(', ')}`);
    console.log('');
    
    // Show breakdown of test data by business type
    const leadsByType = {};
    testLeads.forEach(lead => {
      const type = lead.type_of_business;
      if (!leadsByType[type]) leadsByType[type] = [];
      leadsByType[type].push(lead);
    });
    
    console.log('📈 TEST DATA BREAKDOWN:');
    Object.entries(leadsByType).forEach(([type, leads]) => {
      console.log(`   ${type}: ${leads.length} leads`);
      leads.forEach(lead => {
        console.log(`     - ${lead.name_of_business} (${lead.sub_category})`);
      });
    });
    console.log('');
    
    // Apply filtering
    console.log('🔄 APPLYING FILTERING...');
    console.log('-'.repeat(60));
    
    const filteredLeads = workflowService.applyFilteringAndFormatting(testLeads, testBusinessTypes);
    
    console.log('-'.repeat(60));
    console.log('');
    
    // Show results
    console.log('📊 FILTERING RESULTS:');
    console.log(`   Input leads: ${testLeads.length}`);
    console.log(`   Output leads: ${filteredLeads.length}`);
    console.log(`   Filtered out: ${testLeads.length - filteredLeads.length}`);
    console.log('');
    
    // Show what passed
    console.log('✅ LEADS THAT PASSED FILTERING:');
    if (filteredLeads.length === 0) {
      console.log('   (No leads passed filtering)');
    } else {
      filteredLeads.forEach((lead, index) => {
        console.log(`   ${index + 1}. ${lead.name_of_business}`);
        console.log(`      Type: ${lead.type_of_business} | SubCategory: ${lead.sub_category}`);
        console.log(`      Phone: ${lead.phone_number} | Reviews: ${lead.num_reviews}`);
        console.log('');
      });
    }
    
    // Show what was filtered out
    const filteredOutLeads = testLeads.filter(original => 
      !filteredLeads.some(filtered => filtered.phone_number === original.phone_number)
    );
    
    console.log('🚫 LEADS THAT WERE FILTERED OUT:');
    if (filteredOutLeads.length === 0) {
      console.log('   (No leads were filtered out)');
    } else {
      filteredOutLeads.forEach((lead, index) => {
        console.log(`   ${index + 1}. ${lead.name_of_business}`);
        console.log(`      Type: ${lead.type_of_business} | SubCategory: ${lead.sub_category}`);
        console.log(`      Phone: ${lead.phone_number} | Reviews: ${lead.num_reviews}`);
        console.log(`      Address: ${lead.business_address}`);
        console.log(`      Latest Review: ${lead.latest_review}`);
        console.log('');
      });
    }
    
    // Analysis
    console.log('🔍 ANALYSIS:');
    const expectedToPass = testLeads.filter(lead => {
      // Basic validation checks
      if (!lead.phone_number || !lead.business_address) return false;
      if (!lead.business_address.includes(',')) return false;
      if (parseInt(lead.num_reviews) < 4) return false;
      if (!lead.latest_review.toLowerCase().includes('ago')) return false;
      if (!lead.business_address.toLowerCase().includes('united states')) return false;
      return true;
    });
    
    console.log(`   Expected to pass basic filters: ${expectedToPass.length}`);
    console.log(`   Actually passed all filters: ${filteredLeads.length}`);
    
    const subcategoryFilteredOut = expectedToPass.length - filteredLeads.length;
    console.log(`   Filtered by subcategory rules: ${subcategoryFilteredOut}`);
    
    // Validation
    console.log('');
    console.log('✅ VALIDATION CHECKS:');
    
    // Check that all passing leads have valid phone numbers
    const validPhones = filteredLeads.every(lead => lead.phone_number && lead.phone_number.length > 0);
    console.log(`   All passing leads have phone numbers: ${validPhones ? '✅' : '❌'}`);
    
    // Check that all passing leads have US addresses
    const validAddresses = filteredLeads.every(lead => 
      lead.business_address && lead.business_address.toLowerCase().includes('united states')
    );
    console.log(`   All passing leads have US addresses: ${validAddresses ? '✅' : '❌'}`);
    
    // Check that all passing leads have enough reviews
    const validReviews = filteredLeads.every(lead => parseInt(lead.num_reviews) >= 4);
    console.log(`   All passing leads have 4+ reviews: ${validReviews ? '✅' : '❌'}`);
    
    // Check that restaurants passed (no filtering rules)
    const restaurantLeads = testLeads.filter(lead => lead.type_of_business === 'restaurants');
    const restaurantsPassed = filteredLeads.filter(lead => lead.type_of_business === 'restaurants');
    console.log(`   Restaurant leads passed filtering: ${restaurantsPassed.length}/${restaurantLeads.length} ${restaurantsPassed.length === restaurantLeads.length ? '✅' : '❌'}`);
    
    console.log('');
    console.log('🎉 TEST COMPLETED!');
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  runFilteringTest();
}

module.exports = { runFilteringTest, testLeads, testBusinessTypes }; 