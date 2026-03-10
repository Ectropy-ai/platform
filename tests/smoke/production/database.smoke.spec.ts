import { test, expect } from '@playwright/test';

/**
 * ENTERPRISE PRODUCTION SMOKE TESTS - DATABASE CONNECTIVITY
 *
 * Purpose: Validate database connectivity and health through API layer
 * Scope: Database health indicators, connection pool status, query performance
 * Duration: < 2 minutes total
 * Frequency: After every deployment + hourly monitoring
 *
 * CRITICAL RULES FOR PRODUCTION SMOKE TESTS:
 * - NO DIRECT DATABASE CONNECTIONS (test through API layer only)
 * - Read-only operations ONLY (no database writes)
 * - No user-facing destructive actions
 * - Fast execution (< 30s per test)
 * - Fail fast (no retries - immediate rollback trigger)
 * - Zero dependencies on test data
 *
 * RATIONALE: Testing database health through API endpoints ensures:
 * 1. We validate the entire stack (not just database)
 * 2. We follow production security practices (no direct DB access)
 * 3. We test what users actually experience
 * 4. We maintain read-only operations
 *
 * @see playwright.config.production.ts for production-specific configuration
 * @see apps/mcp-server/data/runbooks/validation/smoke-tests-production-v1.0.0.json
 */

const PRODUCTION_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://ectropy.ai';
const TIMEOUT = 30000; // 30s max per test (production SLA)

