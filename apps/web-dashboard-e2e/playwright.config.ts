import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 180000, // 3 minutes for complex construction app tests
  expect: {
    timeout: 30000, // 30 seconds for assertions
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000, // 15s for actions (OAuth redirects can be slow)
    navigationTimeout: 10000, // Reduced from 30s default to avoid long waits

    // Optional: Add authentication headers if API token is provided
    extraHTTPHeaders: process.env.STAGING_API_TOKEN
      ? {
          Authorization: `Bearer ${process.env.STAGING_API_TOKEN}`,
        }
      : {},

    // OAuth configuration is managed through environment variables:
    // - GOOGLE_CLIENT_ID: OAuth client ID for Google authentication
    // - GOOGLE_CLIENT_SECRET: OAuth client secret for Google authentication
    // - TEST_GOOGLE_EMAIL: Google account email for test user
    // - TEST_GOOGLE_PASSWORD: Password for test Google account
  },

  projects: [
    // Setup project - runs FIRST to authenticate via OAuth
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
      timeout: 180000, // 3 minutes for OAuth flow
    },

    // ROOT CAUSE #85 FIX: Split projects into authenticated vs unauthenticated
    // Tests that require unauthenticated state (login pages, OAuth flows, public endpoints)
    // must run in clean browser contexts without session cookies

    // Unauthenticated test projects - NO auth state, NO setup dependency
    {
      name: 'unauthenticated-chromium',
      testMatch: /.*\/(oauth-login|public-endpoints)\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        // NO storageState - clean browser context for unauthenticated tests
      },
      // NO dependencies - run independently without waiting for auth setup
    },
    {
      name: 'unauthenticated-firefox',
      testMatch: /.*\/(oauth-login|public-endpoints)\.spec\.ts$/,
      use: {
        ...devices['Desktop Firefox'],
        // NO storageState - clean browser context for unauthenticated tests
      },
      // NO dependencies - run independently without waiting for auth setup
    },
    {
      name: 'unauthenticated-webkit',
      testMatch: /.*\/(oauth-login|public-endpoints)\.spec\.ts$/,
      use: {
        ...devices['Desktop Safari'],
        // NO storageState - clean browser context for unauthenticated tests
      },
      // NO dependencies - run independently without waiting for auth setup
    },

    // Authenticated test projects - WITH auth state, WITH setup dependency
    {
      name: 'authenticated-chromium',
      testIgnore: /.*\/(oauth-login|public-endpoints)\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        // Load saved auth state from setup
        storageState: 'apps/web-dashboard-e2e/playwright/.auth/user.json',
      },
      dependencies: ['setup'], // Wait for auth setup to complete
    },
    {
      name: 'authenticated-firefox',
      testIgnore: /.*\/(oauth-login|public-endpoints)\.spec\.ts$/,
      use: {
        ...devices['Desktop Firefox'],
        // Load saved auth state from setup
        storageState: 'apps/web-dashboard-e2e/playwright/.auth/user.json',
      },
      dependencies: ['setup'], // Wait for auth setup to complete
    },
    {
      name: 'authenticated-webkit',
      testIgnore: /.*\/(oauth-login|public-endpoints)\.spec\.ts$/,
      use: {
        ...devices['Desktop Safari'],
        // Load saved auth state from setup
        storageState: 'apps/web-dashboard-e2e/playwright/.auth/user.json',
      },
      dependencies: ['setup'], // Wait for auth setup to complete
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm nx serve web-dashboard',
        url: 'http://localhost:4200',
        reuseExistingServer: !process.env.CI,
        timeout: 120000, // 2 minutes for web server startup
      },
});
