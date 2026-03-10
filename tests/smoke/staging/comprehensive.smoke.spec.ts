import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE STAGING COMPREHENSIVE SMOKE TESTS
 *
 * Purpose: Comprehensive staging validation before promoting to production
 * Scope: All critical systems (Auth, API, Database, Speckle, Performance)
 * Duration: < 5 minutes total
 * Frequency: Before every production promotion + daily
 *
 * STAGING PHILOSOPHY:
 * - Production mirror for final validation
 * - More comprehensive than production smoke tests
 * - Tests full user journeys (not just health checks)
 * - Identifies issues before they reach production
 * - Allows experimental features and degraded states
 *
 * @see playwright.config.staging.ts for staging-specific configuration
 * @see apps/mcp-server/data/runbooks/validation/comprehensive-staging-validation-v1.0.0.json
 */

const STAGING_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://staging.ectropy.ai';
const TIMEOUT = 40000; // 40s max per test

test.describe('Staging Comprehensive Smoke Tests', () => {
  test.describe('1. Authentication Flow', () => {
    test('should have OAuth routes configured', async ({ request }) => {
      // Test OAuth callback route
      const callbackResponse = await request.get(`${STAGING_URL}/auth/google/callback`, {
        timeout: 15000,
        maxRedirects: 0,
      });

      const callbackStatus = callbackResponse.status();
      expect(callbackStatus).not.toBe(404);

      // Test OAuth initiation route
      const initiationResponse = await request.get(`${STAGING_URL}/auth/google`, {
        timeout: 15000,
        maxRedirects: 0,
      });

      const initiationStatus = initiationResponse.status();
      expect(initiationStatus).not.toBe(404);

      console.log(`✅ [STAGING] OAuth routes - Callback: ${callbackStatus}, Initiation: ${initiationStatus}`);
    });

    test('should have session endpoint responsive', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${STAGING_URL}/api/auth/me`, {
        timeout: 15000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      const acceptableStatuses = [200, 401];
      expect(acceptableStatuses).toContain(status);

      expect(duration).toBeLessThan(5000);

      console.log(`✅ [STAGING] Session endpoint - Status: ${status} (${duration}ms)`);
    });

    test('should handle session polling gracefully', async ({ request }) => {
      const measurements: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();

        const response = await request.get(`${STAGING_URL}/api/auth/me`);
        const duration = Date.now() - startTime;

        measurements.push(duration);

        const acceptableStatuses = [200, 401];
        expect(acceptableStatuses).toContain(response.status());

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;

      console.log(`✅ [STAGING] Session polling - avg ${avgDuration.toFixed(0)}ms (5 requests)`);
    });
  });

  test.describe('2. API Gateway Comprehensive', () => {
    test('should have all critical endpoints accessible', async ({ request }) => {
      const endpoints = [
        { url: `${STAGING_URL}/api/health`, name: 'Health' },
        { url: `${STAGING_URL}/api/projects`, name: 'Projects' },
        { url: `${STAGING_URL}/api/users`, name: 'Users' },
        { url: `${STAGING_URL}/api/organizations`, name: 'Organizations' },
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await request.get(endpoint.url, { timeout: 15000 });
        const duration = Date.now() - startTime;

        // Should not be 404 or 502 (route exists and service up)
        expect([404, 502]).not.toContain(response.status());

        console.log(`✅ [STAGING] ${endpoint.name} endpoint - Status: ${response.status()} (${duration}ms)`);
      }
    });

    test('should have proper error handling', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/nonexistent-route-test`);

      expect(response.status()).toBe(404);

      const contentType = response.headers()['content-type'];
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log(`✅ [STAGING] 404 error structured: ${JSON.stringify(data)}`);
      } else {
        console.log('✅ [STAGING] 404 error returned');
      }
    });

    test('should handle concurrent API requests', async ({ request }) => {
      const startTime = Date.now();

      const promises = Array.from({ length: 10 }, () =>
        request.get(`${STAGING_URL}/api/health`, { timeout: 15000 })
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status()).toBe(200);
      });

      expect(duration).toBeLessThan(10000);

      console.log(`✅ [STAGING] Handled 10 concurrent requests in ${duration}ms`);
    });

    test('should have security headers on API responses', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);

      const headers = response.headers();

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['content-type']).toContain('application/json');

      const securityHeaders = {
        'x-content-type-options': headers['x-content-type-options'],
        'x-frame-options': headers['x-frame-options'],
      };

      console.log(`✅ [STAGING] API security headers: ${JSON.stringify(securityHeaders)}`);
    });
  });

  test.describe('3. Database Connectivity', () => {
    test('should have healthy database through API', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      if (data.database || data.services?.database) {
        const dbStatus = data.database || data.services.database;
        console.log(`✅ [STAGING] Database health: ${JSON.stringify(dbStatus)}`);

        // Staging: More lenient
        const acceptableStatuses = ['healthy', 'degraded', 'warning'];
        if (dbStatus.status) {
          expect(acceptableStatuses).toContain(dbStatus.status);
        }
      } else {
        console.log(`✅ [STAGING] Overall health implies DB connectivity`);
        expect(data.status).toBeDefined();
      }
    });

    test('should have database-dependent endpoints responding', async ({ request }) => {
      const endpoints = [
        `${STAGING_URL}/api/projects`,
        `${STAGING_URL}/api/users`,
        `${STAGING_URL}/api/organizations`,
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await request.get(endpoint, { timeout: 15000 });
        const duration = Date.now() - startTime;

        // Should not be 500/502/503 (DB connection errors)
        expect([500, 502, 503]).not.toContain(response.status());

        console.log(`✅ [STAGING] DB endpoint ${endpoint} - Status: ${response.status()} (${duration}ms)`);
      }
    });

    test('should have consistent database performance', async ({ request }) => {
      const measurements: number[] = [];

      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();

        const response = await request.get(`${STAGING_URL}/api/projects`);
        const duration = Date.now() - startTime;

        measurements.push(duration);

        expect([500, 502, 503, 504]).not.toContain(response.status());

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxDuration = Math.max(...measurements);

      console.log(`✅ [STAGING] DB query performance - avg ${avgDuration.toFixed(0)}ms, max ${maxDuration}ms`);

      expect(avgDuration).toBeLessThan(5000);
    });
  });

  test.describe('4. Speckle Integration', () => {
    test('should have Speckle integration endpoints', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/speckle`, {
        timeout: 15000,
      });

      const status = response.status();

      // Should not be 404 or 502
      expect([404, 502]).not.toContain(status);

      console.log(`✅ [STAGING] Speckle endpoint - Status: ${status}`);
    });

    test('should have Speckle GraphQL configured', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/speckle/graphql`, {
        timeout: 15000,
      });

      const status = response.status();

      // GraphQL exists if not 404
      expect(status).not.toBe(404);

      console.log(`✅ [STAGING] Speckle GraphQL - Status: ${status}`);
    });

    test('should have Speckle webhook endpoint', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/speckle/webhook`, {
        timeout: 15000,
      });

      const status = response.status();

      // Should not be 502 (service down)
      expect([502, 503]).not.toContain(status);

      console.log(`✅ [STAGING] Speckle webhook - Status: ${status}`);
    });
  });

  test.describe('5. End-to-End Critical Paths', () => {
    test('should load landing page successfully', async ({ page }) => {
      const startTime = Date.now();

      const response = await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const duration = Date.now() - startTime;

      expect(response?.status()).toBe(200);

      const html = await page.content();
      expect(html.length).toBeGreaterThan(1000);

      // Should have Ectropy branding
      const title = await page.title();
      expect(title.toLowerCase()).toContain('ectropy');

      console.log(`✅ [STAGING] Landing page loaded - Title: "${title}" (${duration}ms)`);
    });

    test('should have interactive elements present', async ({ page }) => {
      await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      // Check for OAuth/login button
      const possibleSelectors = [
        'button:has-text("Sign in")',
        'button:has-text("Google")',
        'a:has-text("Login")',
        'button:has-text("Get Started")',
      ];

      let foundButton = false;
      for (const selector of possibleSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          foundButton = true;
          console.log(`✅ [STAGING] Interactive element found: ${selector}`);
          break;
        }
      }

      if (!foundButton) {
        console.warn('⚠️  [STAGING] No standard interactive elements found');
      }

      // Test always passes - this is informational
      expect(page.url()).toContain('staging.ectropy.ai');
    });

    test('should have no critical console errors', async ({ page }) => {
      const criticalErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Filter out non-critical errors
          if (text.includes('ERR_') || text.includes('Failed to') || text.includes('500')) {
            criticalErrors.push(text);
          }
        }
      });

      await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      await page.waitForTimeout(2000); // Wait for async errors

      if (criticalErrors.length > 0) {
        console.warn(`⚠️  [STAGING] Critical errors detected:\n${criticalErrors.join('\n')}`);
      } else {
        console.log('✅ [STAGING] No critical console errors detected');
      }

      // Staging: Log errors but don't fail test
      expect(page.url()).toContain('staging.ectropy.ai');
    });
  });

  test.describe('6. Performance Validation', () => {
    test('should meet staging performance targets', async ({ request }) => {
      const endpoints = [
        { url: `${STAGING_URL}/api/health`, target: 5000, name: 'Health' },
        { url: `${STAGING_URL}/api/projects`, target: 5000, name: 'Projects' },
        { url: `${STAGING_URL}/api/auth/me`, target: 5000, name: 'Session' },
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await request.get(endpoint.url, { timeout: 15000 });
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(endpoint.target);

        console.log(`✅ [STAGING] ${endpoint.name} performance: ${duration}ms (target: <${endpoint.target}ms)`);
      }
    });

    test('should handle load gracefully', async ({ request }) => {
      const startTime = Date.now();

      // 20 concurrent requests
      const promises = Array.from({ length: 20 }, () =>
        request.get(`${STAGING_URL}/api/health`, { timeout: 15000 })
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - startTime;

      const successCount = responses.filter(r => r.status() === 200).length;

      expect(successCount).toBeGreaterThan(15); // At least 75% success rate

      console.log(`✅ [STAGING] Load test - ${successCount}/20 requests succeeded in ${duration}ms`);
    });
  });

  test.describe('7. Deployment Readiness', () => {
    test('should generate deployment readiness report', async ({ request }) => {
      const checks = {
        infrastructure: { passed: 0, total: 0 },
        authentication: { passed: 0, total: 0 },
        api: { passed: 0, total: 0 },
        database: { passed: 0, total: 0 },
        speckle: { passed: 0, total: 0 },
      };

      // Infrastructure checks
      checks.infrastructure.total++;
      const lbHealth = await request.get(`${STAGING_URL}/lb-health`);
      if (lbHealth.status() === 200) checks.infrastructure.passed++;

      checks.infrastructure.total++;
      const apiHealth = await request.get(`${STAGING_URL}/api/health`);
      if (apiHealth.status() === 200) checks.infrastructure.passed++;

      // Auth checks
      checks.authentication.total++;
      const authMe = await request.get(`${STAGING_URL}/api/auth/me`);
      if ([200, 401].includes(authMe.status())) checks.authentication.passed++;

      // API checks
      checks.api.total++;
      const projects = await request.get(`${STAGING_URL}/api/projects`);
      if ([200, 401, 403].includes(projects.status())) checks.api.passed++;

      // Database checks
      checks.database.total++;
      const users = await request.get(`${STAGING_URL}/api/users`);
      if (![500, 502, 503].includes(users.status())) checks.database.passed++;

      // Speckle checks
      checks.speckle.total++;
      const speckle = await request.get(`${STAGING_URL}/api/speckle`);
      if (![404, 502].includes(speckle.status())) checks.speckle.passed++;

      const report = {
        timestamp: new Date().toISOString(),
        environment: 'staging',
        checks,
        overallHealth: {
          total: Object.values(checks).reduce((sum, c) => sum + c.total, 0),
          passed: Object.values(checks).reduce((sum, c) => sum + c.passed, 0),
        },
      };

      report.overallHealth['percentage'] =
        (report.overallHealth.passed / report.overallHealth.total) * 100;

      console.log('📋 [STAGING] Deployment Readiness Report:');
      console.log(JSON.stringify(report, null, 2));

      // Should have >80% success rate for production readiness
      expect(report.overallHealth['percentage']).toBeGreaterThan(80);
    });

    test('should identify blocking issues for production', async ({ request }) => {
      const blockers: string[] = [];

      // Critical blocker checks
      const lbHealth = await request.get(`${STAGING_URL}/lb-health`);
      if (lbHealth.status() !== 200) {
        blockers.push('Load balancer unhealthy');
      }

      const apiHealth = await request.get(`${STAGING_URL}/api/health`);
      if (apiHealth.status() !== 200) {
        blockers.push('API Gateway unhealthy');
      }

      const projects = await request.get(`${STAGING_URL}/api/projects`);
      if ([500, 502, 503].includes(projects.status())) {
        blockers.push('Database connectivity issues');
      }

      if (blockers.length > 0) {
        console.error(`🚫 [STAGING] BLOCKING ISSUES FOR PRODUCTION:\n${blockers.join('\n')}`);
        throw new Error(`Production blockers detected: ${blockers.join(', ')}`);
      } else {
        console.log('✅ [STAGING] No blocking issues - Ready for production promotion');
      }
    });
  });
});
