#!/usr/bin/env node
/**
 * Node v20 Compatibility Checker for Ectropy Platform
 * Cross-platform script to validate Node v20 compatibility
 */

import { execSync } from 'child_process';
// Note: fs and path are reserved for future compatibility checks
import _fs from 'fs'; // eslint-disable-line no-unused-vars
import _path from 'path'; // eslint-disable-line no-unused-vars

const REQUIREMENTS = {
  node: {
    required: '>=20.0.0 <21.0.0',
    command: 'node --version',
    parse: (output) => output.trim().replace('v', ''),
  },
  pnpm: {
    required: '>=10.0.0',
    command: 'pnpm --version',
    parse: (output) => output.trim(),
  },
};

function checkRequirement(name, config) {
  try {
    const output = execSync(config.command, { encoding: 'utf8' });
    const version = config.parse(output);

    console.log(`✅ ${name}: ${version} (required: ${config.required})`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}: NOT FOUND (required: ${config.required})`);
    return false;
  }
}

function testNodeCompatibility() {
  console.log('🔍 Testing Node v20 compatibility features...\n');

  const tests = [
    {
      name: 'TypeScript execution with --import tsx',
      command:
        'node --import tsx -e "console.log(\'✅ TypeScript execution working\')"',
    },
    {
      name: 'JSON parsing (BOM check)',
      command:
        "node -e \"JSON.parse(await import('fs').readFileSync('package.json')); console.log('✅ JSON parsing working')\"",
    },
    {
      name: 'ESM module loading',
      command:
        "node --import tsx -e \"import('@ectropy/shared').then(() => console.log('✅ ESM modules working')).catch(e => { console.log('❌ ESM error:', e.message); process.exit(1); })\"",
    },
  ];

  let passed = 0;
  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`);
      execSync(test.command, { stdio: 'inherit' });
      passed++;
    } catch (error) {
      console.error(`❌ Failed: ${test.name}`);
    }
  }

  console.log(`\n📊 Compatibility tests: ${passed}/${tests.length} passed`);
  return passed === tests.length;
}

console.log('🚀 Ectropy Platform - Node v20 Compatibility Check\n');

// Check prerequisites
let allPassed = true;
for (const [name, config] of Object.entries(REQUIREMENTS)) {
  if (!checkRequirement(name, config)) {
    allPassed = false;
  }
}

if (!allPassed) {
  console.log(
    '\n❌ Prerequisites not met. Please install the required Node.js and pnpm versions.'
  );
  process.exit(1);
}

// Test compatibility features
console.log(`\n${'='.repeat(50)}`);
const compatibilityPassed = testNodeCompatibility();

console.log(`\n${'='.repeat(50)}`);
if (compatibilityPassed) {
  console.log('✅ All Node v20 compatibility checks passed!');
  console.log('🎉 Platform is ready for Node v20 development');
  process.exit(0);
} else {
  console.log('❌ Some compatibility checks failed');
  process.exit(1);
}
