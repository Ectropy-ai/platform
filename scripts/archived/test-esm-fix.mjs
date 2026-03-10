#!/usr/bin/env node
/**
 * MCP Server ESM Fix Validation Test
 * Demonstrates that the util.inherits error has been resolved
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const testResults = {
  buildSuccess: false,
  esmValidation: false,
  noUtilInheritsError: false,
  bundleSizeOptimized: false
};

async function runCommand(command, args, cwd = '.') {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { 
      cwd, 
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', reject);
  });
}

async function main() {
  console.log('🧪 Testing MCP Server ESM Fix');
  console.log('==============================\n');

  try {
    // Test 1: Build the MCP server
    console.log('1. Testing MCP server build...');
    const buildResult = await runCommand('pnpm', ['nx', 'build', 'mcp-server']);
    if (buildResult.code === 0) {
      testResults.buildSuccess = true;
      console.log('   ✅ Build successful\n');
    } else {
      console.log('   ❌ Build failed\n');
      throw new Error('Build failed');
    }

    // Test 2: Prepare deployment package
    console.log('2. Testing deployment package preparation...');
    const prepareResult = await runCommand('pnpm', ['nx', 'prepare', 'mcp-server']);
    if (prepareResult.code === 0) {
      console.log('   ✅ Deployment package created\n');
    } else {
      console.log('   ❌ Deployment package creation failed\n');
      throw new Error('Deployment package creation failed');
    }

    // Test 3: Validate ESM compatibility
    console.log('3. Testing ESM validation...');
    const esmResult = await runCommand('node', ['scripts/validate-esm-migration.mjs']);
    if (esmResult.code === 0 && esmResult.stdout.includes('require(0)')) {
      testResults.esmValidation = true;
      console.log('   ✅ ESM validation passed (0 CommonJS require calls)\n');
    } else {
      console.log('   ❌ ESM validation failed\n');
    }

    // Test 4: Check bundle size optimization
    console.log('4. Testing bundle size optimization...');
    const mainJsPath = path.join('dist/apps/mcp-server/main.js');
    const mainJsStats = await fs.stat(mainJsPath);
    const sizeInMB = mainJsStats.size / (1024 * 1024);
    
    if (sizeInMB < 3.0) { // Less than 3MB indicates good optimization
      testResults.bundleSizeOptimized = true;
      console.log(`   ✅ Bundle size optimized: ${sizeInMB.toFixed(2)}MB\n`);
    } else {
      console.log(`   ⚠️  Bundle size: ${sizeInMB.toFixed(2)}MB (larger than expected)\n`);
    }

    // Test 5: Test server startup (should fail only on missing env vars, not util.inherits)
    console.log('5. Testing server startup (util.inherits error fix)...');
    const serverResult = await runCommand('timeout', ['5s', 'node', 'main.js'], 'dist/apps/mcp-server');
    
    const hasUtilInheritsError = serverResult.stderr.includes('ERR_INVALID_ARG_TYPE') && 
                                serverResult.stderr.includes('superCtor.prototype');
    const hasEnvError = serverResult.stderr.includes('OPENAI_API_KEY');
    
    if (!hasUtilInheritsError && hasEnvError) {
      testResults.noUtilInheritsError = true;
      console.log('   ✅ util.inherits error fixed - server fails only on missing environment variables\n');
    } else if (hasUtilInheritsError) {
      console.log('   ❌ util.inherits error still present\n');
    } else {
      console.log('   ⚠️  Unexpected server behavior\n');
    }

    // Summary
    console.log('📊 Test Results Summary');
    console.log('=======================');
    Object.entries(testResults).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
    });

    const allPassed = Object.values(testResults).every(result => result);
    console.log(`\n🎯 Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    
    if (allPassed) {
      console.log('\n🚀 The util.inherits ESM fix has been successfully implemented!');
      console.log('   The MCP server now uses externalized dependencies and pure ESM imports.');
    }

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

main();