import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 60000, // Increase from default 30s to 60s for stability
  // Optimize parallel execution for CI
  workers: process.env.CI ? 2 : undefined,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: process.env.CI 
      ? 'bash scripts/start-web-optimized.sh' 
      : 'nx run web-dashboard:serve',
    port: 4200,
    reuseExistingServer: !process.env.CI,
    timeout: 180000, // 3 minutes for CI stability
    env: {
      NODE_ENV: 'development',
      CI: process.env.CI || 'false'
    }
  },
  use: {
    // Global settings for better stability
    actionTimeout: 15000, // Increase action timeout from default 5s
    navigationTimeout: 30000, // Increase navigation timeout
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  retries: process.env.CI ? 2 : 0, // Retry failed tests in CI
});
//# sourceMappingURL=playwright.config.js.map
