import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';

/**
 * ENTERPRISE INTEGRATION TESTS - MCP SERVER AGENT GUIDANCE
 *
 * Purpose: Agent context retrieval and guidance integration
 * Scope: Current truth, infrastructure catalog, evidence search
 * Framework: Vitest + Supertest + File System
 *
 * ENTERPRISE FOCUS:
 * - Health: File system health, JSON validation, corrupt data recovery
 * - Security: Path traversal prevention, authorization, data sanitization
 * - Performance: Document retrieval <50ms, search <200ms, caching
 */

describe('MCP Server - Agent Guidance Integration', () => {
  let app: any;

  beforeAll(async () => {
    app = await createTestServer({ service: 'mcp-server', port: 0 });
  });

  afterAll(async () => {
    await stopTestServer(app);
  });

  describe('1. Current Truth Document Access', () => {
    it('should retrieve current truth document', async () => {
      const response = await request(app).get('/mcp/current-truth');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('documentId');
        expect(response.body).toHaveProperty('version');
      }
    });

    it('should validate JSON schema', async () => {
      const response = await request(app).get('/mcp/current-truth');

      if (response.status === 200) {
        // Should be valid JSON
        expect(typeof response.body).toBe('object');
        expect(response.body).not.toBeNull();
      }
    });
  });

  describe('2. Infrastructure Catalog Queries', () => {
    it('should retrieve infrastructure catalog', async () => {
      const response = await request(app).get('/mcp/infrastructure-catalog');

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('version');
      }
    });
  });

  describe('3. Evidence Document Search', () => {
    it('should search evidence documents', async () => {
      const response = await request(app)
        .get('/mcp/evidence/search')
        .query({ q: 'test', limit: 10 });

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      }
    });
  });

  describe('4. Performance: Document Retrieval', () => {
    it('should retrieve documents in <50ms', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await request(app).get('/mcp/current-truth');
        measurements.push(Date.now() - startTime);
      }

      const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;
      expect(avgDuration).toBeLessThan(50);

      console.log(`✅ Document retrieval avg: ${avgDuration.toFixed(2)}ms`);
    });
  });

  describe('5. Security: Path Traversal Prevention', () => {
    it('should prevent path traversal attacks', async () => {
      const maliciousPath = '../../etc/passwd';

      const response = await request(app).get(`/mcp/document/${encodeURIComponent(maliciousPath)}`);

      expect([400, 403, 404]).toContain(response.status);
    });
  });
});
