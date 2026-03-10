#!/usr/bin/env node
/**
 * Cross-Platform Prerequisites Check Script - Ectropy Platform
 * Validates Node.js version and other requirements for setup
 * Works on Windows, Mac, and Linux
 */

import { execSync  } from 'child_process';
import fs from 'fs';
import os from 'os';

const REQUIRED_NODE_MAJOR = 20;
const REQUIRED_PNPM_MAJOR = 10;

// Check if running in Docker (skip certain checks)
const isDocker = process.env.DOCKER_BUILD === 'true' || 
                 fs.existsSync('/.dockerenv') ||
                 process.env.container === 'docker';

// Platform detection
const platform = os.platform();
const _isWindows = platform === 'win32'; // eslint-disable-line no-unused-vars

if (isDocker) {
    console.log('✓ Running in Docker environment, skipping local checks');
    process.exit(0);
}

console.log(`🔍 Checking Ectropy Platform Prerequisites on ${platform}...\n`);

function checkNodeVersion() {
  const nodeVersion = process.version;
  const currentMajorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (currentMajorVersion !== REQUIRED_NODE_MAJOR) {
    console.error(`❌ Node.js version ${nodeVersion} not supported`);
    console.error(`✅ Required: Node.js v${REQUIRED_NODE_MAJOR}.x.x`);
    console.error(`📦 Install: https://nodejs.org/dist/v20.18.1/`);
    process.exit(1);
  }
  console.log(`✅ Node.js ${nodeVersion}`);
}

function checkPnpm() {
  try {
    const pnpmVersion = execSync('pnpm --version', { stdio: 'pipe', encoding: 'utf8' }).trim();
    const currentMajorVersion = parseInt(pnpmVersion.split('.')[0]);
    
    if (currentMajorVersion < REQUIRED_PNPM_MAJOR) {
      console.error(`❌ pnpm version ${pnpmVersion} not supported`);
      console.error(`✅ Required: pnpm ${REQUIRED_PNPM_MAJOR}.x.x or higher`);
      console.error('🔧 Fix: corepack enable && corepack prepare pnpm@10.14.0 --activate');
      process.exit(1);
    }
    console.log(`✅ pnpm ${pnpmVersion}`);
  } catch (error) {
    console.error('❌ pnpm not found');
    console.error('📦 Install: corepack enable && corepack prepare pnpm@10.14.0 --activate');
    process.exit(1);
  }
}

function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    console.log('✅ Docker available');
  } catch (error) {
    console.warn('⚠️  Docker not found (optional for development)');
  }
}

// Run all checks
checkNodeVersion();
checkPnpm();
checkDocker();

console.log('\n✅ All prerequisites met - ready for setup!');
