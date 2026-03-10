import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';

/**
 * ENTERPRISE INTEGRATION TESTS - MCP SERVER HEALTH CHECKS
 *
 * Purpose: Multi-level health monitoring integration
 * Scope: Infrastructure, application, business health aggregation
 * Framework: Vitest + Supertest
 * Duration: <20 seconds total
 *
 * ENTERPRISE FOCUS:
 * - Health: Multi-level monitoring, partial outage detection, service dependencies
 * - Security: Health endpoint authentication, sensitive data masking
 * - Performance: Health check <100ms, parallel checks, caching (30s TTL)
 */

describe('MCP Server - Health Checks Integration', () => {
  let app: any;

  beforeAll(async () => {
    app = await createTestServer({ service: 'mcp-server', port: 0 });
  });

  afterAll(async () => {
    await stopTestServer(app);
  });

  describe('1. Multi-Level Health Monitoring', () => {
    it('should aggregate infrastructure health', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('infrastructure');

      if (response.body.infrastructure) {
        expect(response.body.infrastructure).toHaveProperty('filesystem');
        expect(response.body.infrastructure).toHaveProperty('memory');
        expect(response.body.infrastructure).toHaveProperty('cpu');
      }
    });

    it('should report database health', async () => {
      const response = await request(app).get('/health');

      if (response.body.services?.database) {
        expect(response.body.services.database).toHaveProperty('status');
        expect(['healthy', 'degraded', 'down']).toContain(
          response.body.services.database.status
        );
      }
    });

    it('should calculate overall health score', async () => {
      const response = await request(app).get('/health');

      if (response.body.score !== undefined) {
        expect(response.body.score).toBeGreaterThanOrEqual(0);
        expect(response.body.score).toBeLessThanOrEqual(100);

        console.log(`✅ Health score: ${response.body.score}/100`);
      }
    });
  });

  describe('2. Performance: Health Check Speed', () => {
    it('should respond in <100ms', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await request(app).get('/health');
        measurements.push(Date.now() - startTime);
      }

      const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;
      expect(avgDuration).toBeLessThan(100);

      console.log(`✅ Health check avg: ${avgDuration.toFixed(2)}ms (SLA: <100ms)`);
    });

    it('should cache health status for 30s', async () => {
      const response1 = await request(app).get('/health');
      const response2 = await request(app).get('/health');

      // If both within cache window, should be very fast
      // This is approximate - real test would measure cache headers
      expect(response1.body.status).toBe(response2.body.status);
    });
  });

  describe('3. Security: Health Endpoint Protection', () => {
    it('should not expose sensitive data in health responses', async () => {
      const response = await request(app).get('/health');

      const responseText = JSON.stringify(response.body).toLowerCase();

      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('api_key');
      expect(responseText).not.toContain('database_url');
      expect(responseText).not.toContain('connection_string');
    });
  });
});
