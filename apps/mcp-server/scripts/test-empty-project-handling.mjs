#!/usr/bin/env node

/**
 * Manual Test: Empty Project Handling
 * 
 * This script tests that the sync service correctly handles empty GitHub Projects
 * by creating a test roadmap with empty phases and validating it.
 */

import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const TEST_DIR = tmpdir();
const TEST_FILE = join(TEST_DIR, 'test-empty-roadmap.json');

console.log('🧪 Testing Empty Project Handling\n');
console.log('='.repeat(50));

// Test Case 1: Empty project with empty currentPhase
console.log('\n📝 Test 1: Empty project with empty currentPhase');
const emptyRoadmap = {
  version: '1.2.0',
  lastUpdated: new Date().toISOString(),
  currentPhase: '',
  overallProgress: 0,
  phases: [],
};

writeFileSync(TEST_FILE, JSON.stringify(emptyRoadmap, null, 2));
console.log(`   Created test file: ${TEST_FILE}`);

try {
  const scriptPath = join(process.cwd(), 'scripts/validate-roadmap-schema.js');
  // Use spawnSync with array args to avoid shell injection
  const result = spawnSync('node', [scriptPath, TEST_FILE], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Validation failed with exit code ${result.status}`);
  }
  console.log('   ✅ Test 1 PASSED: Empty project validation succeeded');
} catch (error) {
  console.error('   ❌ Test 1 FAILED: Empty project validation failed');
  console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  unlinkSync(TEST_FILE);
}

// Test Case 2: Project with phases and valid currentPhase
console.log('\n📝 Test 2: Project with phases and valid currentPhase');
const validRoadmap = {
  version: '1.2.0',
  lastUpdated: new Date().toISOString(),
  currentPhase: 'phase-1',
  overallProgress: 25,
  phases: [
    {
      id: 'phase-1',
      name: 'Test Phase 1',
      description: 'First test phase',
      status: 'in-progress',
      priority: 'high',
      dependencies: [],
      deliverables: [
        {
          id: 'p1-d1',
          name: 'Test Deliverable',
          description: 'Test deliverable description',
          status: 'in-progress',
          filesImpacted: [],
        },
      ],
    },
  ],
};

writeFileSync(TEST_FILE, JSON.stringify(validRoadmap, null, 2));
console.log(`   Created test file: ${TEST_FILE}`);

try {
  const scriptPath = join(process.cwd(), 'scripts/validate-roadmap-schema.js');
  const result = spawnSync('node', [scriptPath, TEST_FILE], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Validation failed with exit code ${result.status}`);
  }
  console.log('   ✅ Test 2 PASSED: Valid project validation succeeded');
} catch (error) {
  console.error('   ❌ Test 2 FAILED: Valid project validation failed');
  console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  unlinkSync(TEST_FILE);
}

// Test Case 3: Invalid - currentPhase set but phases empty (should fail)
console.log('\n📝 Test 3: Invalid - currentPhase set but phases empty');
const invalidRoadmap = {
  version: '1.2.0',
  lastUpdated: new Date().toISOString(),
  currentPhase: 'phase-1',
  overallProgress: 0,
  phases: [],
};

writeFileSync(TEST_FILE, JSON.stringify(invalidRoadmap, null, 2));
console.log(`   Created test file: ${TEST_FILE}`);

try {
  const scriptPath = join(process.cwd(), 'scripts/validate-roadmap-schema.js');
  const result = spawnSync('node', [scriptPath, TEST_FILE], { stdio: 'inherit' });
  if (result.status === 0) {
    console.error('   ❌ Test 3 FAILED: Should have rejected invalid roadmap');
    process.exit(1);
  }
  console.log('   ✅ Test 3 PASSED: Correctly rejected invalid roadmap');
} catch (error) {
  console.log('   ✅ Test 3 PASSED: Correctly rejected invalid roadmap');
} finally {
  unlinkSync(TEST_FILE);
}

console.log('\n' + '='.repeat(50));
console.log('✅ All tests passed!\n');
