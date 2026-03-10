#!/usr/bin/env node
/**
 * Test script for prepare-*-dist.mjs scripts
 * 
 * Validates that prepare scripts generate complete package.json files
 * with all required dependencies from the app's package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

console.log('🧪 Testing prepare-dist scripts...\n');

// Test configurations
const tests = [
  {
    name: 'mcp-server',
    script: 'scripts/mcp/prepare-mcp-dist.mjs',
    distPath: 'dist/apps/mcp-server/package.json',
    sourcePath: 'apps/mcp-server/package.json',
    criticalDeps: ['compression', 'express-validator', 'express', 'helmet', 'cors', 'pg', 'ioredis']
  },
  {
    name: 'api-gateway',
    script: 'scripts/core/prepare-api-gateway-dist.mjs',
    distPath: 'dist/apps/api-gateway/package.json',
    sourcePath: 'apps/api-gateway/package.json',
    criticalDeps: ['@prisma/client', 'connect-redis', 'graphql', 'graphql-tag', 'prom-client', 'compression', 'express-validator']
  }
];

let allPassed = true;

for (const test of tests) {
  console.log(`Testing ${test.name}...`);
  
  try {
    // Run prepare script
    execSync(`node ${test.script}`, { cwd: repoRoot, stdio: 'pipe' });
    
    // Read source and generated package.json
    const sourcePkg = JSON.parse(fs.readFileSync(path.join(repoRoot, test.sourcePath), 'utf8'));
    const distPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, test.distPath), 'utf8'));
    
    // Get source dependencies (excluding devDependencies for production build)
    const sourceDeps = Object.keys(sourcePkg.dependencies || {});
    const distDeps = Object.keys(distPkg.dependencies || {});
    
    // Check that all source dependencies are in dist
    const missingDeps = sourceDeps.filter(dep => !distDeps.includes(dep));
    
    // Check critical dependencies
    const missingCritical = test.criticalDeps.filter(dep => !distDeps.includes(dep));
    
    if (missingDeps.length > 0) {
      console.log(`  ❌ Missing dependencies from source:`);
      missingDeps.forEach(dep => console.log(`     - ${dep}`));
      allPassed = false;
    } else {
      console.log(`  ✅ All ${sourceDeps.length} source dependencies present`);
    }
    
    if (missingCritical.length > 0) {
      console.log(`  ❌ Missing critical dependencies:`);
      missingCritical.forEach(dep => console.log(`     - ${dep}`));
      allPassed = false;
    } else {
      console.log(`  ✅ All ${test.criticalDeps.length} critical dependencies present`);
    }
    
    console.log(`  📦 Total dependencies in dist: ${distDeps.length}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    allPassed = false;
  }
  
  console.log('');
}

console.log('='.repeat(60));

if (allPassed) {
  console.log('✅ All prepare scripts generate valid package.json files');
  process.exit(0);
} else {
  console.log('❌ Some prepare scripts have issues');
  process.exit(1);
}
