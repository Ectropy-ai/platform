import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.base';

/**
 * PLAYWRIGHT CONFIGURATION - STAGING ENVIRONMENT
 *
 * Configuration for staging environment testing.
 * Targets staging.ectropy.ai deployed infrastructure.
 *
 * Usage:
 *   PLAYWRIGHT_ENV=staging pnpm test:e2e
 *   # OR
 *   pnpm test:e2e:staging
 *
 * Infrastructure:
 *   - URL: https://staging.ectropy.ai
 *   - Server: DigitalOcean (143.198.154.94)
 *   - Database: PostgreSQL 15 (container)
 *   - Auth: OAuth Test Mode + Production OAuth (whitelisted)
 *   - SSL: Valid certificate
 *
 * Test Scope:
 *   - Full E2E test suite
 *   - Smoke tests
 *   - Integration tests (against deployed services)
 *   - Visual regression tests
 *   - Accessibility tests
 */
export default defineConfig({
  ...baseConfig,

  use: {
    ...baseConfig.use,

    // Staging environment base URL (HTTPS)
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://staging.ectropy.ai',

    // Staging: Always headless
    headless: true,

    // Accept self-signed certificates (if staging uses self-signed)
    ignoreHTTPSErrors: false, // staging has valid cert

    // Staging: Slower network simulation
    // (Optional: Simulate real-world network conditions)
    // networkConditions: { download: 1000, upload: 500 },
  },

  // Staging: Run all browser variants
  projects: baseConfig.projects,

  // No web server for staging (already deployed)
  webServer: undefined,

  // Staging: Longer timeouts for remote server
  timeout: 240000, // 4min per test (remote server can be slower)
});
