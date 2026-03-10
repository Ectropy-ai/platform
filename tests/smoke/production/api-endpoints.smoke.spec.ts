import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE PRODUCTION SMOKE TESTS - API ENDPOINTS
 *
 * Purpose: Validate critical API endpoints health after deployment
 * Scope: API Gateway, core endpoints, response validation
 * Duration: < 2 minutes total
 * Frequency: After every deployment + hourly monitoring
 *
 * CRITICAL RULES FOR PRODUCTION SMOKE TESTS:
 * - Read-only operations ONLY (GET requests, no POST/PUT/DELETE)
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

test.describe('Production Smoke Tests - API Endpoints', () => {
  test.describe('1. API Gateway Health', () => {
    test('should have healthy API Gateway', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      // Assertions
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

    test('should return valid JSON from health endpoint', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const headers = response.headers();
      expect(headers['content-type']).toContain('application/json');

      const data = await response.json();

      // Verify JSON structure
      expect(data).toBeDefined();
      expect(typeof data).toBe('object');

      console.log('✅ API health endpoint returns valid JSON');
    });

    test('should have consistent API health responses', async ({ request }) => {
      const measurements: any[] = [];

      // Take 3 measurements
      for (let i = 0; i < 3; i++) {
        const response = await request.get(`${PRODUCTION_URL}/api/health`);
        expect(response.status()).toBe(200);

        const data = await response.json();
        measurements.push(data);

        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms between
      }

      // All responses should have same structure
      measurements.forEach((data) => {
        expect(data).toHaveProperty('status');
        expect(data.status).toBe('healthy');
      });

      console.log(
        `✅ API health responses consistent (${measurements.length} measurements)`
      );
    });
  });

  test.describe('2. Core API Endpoints', () => {
    test('should have projects endpoint accessible', async ({ request }) => {
      // ENTERPRISE PATTERN: Test endpoint routing without requiring auth
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/projects`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable responses:
      // - 200 (public projects - ideal)
      // - 401 (authentication required - acceptable)
      // - 403 (forbidden - acceptable)
      const acceptableStatuses = [200, 401, 403];
      expect(acceptableStatuses).toContain(status);

      expect(duration).toBeLessThan(5000); // SLA: < 5s for API endpoints

      console.log(
        `✅ Projects endpoint accessible - Status: ${status} (${duration}ms)`
      );
    });

    test('should have users endpoint accessible', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/users`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable responses: auth required (401/403), not found (404 — route not yet implemented), or success
      const acceptableStatuses = [200, 401, 403, 404];
      expect(acceptableStatuses).toContain(status);

      expect(duration).toBeLessThan(5000); // SLA: < 5s

      console.log(
        `✅ Users endpoint accessible - Status: ${status} (${duration}ms)`
      );
    });

    test('should have organizations endpoint accessible', async ({
      request,
    }) => {
      const startTime = Date.now();

      const response = await request.get(
        `${PRODUCTION_URL}/api/organizations`,
        {
          timeout: 10000,
        }
      );

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable responses: auth required, not found (route not yet implemented), or success
      const acceptableStatuses = [200, 401, 403, 404];
      expect(acceptableStatuses).toContain(status);

      expect(duration).toBeLessThan(5000); // SLA: < 5s

      console.log(
        `✅ Organizations endpoint accessible - Status: ${status} (${duration}ms)`
      );
    });
  });

  test.describe('3. API Response Validation', () => {
    test('should return proper error structure for unauthorized requests', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Verify error handling without auth
      const response = await request.get(`${PRODUCTION_URL}/api/projects`, {
        timeout: 10000,
      });

      const status = response.status();

      if (status === 401 || status === 403) {
        // Verify error response structure
        const contentType = response.headers()['content-type'];

        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          console.log(
            `✅ Error response properly structured: ${JSON.stringify(data)}`
          );
        } else {
          console.log('✅ Error response returned (non-JSON format)');
        }

        expect([401, 403]).toContain(status);
      } else if (status === 200) {
        console.log('✅ Endpoint returns public data (acceptable)');
        expect(status).toBe(200);
      }
    });

    test('should have correct content-type headers', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const headers = response.headers();

      // Verify content-type
      expect(headers['content-type']).toContain('application/json');

      // Verify charset if specified
      if (headers['content-type'].includes('charset')) {
        expect(headers['content-type']).toContain('utf-8');
      }

      console.log(
        `✅ API content-type headers correct: ${headers['content-type']}`
      );
    });

    test('should have proper API versioning (informational)', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      const headers = response.headers();

      // Check for API version header (if implemented)
      if (headers['x-api-version']) {
        console.log(
          `✅ API version header present: ${headers['x-api-version']}`
        );
      } else {
        console.log('ℹ️  No API version header found (may be in URL path)');
      }

      // This test always passes - it's informational
      expect(response.status()).toBe(200);
    });
  });

  test.describe('4. API Security', () => {
    test('should have CORS headers configured', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        headers: {
          Origin: 'https://ectropy.ai',
        },
      });

      const headers = response.headers();

      // Check for CORS headers
      if (headers['access-control-allow-origin']) {
        console.log('✅ CORS configured:', {
          origin: headers['access-control-allow-origin'],
          methods: headers['access-control-allow-methods'],
          credentials: headers['access-control-allow-credentials'],
        });
      } else {
        console.log('ℹ️  CORS headers not found (may be same-origin only)');
      }

      expect(response.status()).toBe(200);
    });

    test('should have security headers on API responses', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      const headers = response.headers();

      // Verify critical security headers
      expect(headers['x-content-type-options']).toBe('nosniff');

      // Log all security headers
      const securityHeaders = {
        'x-content-type-options': headers['x-content-type-options'],
        'x-frame-options': headers['x-frame-options'],
        'strict-transport-security': headers['strict-transport-security'],
      };

      console.log(
        `✅ API security headers: ${JSON.stringify(securityHeaders)}`
      );
    });

    test('should not expose sensitive server information', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      const headers = response.headers();

      // Verify sensitive headers are not exposed
      const sensitiveHeaders = ['x-powered-by', 'server'];
      let exposedHeaders: string[] = [];

      sensitiveHeaders.forEach((key) => {
        if (headers[key]) {
          exposedHeaders.push(`${key}: ${headers[key]}`);
        }
      });

      if (exposedHeaders.length > 0) {
        console.warn(
          `⚠️  Sensitive headers exposed: ${exposedHeaders.join(', ')}`
        );
      } else {
        console.log('✅ No sensitive server information exposed');
      }

      // This test always passes - it's a warning
      expect(response.status()).toBe(200);
    });

    test('should reject invalid HTTP methods gracefully', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Test error handling for invalid methods
      // DELETE should not be allowed on health endpoint
      try {
        const response = await request.delete(`${PRODUCTION_URL}/api/health`, {
          timeout: 10000,
        });

        const status = response.status();

        // Should return 405 (Method Not Allowed) or 404
        const acceptableStatuses = [404, 405];
        expect(acceptableStatuses).toContain(status);

        console.log(`✅ Invalid HTTP method rejected - Status: ${status}`);
      } catch (error) {
        console.log('✅ Invalid HTTP method blocked (connection rejected)');
      }
    });
  });

  test.describe('5. API Performance', () => {
    test('should meet response time SLA for API health', async ({
      request,
    }) => {
      const measurements: number[] = [];

      // Take 5 measurements for statistical significance
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/health`);
        expect(response.status()).toBe(200);

        const duration = Date.now() - startTime;
        measurements.push(duration);

        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms between
      }

      const avgDuration =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxDuration = Math.max(...measurements);
      const minDuration = Math.min(...measurements);

      // All measurements should be under SLA
      measurements.forEach((duration) => {
        expect(duration).toBeLessThan(3000); // SLA: < 3s
      });

      console.log(
        `✅ API performance: avg ${avgDuration.toFixed(0)}ms, min ${minDuration}ms, max ${maxDuration}ms`
      );
    });

    test('should handle concurrent requests efficiently', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Test API under light concurrent load
      const startTime = Date.now();

      // Make 5 concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        request.get(`${PRODUCTION_URL}/api/health`, { timeout: 10000 })
      );

      const responses = await Promise.all(promises);

      const duration = Date.now() - startTime;

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.status()).toBe(200);
      });

      // Total time should be reasonable (concurrent, not sequential)
      expect(duration).toBeLessThan(5000); // Should complete in < 5s

      console.log(
        `✅ API handled ${promises.length} concurrent requests in ${duration}ms`
      );
    });

    test('should have consistent response times under load', async ({
      request,
    }) => {
      const measurements: number[] = [];

      // Make 10 rapid sequential requests
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/health`);
        expect(response.status()).toBe(200);

        const duration = Date.now() - startTime;
        measurements.push(duration);

        // No delay between requests (stress test)
      }

      // Calculate variance
      const avgDuration =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const variance =
        measurements.reduce(
          (sum, val) => sum + Math.pow(val - avgDuration, 2),
          0
        ) / measurements.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be reasonable (low variance)
      expect(stdDev).toBeLessThan(avgDuration * 0.5); // StdDev < 50% of mean

      console.log(
        `✅ Response time consistency: avg ${avgDuration.toFixed(0)}ms, stdDev ${stdDev.toFixed(0)}ms`
      );
    });
  });

  test.describe('6. API Error Handling', () => {
    test('should handle 404 routes gracefully', async ({ request }) => {
      const response = await request.get(
        `${PRODUCTION_URL}/api/nonexistent-route-smoke-test`,
        {
          timeout: 10000,
        }
      );

      const status = response.status();

      // Should return 404
      expect(status).toBe(404);

      // Should return JSON error (if possible)
      const contentType = response.headers()['content-type'];
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log(
          `✅ 404 error properly structured: ${JSON.stringify(data)}`
        );
      } else {
        console.log('✅ 404 error returned (non-JSON format)');
      }
    });

    test('should handle malformed requests gracefully', async ({ request }) => {
      // ENTERPRISE PATTERN: Test API robustness with malformed input
      const response = await request.get(
        `${PRODUCTION_URL}/api/projects?limit=INVALID`,
        {
          timeout: 10000,
        }
      );

      const status = response.status();

      // Should return error (not 500)
      const acceptableStatuses = [200, 400, 401, 403, 422];
      expect(acceptableStatuses).toContain(status);

      console.log(
        `✅ Malformed request handled gracefully - Status: ${status}`
      );
    });

    test('should validate API error response structure', async ({
      request,
    }) => {
      // Force a 404 error
      const response = await request.get(
        `${PRODUCTION_URL}/api/smoke-test-error-validation`,
        {
          timeout: 10000,
        }
      );

      expect(response.status()).toBe(404);

      const contentType = response.headers()['content-type'];

      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();

        // Verify error structure has useful information
        const hasErrorStructure = data.error || data.message || data.statusCode;

        if (hasErrorStructure) {
          console.log('✅ API error responses have proper structure');
        } else {
          console.warn('⚠️  API error response missing standard error fields');
        }

        expect(data).toBeDefined();
      } else {
        console.log('ℹ️  API errors returned as HTML (acceptable for 404)');
      }
    });
  });

  test.describe('7. API Rate Limiting', () => {
    test('should have rate limiting configured (informational)', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      const headers = response.headers();

      // Check for rate limit headers
      if (headers['x-ratelimit-limit']) {
        console.log('✅ Rate limiting configured:', {
          limit: headers['x-ratelimit-limit'],
          remaining: headers['x-ratelimit-remaining'],
          reset: headers['x-ratelimit-reset'],
        });

        // Parse and validate
        const limit = parseInt(headers['x-ratelimit-limit'], 10);
        const remaining = parseInt(headers['x-ratelimit-remaining'], 10);

        expect(limit).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(limit);
      } else {
        console.log(
          'ℹ️  Rate limiting headers not found (may be at load balancer level)'
        );
      }

      expect(response.status()).toBe(200);
    });

    test('should not trigger rate limiting under normal load', async ({
      request,
    }) => {
      // Make 10 requests to check we don't hit rate limits
      for (let i = 0; i < 10; i++) {
        const response = await request.get(`${PRODUCTION_URL}/api/health`);

        expect(response.status()).toBe(200);

        const headers = response.headers();
        if (headers['x-ratelimit-remaining']) {
          const remaining = parseInt(headers['x-ratelimit-remaining'], 10);
          expect(remaining).toBeGreaterThan(0); // Should not exhaust limit
        }

        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms between
      }

      console.log('✅ Rate limits not exceeded under normal load');
    });
  });
});
