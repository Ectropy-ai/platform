import { defineConfig, devices } from '@playwright/test';

/**
 * CI-Optimized Playwright Configuration for web-dashboard
 * - Only tests Chromium (80% faster than testing all browsers)
 * - Optimized timeouts and retries for CI
 * - Focus on smoke tests (health checks, basic page loads)
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000, // Increased from 30s to 45s for CI stability
  globalTimeout: 300000, // 5min total suite timeout (prevents indefinite hangs)
  expect: {
    timeout: 10000, // Increased from 5s to 10s - CI can be slower
  },
  fullyParallel: false, // Single worker for stability
  forbidOnly: true,
  retries: 1, // Add 1 retry for transient failures (network, timing issues)
  workers: 1, // Single worker in CI
  
  reporter: [
    ['github'], // GitHub annotations first for faster feedback
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000, // Increased from 15s for CI reliability
    navigationTimeout: 60000, // Increased from 45s - CI environment can be slow
    
    // CI-specific browser args for stability
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

  // CI: Only Chromium (80% faster)
  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
  ],

  // No webServer in CI (assumes external server is running)
  // Environment variables should be set in CI:
  // - WEB_DASHBOARD_URL: URL of running web dashboard
  // - API_GATEWAY_URL: URL of running API gateway
  // - MCP_SERVER_URL: URL of running MCP server
});
