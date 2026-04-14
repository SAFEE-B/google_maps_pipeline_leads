#!/usr/bin/env node

// Simple runner for the filtering test
console.log('🧪 STARTING FILTERING TEST RUNNER\n');

try {
  const { runFilteringTest } = require('./test_filtering.js');
  runFilteringTest();
} catch (error) {
  console.error('❌ ERROR RUNNING TEST:', error.message);
  console.error('\n📝 Make sure you run this from the project root directory');
  console.error('💡 Command: node run_test.js');
  process.exit(1);
} 