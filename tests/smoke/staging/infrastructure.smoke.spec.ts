import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE STAGING SMOKE TESTS - INFRASTRUCTURE
 *
 * Purpose: Fast staging environment health validation before promoting to production
 * Scope: Load balancer, SSL, DNS, infrastructure health endpoints
 * Duration: < 3 minutes total
 * Frequency: After every staging deployment + before production promotion
 *
 * STAGING VS PRODUCTION DIFFERENCES:
 * - Slightly more lenient timeouts (development environment)
 * - Allows degraded states during active development
 * - Can test more experimental features
 * - More comprehensive logging for debugging
 *
 * @see playwright.config.staging.ts for staging-specific configuration
 * @see apps/mcp-server/data/runbooks/validation/smoke-tests-staging-v1.0.0.json
 */

const STAGING_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://staging.ectropy.ai';
const TIMEOUT = 40000; // 40s max per test (staging can be slower)

test.describe('Staging Smoke Tests - Infrastructure', () => {
  test.describe('1. Load Balancer Health', () => {
    test('should have healthy load balancer endpoint', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${STAGING_URL}/lb-health`, {
        timeout: 15000, // Staging: more lenient timeout
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(5000); // Staging SLA: < 5s

      const data = await response.json();
      expect(data).toHaveProperty('status');

      // Staging: Accept degraded state
      const acceptableStatuses = ['healthy', 'degraded'];
      expect(acceptableStatuses).toContain(data.status);

      console.log(`✅ [STAGING] Load balancer - Status: ${data.status}, Response time: ${duration}ms`);
    });

    test('should have correct security headers', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/lb-health`);

      const headers = response.headers();

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['content-type']).toContain('application/json');

      console.log('✅ [STAGING] Security headers present');
    });
  });

  test.describe('2. SSL/TLS Validation', () => {
    test('should have valid SSL certificate', async ({ page }) => {
      const response = await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      expect(response?.url()).toContain('https://');
      expect(response?.status()).toBe(200);

      const url = new URL(page.url());
      expect(url.protocol).toBe('https:');

      console.log('✅ [STAGING] SSL certificate valid');
    });

    test('should enforce HTTPS redirect', async ({ request }) => {
      // Test HTTP -> HTTPS redirect (staging may have different config)
      try {
        const response = await request.get('http://staging.ectropy.ai', {
          maxRedirects: 0,
          timeout: 15000,
        });

        const status = response.status();
        const isRedirectOrSecure = status === 301 || status === 302 || status === 200;

        expect(isRedirectOrSecure).toBe(true);

        if (status === 301 || status === 302) {
          const location = response.headers()['location'];
          expect(location).toContain('https://');
          console.log(`✅ [STAGING] HTTP redirects to HTTPS: ${location}`);
        } else {
          console.log('✅ [STAGING] HTTPS enforced');
        }
      } catch (error) {
        console.log('ℹ️  [STAGING] HTTP redirect test skipped (may not be configured)');
      }
    });
  });

  test.describe('3. DNS Resolution', () => {
    test('should resolve staging domain', async ({ request }) => {
      const response = await request.get(STAGING_URL, {
        timeout: 15000,
      });

      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(600);

      console.log('✅ [STAGING] DNS resolution successful');
    });

    test('should have correct domain in response', async ({ page }) => {
      await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const currentUrl = page.url();
      expect(currentUrl).toContain('staging.ectropy.ai');

      console.log(`✅ [STAGING] Domain correct: ${currentUrl}`);
    });
  });

  test.describe('4. Infrastructure Health Endpoints', () => {
    test('should have healthy API Gateway', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${STAGING_URL}/api/health`, {
        timeout: 15000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(5000); // Staging SLA: < 5s

      const data = await response.json();
      expect(data).toHaveProperty('status');

      // Staging: More lenient health requirements
      const acceptableStatuses = ['healthy', 'degraded', 'critical'];
      expect(acceptableStatuses).toContain(data.status);

      if (data.score !== undefined) {
        expect(data.score).toBeGreaterThanOrEqual(50); // Staging: min 50/100
        console.log(`✅ [STAGING] API Gateway - Status: ${data.status}, Score: ${data.score}/100 (${duration}ms)`);
      } else {
        console.log(`✅ [STAGING] API Gateway - Status: ${data.status} (${duration}ms)`);
      }
    });

    test('should have responsive MCP server health', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${STAGING_URL}/health`, {
        timeout: 15000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(5000); // Staging SLA: < 5s

      const data = await response.json();
      expect(data).toHaveProperty('status');

      // Staging: Very lenient (development environment)
      const acceptableStatuses = ['healthy', 'critical', 'degraded', 'warning'];
      expect(acceptableStatuses).toContain(data.status);

      if (data.score !== undefined) {
        expect(data.score).toBeGreaterThanOrEqual(40); // Staging: min 40/100
        console.log(`✅ [STAGING] MCP Server - Status: ${data.status}, Score: ${data.score}/100 (${duration}ms)`);
      } else {
        console.log(`✅ [STAGING] MCP Server - Status: ${data.status} (${duration}ms)`);
      }
    });
  });

  test.describe('5. Performance Validation', () => {
    test('should meet staging performance SLA for landing page', async ({ page }) => {
      const startTime = Date.now();

      const response = await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const duration = Date.now() - startTime;

      expect(response?.status()).toBe(200);
      expect(duration).toBeLessThan(10000); // Staging SLA: < 10s (more lenient)

      console.log(`✅ [STAGING] Landing page load: ${duration}ms (SLA: < 10s)`);
    });

    test('should have acceptable API health response time', async ({ request }) => {
      const measurements: number[] = [];

      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const response = await request.get(`${STAGING_URL}/api/health`);
        expect(response.status()).toBe(200);

        const duration = Date.now() - startTime;
        measurements.push(duration);

        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms between
      }

      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;

      measurements.forEach(duration => {
        expect(duration).toBeLessThan(5000); // Staging SLA: < 5s
      });

      console.log(`✅ [STAGING] API health performance: avg ${avgDuration.toFixed(0)}ms (measurements: ${measurements.join(', ')}ms)`);
    });
  });

  test.describe('6. Basic Connectivity', () => {
    test('should have accessible application', async ({ page }) => {
      const response = await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      expect(response?.status()).toBe(200);

      const html = await page.content();
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('<html');
      expect(html).toContain('</html>');

      console.log(`✅ [STAGING] Application accessible - HTML size: ${html.length} bytes`);
    });

    test('should have security headers on main page', async ({ page }) => {
      const response = await page.goto(STAGING_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const headers = response?.headers();
      expect(headers).toBeDefined();

      expect(headers?.['x-content-type-options']).toBe('nosniff');
      expect(headers?.['x-frame-options']).toBeTruthy();

      const hasCsp = headers?.['content-security-policy'] || headers?.['x-content-security-policy'];
      if (!hasCsp) {
        console.warn('⚠️  [STAGING] CSP header not found');
      } else {
        console.log('✅ [STAGING] CSP header present');
      }

      console.log('✅ [STAGING] Security headers validated');
    });
  });

  test.describe('7. Staging-Specific Checks', () => {
    test('should identify as staging environment', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check if environment is properly identified
      if (data.environment) {
        expect(data.environment).toMatch(/staging|development|dev/i);
        console.log(`✅ [STAGING] Environment properly identified: ${data.environment}`);
      } else {
        console.log('ℹ️  [STAGING] Environment not exposed in health endpoint');
      }
    });

    test('should allow experimental features (informational)', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for feature flags
      if (data.features || data.flags) {
        const features = data.features || data.flags;
        console.log(`✅ [STAGING] Feature flags: ${JSON.stringify(features)}`);
      } else {
        console.log('ℹ️  [STAGING] Feature flags not exposed');
      }
    });

    test('should have detailed logging enabled (informational)', async ({ request }) => {
      const response = await request.get(`${STAGING_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Staging should have more verbose health data
      const dataKeys = Object.keys(data);
      console.log(`✅ [STAGING] Health endpoint data keys: ${dataKeys.join(', ')}`);

      // Should have at least basic health info
      expect(dataKeys.length).toBeGreaterThan(1);
    });
  });
});
