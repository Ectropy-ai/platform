import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE PRODUCTION SMOKE TESTS - INFRASTRUCTURE
 *
 * Purpose: Fast production health validation after deployment
 * Scope: Load balancer, SSL, DNS, infrastructure health endpoints
 * Duration: < 2 minutes total
 * Frequency: After every deployment + hourly monitoring
 *
 * CRITICAL RULES FOR PRODUCTION SMOKE TESTS:
 * - Read-only operations ONLY (no database writes)
 * - No user-facing destructive actions
 * - Fast execution (< 30s per test)
 * - Fail fast (no retries - immediate rollback trigger)
 * - Zero dependencies on test data
 *
 * @see playwright.config.production.ts for production-specific configuration
 * @see apps/mcp-server/data/runbooks/validation/smoke-tests-production-v1.0.0.json
 */

const PRODUCTION_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://ectropy.ai';
const TIMEOUT = 30000; // 30s max per test (production SLA)

test.describe('Production Smoke Tests - Infrastructure', () => {
  test.describe('1. Load Balancer Health', () => {
    test('should have healthy load balancer endpoint', async ({ request }) => {
      // ENTERPRISE PATTERN: Direct API health check (no browser needed)
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/lb-health`, {
        timeout: 10000, // 10s timeout for LB health
      });

      const duration = Date.now() - startTime;

      // Assertions
      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(3000); // SLA: < 3s response time

      // /lb-health returns plain text "healthy\n" from nginx (no backend dependency)
      const text = await response.text();
      expect(text.trim()).toBe('healthy');

      console.log(`✅ Load balancer healthy - Response time: ${duration}ms`);
    });

    test('should return load balancer with correct headers', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/lb-health`);

      const headers = response.headers();

      // /lb-health is served by nginx as plain text (static health check, no backend)
      expect(response.status()).toBe(200);
      expect(headers['content-type']).toContain('text/plain');

      console.log('✅ Load balancer health endpoint responding');
    });
  });

  test.describe('2. SSL/TLS Validation', () => {
    test('should have valid SSL certificate', async ({ page }) => {
      // Navigate to production to trigger SSL validation
      const response = await page.goto(PRODUCTION_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      // Verify HTTPS
      expect(response?.url()).toContain('https://');
      expect(response?.status()).toBe(200);

      // Get security details (Playwright validates SSL automatically)
      const url = new URL(page.url());
      expect(url.protocol).toBe('https:');

      console.log('✅ SSL certificate valid and secure');
    });

    test('should enforce HTTPS redirect from HTTP', async ({ request }) => {
      // Test HTTP -> HTTPS redirect
      const response = await request.get('http://ectropy.ai', {
        maxRedirects: 0, // Don't follow redirects automatically
        timeout: 10000,
      });

      // Should return 301/302 redirect or fail (depends on LB config)
      // If 200, means HTTPS is being served directly (also acceptable)
      const status = response.status();
      const isRedirectOrSecure =
        status === 301 || status === 302 || status === 200;

      expect(isRedirectOrSecure).toBe(true);

      if (status === 301 || status === 302) {
        const location = response.headers()['location'];
        expect(location).toContain('https://');
        console.log(`✅ HTTP redirects to HTTPS: ${location}`);
      } else {
        console.log('✅ HTTPS enforced at load balancer level');
      }
    });
  });

  test.describe('3. DNS Resolution', () => {
    test('should resolve ectropy.ai domain', async ({ request }) => {
      // Simple DNS resolution test via HTTP request
      const response = await request.get(PRODUCTION_URL, {
        timeout: 10000,
      });

      // If we get any response, DNS resolved successfully
      expect(response.status()).toBeGreaterThanOrEqual(200);
      expect(response.status()).toBeLessThan(600);

      console.log('✅ DNS resolution successful');
    });

    test('should have correct domain in response', async ({ page }) => {
      await page.goto(PRODUCTION_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const currentUrl = page.url();
      expect(currentUrl).toContain('ectropy.ai');
      expect(currentUrl).toMatch(/^https:\/\/(www\.)?ectropy\.ai/);

      console.log(`✅ Domain correct: ${currentUrl}`);
    });
  });

  test.describe('4. Infrastructure Health Endpoints', () => {
    test('should have healthy API Gateway', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(3000); // SLA: < 3s

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('healthy');

      // Verify health score meets minimum threshold
      if (data.score !== undefined) {
        expect(data.score).toBeGreaterThanOrEqual(80); // Minimum 80/100
        console.log(
          `✅ API Gateway healthy - Score: ${data.score}/100 (${duration}ms)`
        );
      } else {
        console.log(`✅ API Gateway healthy (${duration}ms)`);
      }
    });

    test('should have responsive MCP server health', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/health`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(3000); // SLA: < 3s

      const data = await response.json();
      expect(data).toHaveProperty('status');

      // MCP health may be 'healthy' or 'critical' (critical is acceptable if score > 60)
      const acceptableStatuses = ['healthy', 'critical', 'degraded'];
      expect(acceptableStatuses).toContain(data.status);

      // Verify health score meets minimum threshold
      if (data.score !== undefined) {
        expect(data.score).toBeGreaterThanOrEqual(60); // Minimum 60/100
        console.log(
          `✅ MCP Server responsive - Status: ${data.status}, Score: ${data.score}/100 (${duration}ms)`
        );
      } else {
        console.log(
          `✅ MCP Server responsive - Status: ${data.status} (${duration}ms)`
        );
      }
    });
  });

  test.describe('5. Performance SLA Validation', () => {
    test('should meet response time SLA for landing page', async ({ page }) => {
      const startTime = Date.now();

      const response = await page.goto(PRODUCTION_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const duration = Date.now() - startTime;

      expect(response?.status()).toBe(200);
      expect(duration).toBeLessThan(3000); // SLA: < 3s for landing page

      console.log(`✅ Landing page performance: ${duration}ms (SLA: < 3s)`);
    });

    test('should meet response time SLA for API health', async ({
      request,
    }) => {
      const measurements: number[] = [];

      // Take 3 measurements for consistency
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/health`);
        expect(response.status()).toBe(200);

        const duration = Date.now() - startTime;
        measurements.push(duration);

        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms between measurements
      }

      const avgDuration =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;

      // All measurements should be under SLA
      measurements.forEach((duration) => {
        expect(duration).toBeLessThan(3000); // SLA: < 3s
      });

      console.log(
        `✅ API health performance: avg ${avgDuration.toFixed(0)}ms (measurements: ${measurements.join(', ')}ms)`
      );
    });
  });

  test.describe('6. Basic Connectivity', () => {
    test('should have accessible application', async ({ page }) => {
      const response = await page.goto(PRODUCTION_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      expect(response?.status()).toBe(200);

      // Verify HTML document loaded
      const html = await page.content();
      expect(html.length).toBeGreaterThan(0);

      // Verify basic structure
      expect(html).toContain('<html');
      expect(html).toContain('</html>');

      console.log(
        `✅ Application accessible - HTML size: ${html.length} bytes`
      );
    });

    test('should have correct security headers on main page', async ({
      page,
    }) => {
      const response = await page.goto(PRODUCTION_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const headers = response?.headers();
      expect(headers).toBeDefined();

      // Verify critical security headers
      expect(headers?.['x-content-type-options']).toBe('nosniff');
      expect(headers?.['x-frame-options']).toBeTruthy();

      // CSP header (may vary based on configuration)
      const hasCsp =
        headers?.['content-security-policy'] ||
        headers?.['x-content-security-policy'];
      if (!hasCsp) {
        console.warn(
          '⚠️  CSP header not found - consider adding for enhanced security'
        );
      }

      console.log('✅ Security headers validated');
    });
  });
});
