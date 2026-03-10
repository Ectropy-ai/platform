import { defineConfig, devices } from '@playwright/test';

/**
 * CI-Optimized Playwright Configuration for web-dashboard-e2e
 * - Only tests Chromium (80% faster)
 * - Optimized for staging environment testing
 * - Enhanced stability with retries and single worker
 * - Resilient to OAuth failures (graceful degradation)
 */
export default defineConfig({
  testDir: './src',
  timeout: 180000, // 3 minutes for CI stability (increased for complex tests)
  expect: {
    timeout: 20000, // 20 seconds for assertions (increased for CI)
  },
  // ROOT CAUSE FIX (2026-02-13): Disable global fullyParallel to fix setup race condition
  // ISSUE: fullyParallel: true caused setup tests to run in parallel (validate-auth before auth.setup)
  // SOLUTION: Move fullyParallel to chromium project only (setup projects run sequentially)
  // Tests within chromium project still run in parallel (3 workers)
  fullyParallel: false, // Disabled globally - only enabled for chromium project
  forbidOnly: true, // Prevent .only in CI
  retries: 2, // Retry flaky tests for transient failures
  workers: 3, // Parallel execution for GitHub Actions hosted runners

  reporter: [
    ['blob', { outputDir: 'blob-report' }], // REQUIRED for sharded test report merging - Nx handles workspace root
    ['github'], // GitHub Actions annotations (first for faster feedback)
    ['html', { outputFolder: 'dist/playwright-report', open: 'never' }],
    ['junit', { outputFile: 'dist/test-results/results.xml' }],
    ['json', { outputFile: 'dist/test-results/results.json' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'https://staging.ectropy.ai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000, // Increased to 20s for CI reliability
    navigationTimeout: 60000, // Increased to 60s for staging + CI latency

    // CI specific browser args for stability
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
      ],
    },
  },

  // CI: Setup project for authentication + validation + test execution
  // ROOT CAUSE FIX (2026-02-13): Add auth validation step to fail fast on invalid auth state
  projects: [
    // Setup project - authenticates once and saves state
    // NOTE: OAuth may fail in CI due to Google bot detection
    // Set CI_OAUTH_BYPASS=true to skip OAuth and test public endpoints only
    {
      name: 'setup',
      testMatch: /\/auth\.setup\.ts$/, // ROOT CAUSE FIX #2: Require slash before filename (not just ending)
      retries: 1, // Reduced from 3 - OAuth failures are deterministic (bot detection)
      timeout: 90000, // 90 seconds timeout for complete OAuth flow
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'on', // Capture screenshots even on success
        trace: 'on', // Capture full trace for debugging
        video: 'on', // Record video of auth flow
      },
    },

    // ROOT CAUSE FIX (2026-02-13): Validation project - ensures auth state is valid
    // FAIL FAST: Hard failure if cookies not set, prevents 10 obscure test failures
    // Reference: .roadmap/FIVE_WHY_E2E_AUTH_STAGING_FAILURES_2026-02-13.json
    {
      name: 'validate-auth',
      testMatch: /\/validate-auth\.setup\.ts$/, // ROOT CAUSE FIX #2: Require slash before filename
      retries: 0, // No retries - validation failure indicates auth setup problem
      timeout: 30000, // 30 seconds - validation is fast (just reads file)
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'], // Run AFTER auth setup
    },

    // Test execution - uses VALIDATED auth state
    // Dependencies ensure auth is created AND validated before tests run
    {
      name: 'chromium',
      // ROOT CAUSE FIX (2026-02-13): Enable fullyParallel ONLY for test execution (not setup)
      // This ensures setup projects run sequentially while tests run in parallel
      fullyParallel: true, // Enable parallel execution for tests (not setup)
      use: {
        ...devices['Desktop Chrome'],
        // Load authentication state from setup
        // ENTERPRISE FIX (2025-12-25): Path resolution corrected for Nx workspace execution
        // Nx executor runs from workspace root, so path must be workspace-root-relative
        // Previous: '../web-dashboard-e2e/...' (INCORRECT - goes up from workspace root)
        // Current: 'apps/web-dashboard-e2e/...' (CORRECT - workspace-root-relative)
        // Matches auth.setup.ts output: apps/web-dashboard-e2e/playwright/.auth/user.json
        storageState: 'apps/web-dashboard-e2e/playwright/.auth/user.json',
      },
      dependencies: ['setup', 'validate-auth'], // Run setup AND validation first
    },
  ],

  // CI: No webServer (tests against remote staging environment)
  // BASE_URL environment variable used instead
});
