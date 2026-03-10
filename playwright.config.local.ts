import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.base';

/**
 * PLAYWRIGHT CONFIGURATION - LOCAL ENVIRONMENT
 *
 * Configuration for local development testing.
 * Targets localhost with docker-compose infrastructure.
 *
 * Usage:
 *   PLAYWRIGHT_ENV=local pnpm test:e2e
 *   # OR
 *   pnpm test:e2e:local
 *
 * Infrastructure:
 *   - Web Dashboard: http://localhost:3000
 *   - API Gateway: http://localhost:4000
 *   - MCP Server: http://localhost:3001-3002
 *   - Speckle: http://localhost:3100
 *   - Database: PostgreSQL (docker-compose)
 *   - Redis: Redis (docker-compose)
 */
export default defineConfig({
  ...baseConfig,

  use: {
    ...baseConfig.use,

    // Local environment base URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Local development uses headed mode for debugging
    headless: process.env.CI ? true : false,

    // Slower action speed for local debugging
    slowMo: process.env.DEBUG ? 100 : 0,
  },

  // Local development: Show browser for debugging
  // CI: Headless execution
  projects: baseConfig.projects,

  // Web server configuration (start app before tests)
  webServer: process.env.SKIP_WEBSERVER
    ? undefined
    : {
        command: 'docker-compose -f docker-compose.development.yml up',
        port: 3000,
        timeout: 120000, // 2 minutes to start docker-compose stack
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
