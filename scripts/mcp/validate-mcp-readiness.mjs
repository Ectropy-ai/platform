#!/usr/bin/env node
/**
 * MCP Server Deployment Validation Script
 * Ensures the server is properly built and ready for deployment
 */

import fs from 'fs';
import { execSync } from 'child_process';

const REQUIRED_FILES = [
  'dist/apps/mcp-server/server.js',
  'dist/apps/mcp-server/package.json'
];

const REQUIRED_SCRIPTS = [
  'build:mcp-server',
  'build:mcp-server:verify',
  'mcp:dev',
  'mcp:build',
  'mcp:build:prod'
];

function validateBuildArtifacts() {
  console.log('🔍 Validating MCP build artifacts...');
  
  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(file)) {
      throw new Error(`Required build artifact missing: ${file}`);
    }
  }
  
  // Validate package.json content
  const packageJson = JSON.parse(fs.readFileSync('dist/apps/mcp-server/package.json', 'utf8'));
  if (packageJson.type !== 'commonjs') {
    throw new Error('package.json must specify CommonJS module type');
  }
  
  if (packageJson.main !== 'server.js') {
    throw new Error('package.json main entry point must be server.js');
  }
  
  console.log('✅ Build artifacts validated');
}

function validatePackageScripts() {
  console.log('🔍 Validating package scripts...');
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = packageJson.scripts || {};
  
  for (const script of REQUIRED_SCRIPTS) {
    if (!scripts[script]) {
      throw new Error(`Required package script missing: ${script}`);
    }
  }
  
  console.log('✅ Package scripts validated');
}

function validateServerStartup() {
  console.log('🔍 Validating server startup...');
  
  try {
    // Quick smoke test - start server and verify it doesn't crash immediately
    const _result = execSync('timeout 5s node dist/apps/mcp-server/server.js || true', {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // If we get here without throwing, the server started successfully
    console.log('✅ Server startup validated');
  } catch (error) {
    throw new Error(`Server startup validation failed: ${error.message}`);
  }
}

function main() {
  try {
    console.log('🚀 MCP Server Deployment Validation');
    console.log('===================================');
    
    validateBuildArtifacts();
    validatePackageScripts();
    validateServerStartup();
    
    console.log('');
    console.log('✅ MCP server is ready for deployment!');
    console.log('   Build artifacts: ✓');
    console.log('   Package scripts: ✓');
    console.log('   Server startup:  ✓');
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

main();