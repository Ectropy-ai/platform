#!/usr/bin/env node
/**
 * Workflow ES Module Validation Script
 * Tests that all workflow inline scripts use proper ES module syntax
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

console.log('🧪 Testing workflow inline scripts for ES module compliance...\n');

const workflows = [
  '.github/workflows/security-enhanced.yml',
  '.github/workflows/dependency-health.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/production-workflow.yml',
  '.github/workflows/staging-workflow.yml',
];

let totalTests = 0;
let passedTests = 0;
const results = [];

for (const workflowPath of workflows) {
  console.log(`\nTesting ${workflowPath}...`);

  try {
    const content = readFileSync(workflowPath, 'utf8');

    // Test 1: YAML syntax validation
    totalTests++;
    try {
      execSync(`npx js-yaml ${workflowPath}`, { stdio: 'pipe' });
      console.log(`  ✅ YAML syntax valid`);
      passedTests++;
      results.push({
        workflow: workflowPath,
        test: 'YAML syntax',
        status: 'PASS',
      });
    } catch (e) {
      console.log(`  ❌ YAML syntax error`);
      results.push({
        workflow: workflowPath,
        test: 'YAML syntax',
        status: 'FAIL',
        error: e.message,
      });
    }

    // Test 2: Check for CommonJS patterns
    totalTests++;
    const hasCommonJS =
      content.includes('require(') || content.includes('module.exports');
    if (!hasCommonJS) {
      console.log(`  ✅ No CommonJS patterns found`);
      passedTests++;
      results.push({
        workflow: workflowPath,
        test: 'CommonJS patterns',
        status: 'PASS',
      });
    } else {
      console.log(`  ❌ CommonJS patterns detected`);
      results.push({
        workflow: workflowPath,
        test: 'CommonJS patterns',
        status: 'FAIL',
      });
    }

    // Test 3: Extract and validate inline Node.js scripts
    const scriptPattern =
      /cat > (.*?\.js) << ['"]?EOF['"]?([\s\S]*?)^[ ]*EOF$/gm;
    let match;
    let scriptCount = 0;

    while ((match = scriptPattern.exec(content)) !== null) {
      const [, fileName, scriptContent] = match;
      scriptCount++;
      totalTests++;

      console.log(`  Testing inline script: ${fileName}`);

      // Clean up the script content (remove leading spaces)
      const cleanScript = scriptContent
        .split('\n')
        .map((line) => line.replace(/^          /, ''))
        .filter((line) => line.trim().length > 0)
        .join('\n');

      // Write temp file and test it
      const tempFile = `/tmp/test-${fileName}`;
      writeFileSync(tempFile, cleanScript);

      try {
        execSync(`node --check ${tempFile}`, { stdio: 'pipe' });
        console.log(`    ✅ ${fileName} - syntax valid`);
        passedTests++;
        results.push({
          workflow: workflowPath,
          test: `Script: ${fileName}`,
          status: 'PASS',
        });
      } catch (e) {
        console.log(`    ❌ ${fileName} - syntax error`);
        console.log(`    Error: ${e.message}`);
        results.push({
          workflow: workflowPath,
          test: `Script: ${fileName}`,
          status: 'FAIL',
          error: e.message,
        });
      }
    }

    if (scriptCount === 0) {
      console.log(`  ℹ️ No inline scripts found`);
    }
  } catch (e) {
    console.error(`Failed to test ${workflowPath}: ${e.message}`);
    results.push({
      workflow: workflowPath,
      test: 'File access',
      status: 'ERROR',
      error: e.message,
    });
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('✅ WORKFLOW ES MODULE VALIDATION COMPLETE');
console.log('='.repeat(60));
console.log(`\n📊 Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('\n🎉 All tests passed! Workflows are ES module compliant.');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. See details above.');
  console.log('\nFailed tests:');
  results
    .filter((r) => r.status === 'FAIL' || r.status === 'ERROR')
    .forEach((r) => {
      console.log(`  - ${r.workflow}: ${r.test} (${r.status})`);
      if (r.error) {
        console.log(`    ${r.error}`);
      }
    });
  process.exit(1);
}
