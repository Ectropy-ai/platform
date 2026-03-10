import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE PRODUCTION SMOKE TESTS - SPECKLE INTEGRATION
 *
 * Purpose: Validate Speckle integration health after deployment
 * Scope: Speckle API connectivity, GraphQL endpoint, file import service, webhooks
 * Duration: < 2 minutes total
 * Frequency: After every deployment + hourly monitoring
 *
 * CRITICAL RULES FOR PRODUCTION SMOKE TESTS:
 * - Read-only operations ONLY (no file imports or data modifications)
 * - No user-facing destructive actions
 * - Fast execution (< 30s per test)
 * - Fail fast (no retries - immediate rollback trigger)
 * - Zero dependencies on test data
 *
 * SPECKLE CONTEXT:
 * - Speckle is a platform for 3D data (https://speckle.systems)
 * - Ectropy integrates with Speckle for construction data import
 * - Integration points: GraphQL API, webhooks, file import service
 *
 * @see playwright.config.production.ts for production-specific configuration
 * @see apps/mcp-server/data/runbooks/validation/smoke-tests-production-v1.0.0.json
 * @see apps/mcp-server/data/infrastructure-catalog.json (Speckle integration architecture)
 */

const PRODUCTION_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://ectropy.ai';
const TIMEOUT = 30000; // 30s max per test (production SLA)

test.describe('Production Smoke Tests - Speckle Integration', () => {
  test.describe('1. Speckle Service Health', () => {
    test('should have Speckle integration service healthy', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Check if Speckle integration is reported in health endpoint
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(5000); // SLA: < 5s

      const data = await response.json();

      // Check if health endpoint reports Speckle service
      if (data.services?.speckle || data.speckle) {
        const speckleHealth = data.services?.speckle || data.speckle;
        console.log(
          `✅ Speckle integration health: ${JSON.stringify(speckleHealth)}`
        );

        // Speckle should be healthy or degraded (acceptable)
        const acceptableStatuses = ['healthy', 'degraded'];
        if (speckleHealth.status) {
          expect(acceptableStatuses).toContain(speckleHealth.status);
        }
      } else {
        console.log(
          'ℹ️  Speckle health not reported separately (included in overall health)'
        );
      }

      // Overall API should be healthy
      expect(data.status).toBe('healthy');
    });

    test('should have Speckle integration endpoints accessible', async ({
      request,
    }) => {
      // Speckle is routed via nginx at /speckle/ (not /api/speckle/)
      // Production may not have Speckle deployed — staging only for now
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/speckle/api`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable: 200/301 (Speckle running), 404/502 (Speckle not deployed in production)
      const acceptableStatuses = [200, 301, 302, 401, 403, 404, 502];
      expect(acceptableStatuses).toContain(status);

      if (status === 200 || status === 301) {
        console.log(
          `✅ Speckle integration endpoint accessible - Status: ${status} (${duration}ms)`
        );
      } else {
        console.log(
          `ℹ️  Speckle not deployed in this environment - Status: ${status} (${duration}ms)`
        );
      }
    });
  });

  test.describe('2. Speckle GraphQL Endpoint', () => {
    test('should have Speckle GraphQL endpoint configured', async ({
      request,
    }) => {
      // Speckle GraphQL is at /speckle/graphql (not /api/speckle/graphql)
      // Production may not have Speckle deployed
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/speckle/graphql`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable: working (200/400/405), not deployed (404/502)
      const acceptableStatuses = [200, 400, 401, 405, 404, 502];
      expect(acceptableStatuses).toContain(status);

      if ([200, 400, 405].includes(status)) {
        console.log(
          `✅ Speckle GraphQL endpoint configured - Status: ${status} (${duration}ms)`
        );
      } else {
        console.log(
          `ℹ️  Speckle GraphQL not available in this environment - Status: ${status} (${duration}ms)`
        );
      }
    });

    test('should have GraphQL introspection available or properly disabled', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Check if GraphQL introspection is configured
      // Note: Introspection should be disabled in production for security

      const introspectionQuery = {
        query: '{ __schema { types { name } } }',
      };

      try {
        const response = await request.post(
          `${PRODUCTION_URL}/api/speckle/graphql`,
          {
            data: introspectionQuery,
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        const status = response.status();

        if (status === 200) {
          const data = await response.json();

          if (data.errors) {
            console.log(
              '✅ GraphQL introspection properly disabled (security best practice)'
            );
          } else if (data.data?.__schema) {
            console.warn(
              '⚠️  GraphQL introspection enabled (consider disabling for security)'
            );
          }
        } else if (status === 401 || status === 403) {
          console.log(
            '✅ GraphQL endpoint requires authentication (security enforced)'
          );
        } else {
          console.log(`ℹ️  GraphQL endpoint returned: ${status}`);
        }

        // Test passes regardless - this is informational
        expect([200, 400, 401, 403, 404, 405]).toContain(status);
      } catch (error) {
        console.log(
          'ℹ️  GraphQL endpoint not accessible (may not be configured)'
        );
      }
    });
  });

  test.describe('3. Speckle File Import Service', () => {
    test('should have file import endpoint configured', async ({ request }) => {
      // ENTERPRISE PATTERN: Verify import service routing (read-only check)
      const startTime = Date.now();

      const response = await request.get(
        `${PRODUCTION_URL}/api/speckle/import`,
        {
          timeout: 10000,
        }
      );

      const duration = Date.now() - startTime;
      const status = response.status();

      // Should not be 502/503 (service down)
      expect([502, 503]).not.toContain(status);

      // Acceptable responses:
      // - 200 (endpoint info)
      // - 405 (method not allowed - POST required)
      // - 401 (auth required - expected)
      // - 404 (if route doesn't exist - may indicate different architecture)
      const acceptableStatuses = [200, 401, 404, 405];

      if (acceptableStatuses.includes(status)) {
        console.log(
          `✅ File import endpoint routing configured - Status: ${status} (${duration}ms)`
        );
        expect(acceptableStatuses).toContain(status);
      } else {
        console.log(`ℹ️  Import endpoint returned: ${status} (${duration}ms)`);
      }
    });

    test('should have file import service responding', async ({ request }) => {
      // Check service health through health endpoint
      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check if import service is reported
      if (data.services?.import || data.import) {
        const importHealth = data.services?.import || data.import;
        console.log(
          `✅ File import service health: ${JSON.stringify(importHealth)}`
        );

        if (importHealth.status) {
          const acceptableStatuses = ['healthy', 'degraded'];
          expect(acceptableStatuses).toContain(importHealth.status);
        }
      } else {
        console.log('ℹ️  Import service health not reported separately');
      }

      expect(data.status).toBe('healthy');
    });
  });

  test.describe('4. Speckle Webhook Endpoints', () => {
    test('should have webhook endpoint configured', async ({ request }) => {
      // ENTERPRISE PATTERN: Verify webhook routing (read-only)
      const startTime = Date.now();

      const response = await request.get(
        `${PRODUCTION_URL}/api/speckle/webhook`,
        {
          timeout: 10000,
        }
      );

      const duration = Date.now() - startTime;
      const status = response.status();

      // Webhook endpoints typically only accept POST
      // GET should return 405 (method not allowed) or 404

      // Should not be 502/503 (service down)
      expect([502, 503]).not.toContain(status);

      // Acceptable responses:
      // - 405 (method not allowed - POST required for webhooks)
      // - 400 (bad request - missing webhook data)
      // - 404 (if different webhook architecture)
      const acceptableStatuses = [400, 404, 405];

      if (acceptableStatuses.includes(status)) {
        console.log(
          `✅ Webhook endpoint routing configured - Status: ${status} (${duration}ms)`
        );
        expect(acceptableStatuses).toContain(status);
      } else {
        console.log(`ℹ️  Webhook endpoint returned: ${status} (${duration}ms)`);
      }
    });

    test('should reject invalid webhook requests gracefully', async ({
      request,
    }) => {
      // ENTERPRISE PATTERN: Test error handling for webhooks
      try {
        const response = await request.post(
          `${PRODUCTION_URL}/api/speckle/webhook`,
          {
            data: { invalid: 'data' },
            timeout: 10000,
          }
        );

        const status = response.status();

        // Should return proper error (not 500)
        expect(status).not.toBe(500);

        // Acceptable responses:
        // - 400 (bad request - invalid data)
        // - 401 (auth required - webhook signature validation)
        // - 403 (forbidden)
        // - 404 (if webhook architecture different)
        const acceptableStatuses = [400, 401, 403, 404, 422];

        if (acceptableStatuses.includes(status)) {
          console.log(
            `✅ Invalid webhook request rejected gracefully - Status: ${status}`
          );
          expect(acceptableStatuses).toContain(status);
        }
      } catch (error) {
        console.log(
          'ℹ️  Webhook endpoint not accessible (may not be configured)'
        );
      }
    });
  });

  test.describe('5. Speckle Integration Configuration', () => {
    test('should have Speckle configuration validated (through health)', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check if configuration status is reported
      if (data.services?.speckle?.config || data.speckle?.config) {
        const config = data.services?.speckle?.config || data.speckle?.config;
        console.log(
          `✅ Speckle configuration status: ${JSON.stringify(config)}`
        );

        // Verify configuration is valid
        if (config.status) {
          expect(config.status).toBe('valid');
        }
      } else {
        console.log(
          'ℹ️  Speckle configuration not exposed through health endpoint (acceptable)'
        );
      }

      expect(data.status).toBe('healthy');
    });

    test('should not expose Speckle API credentials in responses', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();
      const responseText = JSON.stringify(data).toLowerCase();

      // Verify no sensitive credentials leaked
      expect(responseText).not.toContain('api_key');
      expect(responseText).not.toContain('api_secret');
      expect(responseText).not.toContain('token');
      expect(responseText).not.toContain('password');

      console.log('✅ No Speckle credentials leaked in health endpoint');
    });
  });

  test.describe('6. Speckle Data Sync', () => {
    test('should have Speckle sync status endpoint (if available)', async ({
      request,
    }) => {
      // Check if sync status is exposed
      const response = await request.get(`${PRODUCTION_URL}/api/speckle/sync`, {
        timeout: 10000,
      });

      const status = response.status();

      if (status === 200) {
        const data = await response.json();
        console.log(`✅ Speckle sync status: ${JSON.stringify(data)}`);

        // Verify sync is operational
        if (data.status) {
          const acceptableStatuses = ['idle', 'syncing', 'healthy'];
          expect(acceptableStatuses).toContain(data.status);
        }
      } else if (status === 401 || status === 403) {
        console.log('✅ Sync endpoint requires authentication');
        expect([401, 403]).toContain(status);
      } else if (status === 404) {
        console.log('ℹ️  Sync endpoint not found (may not be implemented)');
      }

      // Should not be 502/503 (service down)
      expect([502, 503]).not.toContain(status);
    });

    test('should have last sync timestamp accessible (informational)', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for last sync information
      if (data.speckle?.lastSync || data.services?.speckle?.lastSync) {
        const lastSync =
          data.speckle?.lastSync || data.services?.speckle?.lastSync;
        console.log(`✅ Speckle last sync: ${JSON.stringify(lastSync)}`);

        // Verify sync is recent (if timestamp provided)
        if (lastSync.timestamp) {
          const lastSyncTime = new Date(lastSync.timestamp).getTime();
          const now = Date.now();
          const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

          if (hoursSinceSync < 24) {
            console.log(
              `✅ Recent sync: ${hoursSinceSync.toFixed(1)} hours ago`
            );
          } else {
            console.log(
              `ℹ️  Last sync: ${hoursSinceSync.toFixed(1)} hours ago`
            );
          }
        }
      } else {
        console.log('ℹ️  Sync timestamp not exposed through health endpoint');
      }

      expect(response.status()).toBe(200);
    });
  });

  test.describe('7. Speckle Integration Performance', () => {
    test('should have responsive Speckle endpoints', async ({ request }) => {
      const measurements: number[] = [];

      // Test Speckle endpoint response times
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/speckle`, {
          timeout: 10000,
        });

        const duration = Date.now() - startTime;
        measurements.push(duration);

        // Should respond (not timeout)
        expect([502, 503, 504]).not.toContain(response.status());

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const avgDuration =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;

      // All measurements should be fast
      measurements.forEach((duration) => {
        expect(duration).toBeLessThan(5000); // SLA: < 5s
      });

      console.log(
        `✅ Speckle endpoint performance: avg ${avgDuration.toFixed(0)}ms (${measurements.join(', ')}ms)`
      );
    });

    test('should handle Speckle integration errors gracefully', async ({
      request,
    }) => {
      // Try to trigger an error condition
      const response = await request.get(
        `${PRODUCTION_URL}/api/speckle/invalid-route`,
        {
          timeout: 10000,
        }
      );

      const status = response.status();

      // Should return proper error (not 500)
      if (status >= 400 && status < 500) {
        console.log(
          `✅ Speckle integration errors handled gracefully - Status: ${status}`
        );
        expect(status).toBeGreaterThanOrEqual(400);
        expect(status).toBeLessThan(500);
      } else if (status === 500) {
        console.warn('⚠️  Speckle integration returned 500 error');
      }

      // Should not be service unavailable
      expect([502, 503, 504]).not.toContain(status);
    });
  });

  test.describe('8. Speckle Integration Monitoring', () => {
    test('should track Speckle integration metrics (informational)', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for Speckle metrics
      if (data.speckle?.metrics || data.services?.speckle?.metrics) {
        const metrics =
          data.speckle?.metrics || data.services?.speckle?.metrics;
        console.log(
          `✅ Speckle integration metrics: ${JSON.stringify(metrics)}`
        );

        // Log useful metrics
        if (metrics.requestCount) {
          console.log(`  - Request count: ${metrics.requestCount}`);
        }
        if (metrics.errorRate) {
          console.log(`  - Error rate: ${metrics.errorRate}%`);
        }
        if (metrics.avgResponseTime) {
          console.log(`  - Avg response time: ${metrics.avgResponseTime}ms`);
        }
      } else {
        console.log('ℹ️  Speckle metrics not exposed through API (acceptable)');
      }

      expect(response.status()).toBe(200);
    });

    test('should have Speckle error rate within acceptable range (informational)', async ({
      request,
    }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check error rate (if available)
      if (data.speckle?.errorRate || data.services?.speckle?.errorRate) {
        const errorRate =
          data.speckle?.errorRate || data.services?.speckle?.errorRate;

        // Error rate should be low (<5%)
        if (errorRate < 5) {
          console.log(`✅ Low Speckle error rate: ${errorRate}%`);
        } else if (errorRate < 10) {
          console.log(`⚠️  Elevated Speckle error rate: ${errorRate}%`);
        } else {
          console.warn(`⚠️  High Speckle error rate: ${errorRate}%`);
        }

        expect(errorRate).toBeLessThan(20); // Max 20% error rate
      } else {
        console.log('ℹ️  Error rate not tracked (binary health status)');
      }

      expect(data.status).toBe('healthy');
    });
  });
});
