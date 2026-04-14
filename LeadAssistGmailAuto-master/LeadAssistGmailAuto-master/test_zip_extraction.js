const { extractZipCodeFromAddress, isValidZipCode } = require('./fix_zip_codes');

console.log('🧪 COMPREHENSIVE ZIP CODE EXTRACTION TESTING\n');

// Test cases based on real-world scenarios
const testCases = [
  // The specific issue mentioned by the user
  {
    address: "11101 hawks street, OH,78978,United States",
    expected: "78978",
    description: "User's specific problem case"
  },
  
  // Standard US address formats
  {
    address: "123 Main St, Phoenix, AZ 85001, United States",
    expected: "85001",
    description: "Standard format with spaces"
  },
  
  {
    address: "456 Oak Ave, Los Angeles, CA, 90210",
    expected: "90210",
    description: "No 'United States' suffix"
  },
  
  {
    address: "789 Pine Rd, New York, NY 10001-1234, United States",
    expected: "10001",
    description: "ZIP+4 format"
  },
  
  {
    address: "321 Elm St, Miami, FL 33101",
    expected: "33101",
    description: "Simple format"
  },
  
  // Edge cases with various formatting
  {
    address: "555 Broadway, Seattle, WA98101, United States",
    expected: "98101",
    description: "No space before zip"
  },
  
  {
    address: "999 First Ave, Chicago,IL, 60601, United States",
    expected: "60601",
    description: "Various comma placements"
  },
  
  {
    address: "12345 Sample Drive, Las Vegas, NV, 89101, United States",
    expected: "89101",
    description: "Street number could be confused with zip"
  },
  
  // Problematic cases that might cause confusion
  {
    address: "12345 Zip Code Lane, Testville, TX, 12345, United States",
    expected: "12345",
    description: "Street number same as zip code"
  },
  
  {
    address: "98765 Main St, Springfield, IL,12345,United States",
    expected: "12345",
    description: "Large street number, no spaces"
  },
  
  // International or unusual formats
  {
    address: "123 International Blvd, Toronto, ON M5V 3A8, Canada",
    expected: null,
    description: "Canadian postal code (should not extract)"
  },
  
  {
    address: "456 European Ave, London, UK SW1A 1AA",
    expected: null,
    description: "UK postal code (should not extract)"
  },
  
  // Missing or incomplete information
  {
    address: "789 Incomplete St, Somewhere",
    expected: null,
    description: "No zip code present"
  },
  
  {
    address: "123 Bad Format, City State 1234",
    expected: null,
    description: "4-digit number (not valid zip)"
  },
  
  // Real-world variations from business listings
  {
    address: "1500 W Deer Valley Rd, Phoenix, AZ 85027, United States",
    expected: "85027",
    description: "Real business address format"
  },
  
  {
    address: "2301 N 44th St #14, Phoenix,AZ 85008,United States",
    expected: "85008",
    description: "Address with suite number"
  },
  
  {
    address: "875 N Michigan Ave, Chicago, IL 60611-2703, United States",
    expected: "60611",
    description: "ZIP+4 with hyphen"
  },
  
  // Edge cases with unusual spacing/punctuation
  {
    address: "123 Test St , City , State , 12345 , United States",
    expected: "12345",
    description: "Extra spaces around commas"
  },
  
  {
    address: "456 Another St,City,State,67890,United States",
    expected: "67890",
    description: "No spaces after commas"
  }
];

// Run tests
let passed = 0;
let failed = 0;

console.log('Running tests...\n');

testCases.forEach((testCase, index) => {
  const result = extractZipCodeFromAddress(testCase.address);
  const isValid = isValidZipCode(result);
  const testPassed = result === testCase.expected;
  
  if (testPassed) {
    passed++;
    console.log(`✅ Test ${index + 1}: PASSED`);
  } else {
    failed++;
    console.log(`❌ Test ${index + 1}: FAILED`);
  }
  
  console.log(`   Description: ${testCase.description}`);
  console.log(`   Address: ${testCase.address}`);
  console.log(`   Last 30 chars: "${testCase.address.slice(-30)}"`);
  console.log(`   Expected: ${testCase.expected || 'null'}`);
  console.log(`   Got: ${result || 'null'}`);
  console.log(`   Valid format: ${isValid ? '✅' : '❌'}`);
  console.log('');
});

// Summary
console.log('📊 TEST SUMMARY:');
console.log('═══════════════════════════════════════');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Total: ${testCases.length}`);
console.log(`🎯 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════\n');

if (failed === 0) {
  console.log('🎉 All tests passed! The extraction logic is working correctly.');
  console.log('✅ Ready to run on the actual database.');
} else {
  console.log('⚠️  Some tests failed. Review the extraction logic before running on the database.');
}

// Additional validation test
console.log('\n🔍 ADDITIONAL VALIDATION TESTS:');

const validationTests = [
  { zip: "12345", expected: true, desc: "Standard 5-digit zip" },
  { zip: "01234", expected: true, desc: "East coast zip with leading zero" },
  { zip: "1234", expected: false, desc: "4-digit number" },
  { zip: "123456", expected: false, desc: "6-digit number" },
  { zip: "00000", expected: false, desc: "All zeros" },
  { zip: "11111", expected: false, desc: "All ones" },
  { zip: "99999", expected: false, desc: "All nines" },
  { zip: "abcde", expected: false, desc: "Non-numeric" },
  { zip: null, expected: false, desc: "Null value" },
  { zip: "", expected: false, desc: "Empty string" }
];

validationTests.forEach((test, index) => {
  const result = isValidZipCode(test.zip);
  const testPassed = result === test.expected;
  
  console.log(`${testPassed ? '✅' : '❌'} Validation ${index + 1}: ${test.desc}`);
  console.log(`   Input: ${test.zip || 'null'}`);
  console.log(`   Expected: ${test.expected}`);
  console.log(`   Got: ${result}`);
  console.log('');
});

console.log('\n🚀 Test complete! You can now run the fix_zip_codes.js script if everything looks good.'); 