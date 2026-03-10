#!/usr/bin/env node
/**
 * Cross-Platform Postinstall Script - Ectropy Platform
 * Replaces scripts/postinstall-safe.sh for Windows compatibility
 */

import os from 'os';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔧 Cross-Platform Postinstall Script');
console.log('=====================================');

// Check if we're in CI environment
if (process.env.CI === 'true') {
  console.log('🎭 CI environment detected - skipping Playwright installation');
  console.log('   Reason: Playwright progress display bug causes RangeError: Invalid count value: Infinity');
  console.log('   Solution: Use scripts/fix-playwright-root-cause.sh in CI workflows instead');
  console.log('✅ Postinstall completed safely for CI');
  process.exit(0);
}

const platform = os.platform();
console.log(`🖥️  Platform detected: ${platform}`);

// Handle Playwright installation based on platform
if (platform === 'win32') {
  console.log('🪟 Windows detected - skipping automatic Playwright browser install');
  console.log('💡 Manual installation available:');
  console.log('   Run "pnpm exec playwright install" manually if needed for testing');
  console.log('   Or use "npm run playwright:install" after setup completes');
} else {
  // Unix/Mac logic
  console.log('🐧 Unix/Mac environment - attempting Playwright installation');
  
  if (process.stdin.isTTY) {
    console.log('💻 Interactive terminal detected');
    
    try {
      // Try installation with error handling
      execSync('pnpm exec playwright install --with-deps', { 
        stdio: 'inherit',
        timeout: 120000 // 2 minute timeout
      });
      console.log('✅ Playwright installation completed');
    } catch (error) {
      console.log('⚠️  Playwright installation had issues (this is expected)');
      console.log('🔧 Run "./scripts/fix-playwright-root-cause.sh" to fix browser installation');
    }
  } else {
    console.log('🤖 Non-interactive environment - skipping Playwright installation');
    console.log('   Run "pnpm run playwright:install" or "./scripts/fix-playwright-root-cause.sh" manually');
  }
}

// Apply patches if they exist
const patchFile = path.join(process.cwd(), 'patches', 'nx-webpack-esm-fix.patch');
if (fs.existsSync(patchFile)) {
  console.log('🔧 Applying Nx webpack ESM compatibility patch');
  try {
    execSync('patch -p0 -N < patches/nx-webpack-esm-fix.patch', { stdio: 'inherit' });
  } catch (error) {
    // Patch might already be applied, continue silently
  }
}

console.log('✅ Cross-platform postinstall completed');