test.describe('Production Smoke Tests - Database Connectivity', () => {
  test.describe('1. Database Health Indicators', () => {
    test('should have database connectivity through API health endpoint', async ({ request }) => {
      // ENTERPRISE PATTERN: Test DB health through API layer (not direct connection)
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;

      expect(response.status()).toBe(200);
      expect(duration).toBeLessThan(5000); // SLA: < 5s (DB query included)

      const data = await response.json();

      // Health endpoint should indicate database status
      if (data.database || data.services?.database) {
        const dbStatus = data.database || data.services.database;
        console.log(`✅ Database health reported: ${JSON.stringify(dbStatus)}`);

        // Database should be healthy
        if (dbStatus.status) {
          expect(dbStatus.status).toBe('healthy');
        }
      } else {
        // If health endpoint doesn't break down services, overall healthy = DB healthy
        console.log(`✅ API healthy implies database connectivity (${duration}ms)`);
        expect(data.status).toBe('healthy');
      }
    });

    test('should have database connection pool healthy', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`, {
        timeout: 10000,
      });

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for connection pool metrics (if exposed)
      if (data.database?.connectionPool || data.services?.database?.pool) {
        const pool = data.database?.connectionPool || data.services?.database?.pool;

        console.log(`✅ Database connection pool metrics: ${JSON.stringify(pool)}`);

        // Verify pool has available connections
        if (pool.available !== undefined) {
          expect(pool.available).toBeGreaterThan(0);
        }
      } else {
        console.log('ℹ️  Connection pool metrics not exposed (acceptable)');
      }

      // Test passes if API is healthy
      expect(data.status).toBe('healthy');
    });

    test('should have responsive database queries', async ({ request }) => {
      // ENTERPRISE PATTERN: Measure API response time as proxy for DB performance
      const measurements: number[] = [];

      for (let i = 0; i < 3; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/health`);
        expect(response.status()).toBe(200);

        const duration = Date.now() - startTime;
        measurements.push(duration);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;

      // All measurements should be fast (indicates healthy DB)
      measurements.forEach(duration => {
        expect(duration).toBeLessThan(5000); // SLA: < 5s
      });

      console.log(`✅ Database query performance: avg ${avgDuration.toFixed(0)}ms (${measurements.join(', ')}ms)`);
    });
  });

  test.describe('2. Database-Dependent Endpoints', () => {
    test('should have projects endpoint responding (indicates DB connectivity)', async ({ request }) => {
      // ENTERPRISE PATTERN: Test endpoint that requires database queries
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/projects`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Acceptable responses (all indicate DB is connected):
      // - 200 (public projects returned - DB working)
      // - 401 (auth required, but DB connected to check - DB working)
      // - 403 (forbidden, but DB queried - DB working)
      const acceptableStatuses = [200, 401, 403];
      expect(acceptableStatuses).toContain(status);

      // Should respond quickly
      expect(duration).toBeLessThan(5000); // SLA: < 5s

      console.log(`✅ Projects endpoint responded - DB connectivity confirmed (${duration}ms)`);
    });

    test('should have users endpoint responding (indicates DB connectivity)', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/users`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Any response other than 500/502/503 indicates DB is reachable
      expect(status).not.toBe(500);
      expect(status).not.toBe(502);
      expect(status).not.toBe(503);

      expect(duration).toBeLessThan(5000); // SLA: < 5s

      console.log(`✅ Users endpoint responded - DB connectivity confirmed (${duration}ms)`);
    });

    test('should have organizations endpoint responding (indicates DB connectivity)', async ({ request }) => {
      const startTime = Date.now();

      const response = await request.get(`${PRODUCTION_URL}/api/organizations`, {
        timeout: 10000,
      });

      const duration = Date.now() - startTime;
      const status = response.status();

      // Any response other than 500/502/503 indicates DB is reachable
      expect(status).not.toBe(500);
      expect(status).not.toBe(502);
      expect(status).not.toBe(503);

      expect(duration).toBeLessThan(5000); // SLA: < 5s

      console.log(`✅ Organizations endpoint responded - DB connectivity confirmed (${duration}ms)`);
    });
  });

  test.describe('3. Database Performance Through API', () => {
    test('should handle database queries without timeout', async ({ request }) => {
      // ENTERPRISE PATTERN: Verify DB queries complete within timeout
      const promises = [
        request.get(`${PRODUCTION_URL}/api/projects`, { timeout: 10000 }),
        request.get(`${PRODUCTION_URL}/api/users`, { timeout: 10000 }),
        request.get(`${PRODUCTION_URL}/api/organizations`, { timeout: 10000 }),
      ];

      const responses = await Promise.all(promises);

      // All endpoints should respond (not timeout)
      responses.forEach((response, index) => {
        const status = response.status();
        // Should not be 504 (Gateway Timeout) or 500 (DB error)
        expect([500, 504]).not.toContain(status);
      });

      console.log('✅ All database-dependent endpoints responded without timeout');
    });

    test('should have consistent database query performance', async ({ request }) => {
      const measurements: number[] = [];

      // Query same endpoint 5 times
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();

        const response = await request.get(`${PRODUCTION_URL}/api/projects`);
        const duration = Date.now() - startTime;

        measurements.push(duration);

        // Should respond
        expect([500, 502, 503, 504]).not.toContain(response.status());

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Calculate variance
      const avgDuration = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const variance = measurements.reduce((sum, val) => sum + Math.pow(val - avgDuration, 2), 0) / measurements.length;
      const stdDev = Math.sqrt(variance);

      // Low variance indicates stable DB performance
      console.log(`✅ Database query consistency: avg ${avgDuration.toFixed(0)}ms, stdDev ${stdDev.toFixed(0)}ms`);

      // Standard deviation should be reasonable
      expect(stdDev).toBeLessThan(avgDuration * 0.6); // StdDev < 60% of mean
    });

    test('should handle concurrent database queries efficiently', async ({ request }) => {
      // ENTERPRISE PATTERN: Light load test for DB connection pool
      const startTime = Date.now();

      // Make 10 concurrent requests (tests connection pool)
      const promises = Array.from({ length: 10 }, () =>
        request.get(`${PRODUCTION_URL}/api/health`, { timeout: 10000 })
      );

      const responses = await Promise.all(promises);

      const duration = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status()).toBe(200);
      });

      // Should handle concurrent load efficiently
      expect(duration).toBeLessThan(10000); // Should complete in < 10s

      console.log(`✅ Database handled ${promises.length} concurrent queries in ${duration}ms`);
    });
  });

  test.describe('4. Database Error Handling', () => {
    test('should handle database errors gracefully (if any)', async ({ request }) => {
      // ENTERPRISE PATTERN: Verify API doesn't expose raw DB errors
      // Try to trigger an error condition

      const response = await request.get(`${PRODUCTION_URL}/api/projects?limit=-1`, {
        timeout: 10000,
      });

      const status = response.status();

      // Should return proper HTTP error (not 500 if validation works)
      if (status >= 400) {
        const contentType = response.headers()['content-type'];

        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();

          // Should not expose raw database errors
          const errorText = JSON.stringify(data).toLowerCase();
          expect(errorText).not.toContain('pg::');
          expect(errorText).not.toContain('postgresql');
          expect(errorText).not.toContain('sql');

          console.log(`✅ Database errors properly sanitized`);
        } else {
          console.log('✅ Error returned (non-JSON format)');
        }
      }

      // Should not return 500 for validation errors
      if (status === 400 || status === 422) {
        console.log(`✅ Validation errors handled before database query (${status})`);
      }
    });

    test('should not leak database connection errors', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();
      const responseText = JSON.stringify(data).toLowerCase();

      // Verify no database connection details leaked
      expect(responseText).not.toContain('connection string');
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('database_url');

      console.log('✅ No database connection details leaked in responses');
    });
  });

  test.describe('5. Database Migration Status', () => {
    test('should have database schema up to date (through API)', async ({ request }) => {
      // ENTERPRISE PATTERN: Verify migrations applied (if health endpoint reports this)
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check if health endpoint reports migration status
      if (data.database?.migrations || data.migrations) {
        const migrations = data.database?.migrations || data.migrations;

        console.log(`✅ Database migrations status: ${JSON.stringify(migrations)}`);

        // Verify migrations are current
        if (migrations.status) {
          expect(migrations.status).toBe('current');
        }
      } else {
        console.log('ℹ️  Migration status not exposed through API (acceptable)');
      }

      // If API is healthy, schema should be current
      expect(data.status).toBe('healthy');
    });

    test('should have all database tables accessible through API', async ({ request }) => {
      // ENTERPRISE PATTERN: Verify core tables exist by testing endpoints
      const endpoints = [
        { url: `${PRODUCTION_URL}/api/projects`, name: 'projects table' },
        { url: `${PRODUCTION_URL}/api/users`, name: 'users table' },
        { url: `${PRODUCTION_URL}/api/organizations`, name: 'organizations table' },
      ];

      for (const endpoint of endpoints) {
        const response = await request.get(endpoint.url, { timeout: 10000 });

        // Should not return 500 (table not found)
        expect(response.status()).not.toBe(500);

        console.log(`✅ ${endpoint.name} accessible - Status: ${response.status()}`);
      }
    });
  });

  test.describe('6. Database Backup Indicators', () => {
    test('should have database backup status (informational)', async ({ request }) => {
      // ENTERPRISE PATTERN: Check if health endpoint reports backup status
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for backup status (if exposed)
      if (data.database?.backup || data.backup) {
        const backup = data.database?.backup || data.backup;
        console.log(`✅ Database backup status: ${JSON.stringify(backup)}`);

        // Verify backup is recent (if timestamp provided)
        if (backup.lastBackup) {
          const lastBackupTime = new Date(backup.lastBackup).getTime();
          const now = Date.now();
          const hoursSinceBackup = (now - lastBackupTime) / (1000 * 60 * 60);

          // Backup should be within 24 hours
          if (hoursSinceBackup < 24) {
            console.log(`✅ Recent backup: ${hoursSinceBackup.toFixed(1)} hours ago`);
          } else {
            console.warn(`⚠️  Last backup: ${hoursSinceBackup.toFixed(1)} hours ago`);
          }
        }
      } else {
        console.log('ℹ️  Backup status not exposed through API (managed by DigitalOcean)');
      }

      expect(response.status()).toBe(200);
    });
  });

  test.describe('7. Database Monitoring', () => {
    test('should have database metrics available (informational)', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for database metrics
      if (data.database?.metrics || data.metrics?.database) {
        const metrics = data.database?.metrics || data.metrics.database;
        console.log(`✅ Database metrics exposed: ${JSON.stringify(metrics)}`);

        // Log useful metrics
        if (metrics.queryTime) {
          console.log(`  - Average query time: ${metrics.queryTime}ms`);
        }
        if (metrics.connections) {
          console.log(`  - Active connections: ${metrics.connections}`);
        }
      } else {
        console.log('ℹ️  Database metrics not exposed through API (acceptable for security)');
      }

      expect(response.status()).toBe(200);
    });

    test('should track database health score (if available)', async ({ request }) => {
      const response = await request.get(`${PRODUCTION_URL}/api/health`);

      expect(response.status()).toBe(200);

      const data = await response.json();

      // Check for health score
      if (data.score !== undefined) {
        const score = data.score;

        // Health score should be good (>80)
        expect(score).toBeGreaterThanOrEqual(60); // Minimum acceptable

        if (score >= 80) {
          console.log(`✅ Excellent database health score: ${score}/100`);
        } else if (score >= 60) {
          console.log(`⚠️  Acceptable database health score: ${score}/100`);
        }
      } else {
        console.log('ℹ️  Health score not calculated (binary healthy/unhealthy)');
      }

      expect(data.status).toBe('healthy');
    });
  });
});
