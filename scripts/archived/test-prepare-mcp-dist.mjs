#!/usr/bin/env node
/**
 * Test script for prepare-mcp-dist.mjs
 * Validates that all dependencies from apps/mcp-server/package.json
 * are included in the generated dist/apps/mcp-server/package.json
 */
import fs from 'fs';
import path from 'path';

// Read source and generated package.json files
const mcpPkg = JSON.parse(fs.readFileSync('apps/mcp-server/package.json', 'utf8'));
const distPath = path.join('dist/apps/mcp-server/package.json');

if (!fs.existsSync(distPath)) {
  console.error('❌ Generated package.json not found. Run prepare-mcp-dist.mjs first.');
  process.exit(1);
}

const distPkg = JSON.parse(fs.readFileSync(distPath, 'utf8'));

// Extract dependency names
const sourceDeps = Object.keys(mcpPkg.dependencies || {});
const generatedDeps = Object.keys(distPkg.dependencies || {});

// Find missing dependencies
const missingDeps = sourceDeps.filter(dep => !generatedDeps.includes(dep));

console.log('📋 Dependency Validation Report');
console.log('================================');
console.log(`Source package deps: ${sourceDeps.length}`);
console.log(`Generated package deps: ${generatedDeps.length}`);
console.log('');

if (missingDeps.length > 0) {
  console.error('❌ FAIL: Missing dependencies in generated package.json:');
  missingDeps.forEach(dep => {
    console.error(`  - ${dep}: ${mcpPkg.dependencies[dep]}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('✅ PASS: All dependencies from source are included in generated package.json');
  console.log('');
  console.log('Included dependencies:');
  generatedDeps.forEach(dep => {
    console.log(`  ✓ ${dep}: ${distPkg.dependencies[dep]}`);
  });
  console.log('');
}
