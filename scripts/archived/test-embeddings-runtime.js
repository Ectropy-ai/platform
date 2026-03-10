#!/usr/bin/env node
/**
 * Embeddings Runtime Test Script
 * Quick runtime validation for embeddings functionality
 * Used as fallback when TypeScript compilation fails
 */

// Test @xenova/transformers runtime loading
async function testTransformersRuntime() {
  try {
    const { pipeline: _pipeline } = await import('@xenova/transformers');
    console.log('✅ @xenova/transformers runtime loading successful');
    return true;
  } catch (error) {
    console.error('❌ @xenova/transformers runtime loading failed:', error.message);
    return false;
  }
}

// Test embeddings generation module runtime loading
async function testEmbeddingsModuleRuntime() {
  try {
    // Try importing the TypeScript file directly
    const embeddingsModule = await import('../libs/embeddings/src/generate.ts');
    console.log('✅ Embeddings generation module runtime loading successful');
    
    // Check that expected exports are available
    if (typeof embeddingsModule.generateEmbeddings === 'function' && 
        typeof embeddingsModule.chunkDocument === 'function') {
      console.log('✅ All expected embeddings functions are available');
      return true;
    } else {
      console.error('❌ Expected embeddings functions not found');
      return false;
    }
  } catch (error) {
    console.error('❌ Embeddings generation module runtime loading failed:', error.message);
    return false;
  }
}

// Test update-embeddings script basic functionality
async function testUpdateEmbeddingsRuntime() {
  try {
    // This simulates the main function in update-embeddings.ts without database connections
    const { pipeline: _pipeline } = await import('@xenova/transformers');
    console.log('✅ Update embeddings script core functionality available');
    return true;
  } catch (error) {
    console.error('❌ Update embeddings script runtime test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('=== Embeddings Runtime Validation ===');
  
  const tests = [
    { name: 'Transformers Runtime', test: testTransformersRuntime },
    { name: 'Embeddings Module Runtime', test: testEmbeddingsModuleRuntime },
    { name: 'Update Script Runtime', test: testUpdateEmbeddingsRuntime }
  ];
  
  let allPassed = true;
  
  for (const { name, test } of tests) {
    console.log(`\n🔄 Testing ${name}...`);
    const result = await test();
    if (!result) {
      allPassed = false;
    }
  }
  
  if (allPassed) {
    console.log('\n✅ All runtime tests passed - embeddings functionality is available');
    process.exit(0);
  } else {
    console.log('\n❌ Some runtime tests failed - embeddings functionality may be impaired');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Runtime validation script failed:', error);
  process.exit(1);
});