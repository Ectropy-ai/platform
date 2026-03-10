/**
 * Global Test Setup for Ectropy Platform
 * Handles environment configuration, database setup, and security testing
 */

import { execSync } from 'child_process';
import * as path from 'path';

/**
 * Global setup for Jest testing environment
 * This runs once before all test suites
 */
export default async function globalSetup(): Promise<void> {
  console.log('🏗️ Setting up Ectropy Testing Environment...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-jwt-secret-for-testing-only-not-production';
  process.env.JWT_REFRESH_SECRET = process.env.TEST_JWT_REFRESH_SECRET || 'test-refresh-secret-for-testing-only';
  // Database and Redis component variables (NEW APPROACH)
  process.env.DATABASE_HOST = process.env.TEST_DATABASE_HOST || 'localhost';
  process.env.DATABASE_PORT = process.env.TEST_DATABASE_PORT || '5432';
  process.env.DATABASE_NAME = process.env.TEST_DATABASE_NAME || 'ectropy_test';
  process.env.DATABASE_USER = process.env.TEST_DATABASE_USER || 'test';
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'test';
  
  process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || '6379';
  process.env.REDIS_PASSWORD = process.env.TEST_REDIS_PASSWORD || '';
  
  // Legacy URLs (DEPRECATED - for backward compatibility)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
    'postgresql://test:test@localhost:5432/ectropy_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/15'; // Use DB 15 for tests
  process.env.SPECKLE_SERVER_URL = process.env.TEST_SPECKLE_SERVER_URL || 'https://test.speckle.example.com';

  // Security test configuration
  process.env.RATE_LIMIT_MAX = '1000'; // Higher limits for testing
  process.env.RATE_LIMIT_WINDOW = '1'; // 1 second window for fast tests

  // Disable external services in test mode
  process.env.DISABLE_EXTERNAL_SERVICES = 'true';
  process.env.DISABLE_NOTIFICATIONS = 'true';
  process.env.DISABLE_ANALYTICS = 'true';

  try {
    // Create test database if needed (for integration tests)
    await setupTestDatabase();

    // Setup Redis test database
    await setupTestRedis();

    // Prepare test fixtures
    await prepareTestFixtures();

    console.log('✅ Testing Environment Setup Complete');
  } catch (error) {
    console.error('❌ Failed to setup testing environment:', error);
    throw error;
  }
}

/**
 * Setup test database for integration tests
 */
async function setupTestDatabase(): Promise<void> {
  console.log('📊 Setting up test database...');

  // This would normally set up a test database
  // For now, we'll just verify environment variables are set
  if (!process.env.DATABASE_HOST || !process.env.DATABASE_PORT || !process.env.DATABASE_NAME || !process.env.DATABASE_USER) {
    throw new Error(
      'Database component environment variables (DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER) are required for testing'
    );
  }

  console.log('✅ Database setup verified');
}

/**
 * Setup Redis test instance
 */
async function setupTestRedis(): Promise<void> {
  console.log('🔄 Setting up test Redis...');

  if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
    throw new Error('Redis component environment variables (REDIS_HOST, REDIS_PORT) are required for testing');
  }

  console.log('✅ Redis setup verified');
}

/**
 * Prepare test fixtures and data
 */
async function prepareTestFixtures(): Promise<void> {
  console.log('📁 Preparing test fixtures...');

  // Create necessary directories for test artifacts
  const dirs = [
    'testing/artifacts',
    'testing/temp',
    'testing/logs',
    'reports/test-results',
    'reports/coverage',
    'reports/security',
    'reports/performance',
  ];

  for (const dir of dirs) {
    try {
      execSync(`mkdir -p ${dir}`, { cwd: process.cwd() });
    } catch (error) {
      // Directory might already exist, that's okay
    }
  }

  console.log('✅ Test fixtures prepared');
}
