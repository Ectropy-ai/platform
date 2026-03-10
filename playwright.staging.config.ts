import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Staging Environment Assessment
 *
 * Purpose: Test staging.ectropy.ai for demo readiness
 * Differences from standard config:
 * - Targets remote staging server instead of localhost
 * - Extended timeouts for remote testing
 * - Enhanced screenshot/video capture for evidence
 * - Single browser (Chromium) for faster assessment
 *
 * Usage: pnpm exec playwright test --config=playwright.staging.config.ts
 */

export default defineConfig({
  // Test directory - staging-specific tests
  testDir: './tests/playwright',
  testMatch: 'staging-assessment.spec.ts',

  // Timeouts - increased for remote testing
  timeout: 60000, // 60 seconds per test (remote requests may be slower)
  expect: {
    timeout: 15000, // 15 seconds for assertions
  },

  // Test execution settings
  fullyParallel: false, // Run tests sequentially for clearer diagnostics
  forbidOnly: !!process.env.CI, // Fail if test.only in CI
  retries: process.env.CI ? 2 : 1, // Retry failed tests (network issues)
  workers: 1, // Single worker for staging assessment

  // Reporter configuration
  reporter: [
    [
      'html',
      {
        outputFolder: 'playwright-report/staging',
        open: 'never', // Don't auto-open in CI
      },
    ],
    ['list'], // Console output
    [
      'json',
      {
        outputFile: 'test-results/staging-assessment-results.json',
      },
    ],
  ],

  // Test result output
  outputDir: 'test-results/',

  // Shared settings for all tests
  use: {
    // Base URL - staging server
    baseURL: 'http://staging.ectropy.ai',

    // Extended timeouts for remote testing
    actionTimeout: 15000,
    navigationTimeout: 30000,

    // Capture evidence on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // Browser context settings
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: false, // Enforce HTTPS validation

    // User agent
    userAgent: 'Playwright-Staging-Assessment/1.0',
  },

  // Browser projects - Chromium only for faster assessment
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Additional Chrome-specific settings for staging
        launchOptions: {
          args: [
            '--disable-blink-features=AutomationControlled', // Reduce automation detection
          ],
        },
      },
    },

    // Uncomment for multi-browser testing once staging is stable
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // No webServer needed - testing remote staging environment
  // webServer: undefined,
});

/**
 * Configuration Notes:
 *
 * 1. Remote Testing: This config targets staging.ectropy.ai, not localhost
 * 2. Timeouts: Increased to account for network latency and remote server response times
 * 3. Single Browser: Using Chromium only for initial assessment (faster feedback)
 * 4. Evidence Capture: Screenshots, videos, and traces saved for all failures
 * 5. Sequential Execution: Tests run one at a time for clearer diagnostic output
 *
 * Running Tests:
 *
 * # Full staging assessment
 * pnpm exec playwright test --config=playwright.staging.config.ts
 *
 * # Run specific test
 * pnpm exec playwright test --config=playwright.staging.config.ts -g "should load staging"
 *
 * # View report
 * pnpm exec playwright show-report playwright-report/staging
 *
 * # Debug mode (headed browser)
 * pnpm exec playwright test --config=playwright.staging.config.ts --headed
 */
