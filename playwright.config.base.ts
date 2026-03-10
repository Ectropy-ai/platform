import { defineConfig, devices } from '@playwright/test';

/**
 * ENTERPRISE PLAYWRIGHT CONFIGURATION - BASE
 *
 * Shared configuration for all Playwright test environments.
 * Environment-specific configs extend this base configuration.
 *
 * Testing Strategy:
 * - Multi-level retry strategy (test-level, assertion-level, step-level)
 * - Resource isolation (1 worker in CI prevents flakiness)
 * - Comprehensive reporting (GitHub, HTML, JUnit, JSON)
 * - Evidence collection (screenshots, videos, traces on failure)
 *
 * @see tests/README.md for usage documentation
 * @see playwright.config.local.ts for local development
 * @see playwright.config.staging.ts for staging environment
 * @see playwright.config.production.ts for production smoke tests
 */
export default defineConfig({
  // Test directory (all Playwright tests)
  testDir: './tests',

  // ENTERPRISE: Realistic timeouts for complex construction workflows
  timeout: 180000, // 3min per test (BIM viewer loading can be slow)

  expect: {
    // ENTERPRISE: Auto-retry assertions until timeout
    timeout: 30000, // 30s for assertions with built-in retries
  },

  // ENTERPRISE: Browser matrix (Chromium, Firefox, WebKit)
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  use: {
    // Global action timeout
    actionTimeout: 30000, // 30s for actions (click, fill, etc.)

    // Global navigation timeout
    navigationTimeout: 60000, // 60s for page navigation

    // ENTERPRISE: Capture evidence for debugging (only on failure to save space)
    screenshot: 'only-on-failure',
    video: 'on-first-retry', // Video only on retry to see what went wrong
    trace: 'on-first-retry', // Trace viewer for detailed debugging on retry

    // CI-specific browser launch options
    ...(process.env.CI && {
      launchOptions: {
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
  retries: process.env.CI ? 2 : 0, // 2 retries in CI for temporary failures

  // ENTERPRISE: Resource isolation for reliability
  workers: process.env.CI ? 1 : undefined, // Single worker prevents resource contention on runners
  fullyParallel: false, // Sequential execution prevents database race conditions

  // ENTERPRISE: Comprehensive reporting
  reporter: process.env.CI
    ? [
        ['github'], // GitHub Actions annotations
        ['html', { outputFolder: 'test-results/playwright-html', open: 'never' }],
        ['junit', { outputFile: 'test-results/playwright/junit-results.xml' }],
        ['json', { outputFile: 'test-results/playwright/test-results.json' }],
      ]
    : [['html'], ['list']],

  // Global setup/teardown
  // Note: Environment-specific configs can override these
  globalSetup: undefined,
  globalTeardown: undefined,
});
