import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config.base';

/**
 * PLAYWRIGHT CONFIGURATION - PRODUCTION ENVIRONMENT
 *
 * Configuration for production smoke tests ONLY.
 * Runs fast health checks after deployment - NOT full E2E suite.
 *
 * ⚠️  IMPORTANT: Only smoke tests should run against production!
 * Full E2E tests belong in staging environment.
 *
 * Usage:
 *   PLAYWRIGHT_ENV=production pnpm test:smoke:production
 *
 * Infrastructure:
 *   - URL: https://ectropy.ai
 *   - Servers: DigitalOcean blue/green (load balanced)
 *     - Blue: 161.35.226.36
 *     - Green: 143.198.231.147
 *   - Load Balancer: 134.199.141.39
 *   - Database: PostgreSQL 17 (managed cluster)
 *   - Auth: Production OAuth only
 *   - SSL: Valid certificate
 *
 * Test Scope (SMOKE TESTS ONLY):
 *   ✅ Load balancer health (/lb-health)
 *   ✅ API Gateway health (/api/health)
 *   ✅ MCP Server health (/health)
 *   ✅ SSL certificate validity
 *   ✅ DNS resolution
 *   ✅ OAuth callback routing
 *   ✅ Critical endpoint response times
 *   ❌ NO full E2E tests (use staging for that)
 *   ❌ NO database writes
 *   ❌ NO user-facing destructive actions
 */
export default defineConfig({
  ...baseConfig,

  // PRODUCTION: Only run smoke tests
  testDir: './tests/smoke/production',

  use: {
    ...baseConfig.use,

    // Production environment base URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://ectropy.ai',

    // Production: Always headless
    headless: true,

    // Production: Strict HTTPS (no self-signed certificates)
    ignoreHTTPSErrors: false,

    // Production: No screenshots/videos (smoke tests should pass)
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },

  // Production: Chromium only (fastest, most reliable)
  projects: [baseConfig.projects![0]], // Only chromium

  // No web server for production (already deployed)
  webServer: undefined,

  // Production: Strict timeout (smoke tests should be fast)
  timeout: 120000, // 2min max per test (smoke tests should be < 30s)

  // Production: No retries (if smoke test fails, deployment should rollback)
  retries: 0,

  // Production: Fail fast (stop on first failure)
  fullyParallel: false,

  // Production: Workers = 1 (sequential smoke tests)
  workers: 1,

  // Production: Simple reporting (success/failure only)
  reporter: [
    ['list'], // Console output
    ['json', { outputFile: 'test-results/production-smoke-results.json' }],
  ],
});
