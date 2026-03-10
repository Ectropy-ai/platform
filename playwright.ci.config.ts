import { defineConfig, devices } from '@playwright/test';

/**
 * CI-Optimized Playwright Configuration
 * - Only tests Chromium (80% faster than testing all browsers)
 * - Optimized timeouts for CI environment
 * - Enhanced stability with retries and single worker
 */
export default defineConfig({
  testDir: './tests/playwright',
  timeout: 120000, // 2 minutes for CI stability
  expect: {
    timeout: 15000, // 15 seconds for assertions
  },
  
  // CI optimizations
  fullyParallel: false, // Single worker prevents resource conflicts
  forbidOnly: true, // Prevent .only in CI
  retries: 2, // Retry flaky tests
  workers: 1, // Single worker for CI stability
  
  // CI-specific reporters
  reporter: [
    ['github'], // GitHub Actions annotations
    ['html', { outputFolder: 'reports/performance/test-results', open: 'never' }],
    ['junit', { outputFile: 'reports/performance/test-results/results.xml' }],
    ['json', { outputFile: 'reports/performance/test-results/results.json' }],
  ],
  
  // CI: Only Chromium (80% faster than testing all browsers)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  
  // Web server configuration for CI
  webServer: {
    command: process.env.CI 
      ? 'bash scripts/start-web-optimized.sh' 
      : 'nx run web-dashboard:serve',
    port: 4200,
    reuseExistingServer: !process.env.CI,
    timeout: 180000, // 3 minutes for CI environment startup
    env: {
      NODE_ENV: 'development',
      CI: process.env.CI || 'false',
      NODE_OPTIONS: '--max-old-space-size=4096'
    }
  },
  
  use: {
    // Stability settings for CI
    actionTimeout: 20000, // 20s for actions
    navigationTimeout: 45000, // 45s for navigation
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    
    // Browser launch options for CI stability
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    }
  },
  
  // Global test setup for better error handling
  globalSetup: process.env.CI ? './tests/playwright/global-setup.ts' : undefined,
});
