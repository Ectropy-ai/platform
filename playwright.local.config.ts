import { defineConfig, devices } from '@playwright/test';

/**
 * Local Playwright Configuration - Production Validation
 * For running tests against local Docker environment (all services running)
 * Usage: npx playwright test --config=playwright.local.config.ts
 *
 * IMPORTANT: Assumes docker-compose up -d is already running
 */
export default defineConfig({
  // Test all directories for comprehensive validation
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/node_modules/**',

  timeout: 60000, // 60s for local Docker environment
  expect: {
    timeout: 10000,
  },

  fullyParallel: false, // Run serially for stability
  forbidOnly: false,
  retries: 1, // Retry once on failure
  workers: 1, // Single worker for local stability

  reporter: [
    ['list', { printSteps: true }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    // Use Docker services (web-dashboard on port 3000, api-gateway on port 4000)
    baseURL: 'http://localhost:3000',

    // API endpoint for integration tests
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Increase timeouts for Docker environment
    actionTimeout: 15000,
    navigationTimeout: 30000,

    headless: true, // Run headless for CI-like behavior
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Use system browser if available
        channel: 'chrome',
      },
    },
  ],

  // Assume Docker services are already running
  // Run: docker-compose up -d before running tests
});
