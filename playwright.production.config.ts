import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Production Environment Validation
 *
 * Purpose: Validate production deployment at https://ectropy.ai
 * Features:
 * - Sequential execution for production safety
 * - Retry logic for transient network issues
 * - Comprehensive failure capture (screenshots, videos, traces)
 * - HTML and JSON reports for documentation
 *
 * Usage: pnpm test:e2e:production
 */

// Timeout constants for production environment (increased for CI reliability)
const ACTION_TIMEOUT = 20000; // 20 seconds for individual actions
const NAVIGATION_TIMEOUT = 60000; // 60 seconds for page navigation
const TEST_TIMEOUT = 90000; // 90 seconds per test
const EXPECT_TIMEOUT = 20000; // 20 seconds for assertions

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/production-validation.spec.ts',
  fullyParallel: false, // Run sequentially for production
  forbidOnly: true,
  retries: 3, // Retry failed tests 3 times (was 2) - adds resilience for transient failures
  workers: 1, // Single worker for production tests
  reporter: [
    ['html', { outputFolder: 'test-results/production' }],
    ['json', { outputFile: 'test-results/production/results.json' }],
    ['list'],
  ],

  use: {
    // NOTE: Using staging.ectropy.ai as production proxy until ectropy.ai domain is configured
    // ectropy.ai domain does not resolve (DNS not configured)
    // staging.ectropy.ai is the actual deployed production-like environment
    baseURL: process.env.PRODUCTION_URL || 'https://staging.ectropy.ai',
    trace: 'retain-on-failure', // Capture full trace on failure for debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: ACTION_TIMEOUT,
    navigationTimeout: NAVIGATION_TIMEOUT,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  timeout: TEST_TIMEOUT,
  expect: {
    timeout: EXPECT_TIMEOUT,
  },
});
