import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Playwright Configuration for Docker Development Environment
 *
 * This configuration extends the base Playwright config but disables the webServer
 * to use the existing Docker containers running on localhost.
 *
 * Docker Environment:
 * - nginx: localhost:80 (main entry point)
 * - web-dashboard: localhost:3000 (proxied via nginx)
 * - api-gateway: localhost:4000 (proxied via nginx /api)
 * - mcp-server: localhost:3001-3002 (proxied via nginx /mcp)
 *
 * Usage:
 *   pnpm exec playwright test --config=playwright.docker.config.ts
 *   pnpm exec playwright test --config=playwright.docker.config.ts --ui
 *   pnpm exec playwright test tests/playwright/basic.spec.ts --config=playwright.docker.config.ts
 *
 * Prerequisites:
 *   docker-compose up -d  # Ensure all containers are running
 *   docker ps            # Verify containers are healthy
 */
export default defineConfig({
  ...baseConfig,

  // ENTERPRISE FIX (2026-01-01): Support PLAYWRIGHT_BASE_URL for multi-environment testing
  // Enables testing against dev (146.190.42.28), staging (staging.ectropy.ai), or local Docker
  // Aligns with playwright.config.ts pattern (no shortcuts, enterprise standards)
  // Examples:
  //   Local Docker:  PLAYWRIGHT_BASE_URL=http://localhost pnpm test:p0
  //   Dev Server:    PLAYWRIGHT_BASE_URL=http://146.190.42.28 pnpm test:p0
  //   Staging:       PLAYWRIGHT_BASE_URL=https://staging.ectropy.ai pnpm test:p0
  use: {
    ...baseConfig.use,
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.BASE_URL ||
      'http://localhost',
  },

  // Disable webServer - Docker containers already running
  webServer: undefined,

  // Shorter timeout for local development (containers are fast)
  timeout: 60000, // 1 minute (vs 3 minutes for CI)

  // No retries for local development (fail fast)
  retries: 0,

  // Use all available CPU cores for faster local execution
  workers: undefined,

  // Better reporter for local development
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/docker-report', open: 'never' }],
  ],

  // Override global test setup (not needed for Docker)
  globalSetup: undefined,
});
