import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['html'],
        ['json', { outputFile: 'test-results/results.json' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
        ['github'],  // GitHub annotations in CI
      ]
    : [
        ['html'],
        ['json', { outputFile: 'test-results/results.json' }],
        ['junit', { outputFile: 'test-results/junit.xml' }],
      ],
  
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Start webServer for tests unless external URL is provided
  ...(!process.env.PLAYWRIGHT_BASE_URL && {
    webServer: {
      command: 'pnpm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,  // Fresh server in CI, reuse locally
      timeout: 120000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // Set default environment variables for tests
        WEB_DASHBOARD_URL: 'http://localhost:3000',
        API_GATEWAY_URL: 'http://localhost:3001',
        MCP_SERVER_URL: 'http://localhost:3002',
      },
    },
  }),
});
