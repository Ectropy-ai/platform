import { defineConfig, devices } from '@playwright/test';

/**
 * ENTERPRISE PLAYWRIGHT CONFIGURATION
 *
 * Multi-Level Retry Strategy (2025 Best Practices):
 * - Test-level retries: 2 attempts for flaky tests
 * - Assertion-level retries: Auto-wait built into expect()
 * - Step-level retries: Use expect().toPass() for complex validations
 *
 * Resilience Features:
 * - Auto-waiting for actionability (visibility, enabled, stable)
 * - Resilient locators (getByRole prioritized)
 * - Network idle handling (skip for polling pages)
 * - Resource isolation (1 worker in CI)
 */
export default defineConfig({
  testDir: './tests/playwright',

  // ENTERPRISE: Realistic timeouts for complex construction workflows
  timeout: 180000, // 3min per test (BIM viewer loading can be slow)

  expect: {
    // ENTERPRISE: Auto-retry assertions until timeout
    timeout: 30000, // 30s for assertions with built-in retries
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  // PHASE 1 FIX: Removed webServer configuration
  // ROOT CAUSE: webServer only started web-dashboard (port 4200)
  // Tests expected API Gateway (port 4000) → 100% failure rate
  // SOLUTION: Use globalSetup to start full docker-compose.test.yml stack
  // See: tests/playwright/global-setup.ts for implementation

  use: {
    // ENTERPRISE FIX (2025-12-10): Point baseURL to web-dashboard (React SPA)
    // API tests use request context (can call any URL)
    // Dashboard tests use page.goto('/') which needs the React app
    // ENTERPRISE FIX (2025-12-15): Support PLAYWRIGHT_BASE_URL for multi-environment testing
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.BASE_URL ||
      'http://localhost:3000',

    // Global settings for better CI stability
    actionTimeout: 30000, // Increase action timeout to 30s for slow CI
    navigationTimeout: 60000, // Increase navigation timeout to 60s
    // ENTERPRISE: Capture evidence for debugging (only on failure to save space)
    screenshot: 'only-on-failure',
    video: 'on-first-retry', // Video only on retry to see what went wrong
    trace: 'on-first-retry', // Trace viewer for detailed debugging on retry

    // Add extra stability settings for CI
    ...(process.env.CI && {
      launchOptions: {
        // Add browser launch options for CI stability
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      },
    }),
  },
  // ENTERPRISE: Multi-level retry strategy
  retries: process.env.CI ? 2 : 0, // 2 retries in CI for temporary failures (not 3 - indicates systematic issue)

  // ENTERPRISE: Resource isolation for reliability
  // ROOT CAUSE FIX (2026-02-12): Increased workers from 1 to 3 in CI
  // Previous: 1 worker = 61 tests × 25s = 25 minutes (timeout at 20 min)
  // New: 3 workers = 61 tests ÷ 3 = ~8-10 minutes
  // GitHub Actions hosted runners can handle parallel execution safely
  workers: process.env.CI ? 3 : undefined,
  fullyParallel: true, // Enable parallel execution - tests are isolated with separate auth sessions

  // ENTERPRISE: Comprehensive reporting
  reporter: process.env.CI
    ? [
        ['github'], // GitHub Actions annotations
        ['html', { outputFolder: 'reports/playwright-html', open: 'never' }], // HTML report with trace viewer
        ['junit', { outputFile: 'reports/playwright/junit-results.xml' }], // JUnit for test management
        ['json', { outputFile: 'reports/playwright/test-results.json' }], // JSON for metrics
      ]
    : [['html'], ['list']],

  // PHASE 1 FIX: Global setup/teardown for docker-compose test infrastructure
  // Starts full stack (postgres, redis, api-gateway, mcp-server, web-dashboard)
  // Works in both CI and local development
  globalSetup: './tests/playwright/global-setup.ts',
  globalTeardown: './tests/playwright/global-teardown.ts',
});
