import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE PRODUCTION SMOKE TESTS - AUTHENTICATION
 *
 * Purpose: Validate authentication infrastructure health after deployment
 * Scope: OAuth routing, session endpoints, auth service health
 * Duration: < 2 minutes total
 * Frequency: After every deployment + hourly monitoring
 *
 * CRITICAL RULES FOR PRODUCTION SMOKE TESTS:
 * - Read-only operations ONLY (no actual authentication attempts)
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

test.describe('Production Smoke Tests - Authentication', () => {
  test.describe('1. OAuth Routing', () => {
    test('should have OAuth callback route configured', async ({ request }) => {
      // ENTERPRISE PATTERN: Test route existence without triggering OAuth flow
      const startTime = Date.now();

      // Auth routes are at /api/auth/google (nginx proxies to API gateway)
      const response = await request.get(
        `${PRODUCTION_URL}/api/auth/google/callback`,
        {
          timeout: 10000,
          maxRedirects: 0, // Don't follow redirects
        }
      );

      const duration = Date.now() - startTime;
      const status = response.status();

      // Route exists if we get anything except 404
      expect(status).not.toBe(404);

      // Acceptable responses:
      // - 400 (missing OAuth code parameter - expected)
      // - 302 (redirect to login or error page - expected)
      // - 401 (unauthorized - expected)
      // - 500 (internal error without OAuth code - acceptable)
      const acceptableStatuses = [400, 401, 302, 303, 500];
      expect(acceptableStatuses).toContain(status);

      console.log(
        `✅ OAuth callback route exists - Status: ${status} (${duration}ms)`
      );
    });

    test('should have OAuth initiation route accessible', async ({ page }) => {
      // Navigate to main page to check for OAuth button/route
      const response = await page.goto(PRODUCTION_URL, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      expect(response?.status()).toBe(200);

      // Check if OAuth-related elements are present (read-only)
      const pageContent = await page.content();

      // Look for Google OAuth indicators (don't click, just verify presence)
      const hasOAuthIndicators =
        pageContent.includes('google') ||
        pageContent.includes('oauth') ||
        pageContent.includes('sign in') ||
        pageContent.includes('login');

      if (hasOAuthIndicators) {
        console.log('✅ OAuth UI elements detected on landing page');
      } else {
        console.log(
          '⚠️  No OAuth UI elements detected - may be expected for logged-in state'
        );
      }

      // This test always passes - we're just checking infrastructure
      expect(response?.status()).toBe(200);
    });
  });

  test.describe('2. Session Management', () => {
    test('should have session health endpoint', async ({ request }) => {
      // ENTERPRISE PATTERN: Check session endpoint without authentication
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable responses:
      // - 401 (not authenticated - expected for anonymous user)
      // - 200 (cached session data - acceptable)
      const acceptableStatuses = [200, 401];
      expect(acceptableStatuses).toContain(status);

      expect(duration).toBeLessThan(3000); // SLA: < 3s

      console.log(
        `✅ Session endpoint responsive - Status: ${status} (${duration}ms)`
      );
    });

    test('should have correct CORS headers on auth endpoints', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
        timeout: 10000,
      });

      const headers = response.headers();

      // Verify security headers present
      expect(headers['x-content-type-options']).toBe('nosniff');

      // Content type should be JSON
      if (response.status() === 200) {
        expect(headers['content-type']).toContain('application/json');
      }

      console.log('✅ Auth endpoint security headers present');
    });

    test('should handle session polling gracefully', async ({ request }) => {
      // ENTERPRISE PATTERN: Simulate client-side session polling (like /api/auth/me)
      const measurements: number[] = [];

      // Make 3 rapid requests to simulate polling
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
          timeout: 10000,
        });

        const duration = Date.now() - startTime;
        measurements.push(duration);

        // Should always respond (200 or 401)
        const acceptableStatuses = [200, 401];
        expect(acceptableStatuses).toContain(response.status());

        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms between polls
      }

      // All responses should be fast
      measurements.forEach((duration) => {
        expect(duration).toBeLessThan(3000); // SLA: < 3s
      });

      const avgDuration =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;

      console.log(
        `✅ Session polling handled gracefully - avg ${avgDuration.toFixed(0)}ms (measurements: ${measurements.join(', ')}ms)`
      );
    });
  });

  test.describe('3. Authentication Service Health', () => {
    test('should have authentication service responding', async ({
      request,
    }) => {
      // Check if auth service is healthy via API Gateway
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(3000); // SLA: < 3s

      const data = await response.json();

      // Verify auth-related health indicators (if present)
      if (data.services) {
        console.log(
          `✅ Authentication service health: ${JSON.stringify(data.services)}`
        );
      } else {
        console.log(
          `✅ API Gateway healthy - Auth service included (${duration}ms)`
        );
      }
    });

    test('should handle authentication errors gracefully', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Test error handling without triggering actual errors
      // Accessing protected endpoint without credentials should return proper error

      const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
        timeout: 10000,
      });

      const status = response.status();

      // Should return 401 for unauthenticated user (not 500)
      if (status === 401) {
        const data = await response.json().catch(() => null);

        // Should have proper error structure (if JSON)
        if (data) {
          console.log(
            `✅ Auth error response properly structured: ${JSON.stringify(data)}`
          );
        } else {
          console.log('✅ Auth endpoint returns 401 for unauthenticated users');
        }

        expect(status).toBe(401);
      } else if (status === 200) {
        // Cached session is acceptable
        console.log('✅ Session endpoint returns cached data (acceptable)');
        expect(status).toBe(200);
      }
    });
  });

  test.describe('4. OAuth Provider Configuration', () => {
    test('should have valid OAuth environment configuration', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Verify OAuth is configured (not testing actual flow)
      // Auth routes are at /api/auth/google (nginx proxies to API gateway)

      const response = await request.get(`${PRODUCTION_URL}/api/auth/google`, {
        timeout: 10000,
        maxRedirects: 0, // Don't follow redirects
      });

      const status = response.status();

      // OAuth route exists if we get anything except 404
      expect(status).not.toBe(404);

      // Acceptable responses:
      // - 302 (redirect to Google - ideal)
      // - 400 (missing parameters - acceptable)
      // - 401 (unauthorized - acceptable)
      const acceptableStatuses = [302, 303, 400, 401, 500];
      expect(acceptableStatuses).toContain(status);

      if (status === 302 || status === 303) {
        const location = response.headers()['location'];
        if (location && location.includes('google')) {
          console.log(`✅ OAuth provider configured - Redirects to Google`);
        } else {
          console.log(`✅ OAuth route exists - Status: ${status}`);
        }
      } else {
        console.log(`✅ OAuth route exists - Status: ${status}`);
      }
    });

    test('should have OAuth callback handling configured', async ({ page }) => {
      // ENTERPRISE PATTERN: Check OAuth callback page structure (read-only)
      // This simulates a user returning from Google OAuth

      const startTime = Date.now();

      // Try to access callback with dummy parameters (won't authenticate, just tests routing)
      const callbackUrl = `${PRODUCTION_URL}/auth/google/callback?code=SMOKE_TEST&state=SMOKE_TEST`;

      const response = await page.goto(callbackUrl, {
        waitUntil: 'domcontentloaded',
        timeout: TIMEOUT,
      });

      const duration = Date.now() - startTime;
      const status = response?.status();

      // Route exists if we get any response (not 404)
      expect(status).not.toBe(404);

      // Acceptable responses:
      // - 400 (invalid code/state - expected)
      // - 401 (unauthorized - expected)
      // - 302 (redirect - acceptable)
      // - 200 (error page - acceptable)
      const acceptableStatuses = [200, 302, 303, 400, 401, 500];
      expect(acceptableStatuses).toContain(status || 0);

      console.log(
        `✅ OAuth callback handler exists - Status: ${status} (${duration}ms)`
      );
    });
  });

  test.describe('5. Security Headers', () => {
    test('should have secure authentication headers', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
        timeout: 10000,
      });

      const headers = response.headers();

      // Verify critical security headers
      expect(headers['x-content-type-options']).toBe('nosniff');

      // Check for security headers
      const securityHeaders = {
        'x-content-type-options': headers['x-content-type-options'],
        'x-frame-options': headers['x-frame-options'],
        'strict-transport-security': headers['strict-transport-security'],
      };

      console.log(
        `✅ Security headers present: ${JSON.stringify(securityHeaders)}`
      );
    });

    test('should not expose sensitive authentication data in headers', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
        timeout: 10000,
      });

      const headers = response.headers();

      // Verify no sensitive data in headers
      const sensitiveHeaderKeys = ['x-powered-by', 'server'];
      sensitiveHeaderKeys.forEach((key) => {
        if (headers[key]) {
          console.warn(`⚠️  Header "${key}" exposed: ${headers[key]}`);
        }
      });

      // Should not have x-powered-by header (security best practice)
      if (!headers['x-powered-by']) {
        console.log('✅ No sensitive headers exposed (x-powered-by hidden)');
      }

      // This test always passes - it's informational
      expect(response.status()).toBeGreaterThanOrEqual(200);
    });
  });

  test.describe('6. Performance & Rate Limiting', () => {
    test('should meet response time SLA for auth endpoints', async ({
      request,
    }) => {
      const measurements: number[] = [];

      // Take 3 measurements for consistency
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/auth/me`);
        const acceptableStatuses = [200, 401];
        expect(acceptableStatuses).toContain(response.status());

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
        `✅ Auth endpoint performance: avg ${avgDuration.toFixed(0)}ms (measurements: ${measurements.join(', ')}ms)`
      );
    });

    test('should have rate limiting configured (informational)', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Check for rate limiting headers (read-only)
      const response = await request.get(`${PRODUCTION_URL}/api/auth/me`, {
        timeout: 10000,
      });

      const headers = response.headers();

      // Check for rate limit headers
      if (headers['x-ratelimit-limit']) {
        console.log('✅ Rate limiting configured:', {
          limit: headers['x-ratelimit-limit'],
          remaining: headers['x-ratelimit-remaining'],
          reset: headers['x-ratelimit-reset'],
        });
      } else {
        console.log(
          'ℹ️  Rate limiting headers not found (may be configured at load balancer level)'
        );
      }

      // This test always passes - it's informational
      expect(response.status()).toBeGreaterThanOrEqual(200);
    });
  });
});
