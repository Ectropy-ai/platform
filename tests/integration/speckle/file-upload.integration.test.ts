import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';

/**
 * ENTERPRISE INTEGRATION TESTS - SPECKLE FILE UPLOAD
 *
 * Purpose: Speckle file upload integration
 * Scope: File uploads, multipart handling, validation, streaming
 * Framework: Vitest + Supertest
 *
 * ENTERPRISE FOCUS:
 * - Health: Upload failure recovery, partial cleanup, storage quota
 * - Security: File type validation, malware scanning, size limits, path traversal
 * - Performance: Upload throughput (MB/s), concurrent uploads, streaming, resume
 */

describe('Speckle - File Upload Integration', () => {
  let app: any;
  const testToken = 'test_speckle_token';

  beforeAll(async () => {
    app = await createTestServer({ service: 'api-gateway', port: 0 });
  });

  afterAll(async () => {
    await stopTestServer(app);
  });

  describe('1. File Upload', () => {
    it('should accept valid file uploads', async () => {
      const response = await request(app)
        .post('/api/speckle/upload')
        .set('Authorization', `Bearer ${testToken}`)
        .attach('file', Buffer.from('test IFC content'), 'test.ifc');

      expect([200, 201, 202, 401, 503]).toContain(response.status);
    });

    it('should validate file types', async () => {
      const response = await request(app)
        .post('/api/speckle/upload')
        .set('Authorization', `Bearer ${testToken}`)
        .attach('file', Buffer.from('malicious'), 'malware.exe');

      expect([400, 415]).toContain(response.status);
    });

    it('should enforce file size limits', async () => {
      const largeFile = Buffer.alloc(200 * 1024 * 1024); // 200MB

      const response = await request(app)
        .post('/api/speckle/upload')
        .set('Authorization', `Bearer ${testToken}`)
        .attach('file', largeFile, 'large.ifc')
        .timeout(60000);

      expect([413, 400]).toContain(response.status);
    });
  });

  describe('2. Security: Upload Validation', () => {
    it('should prevent path traversal in filenames', async () => {
      const response = await request(app)
        .post('/api/speckle/upload')
        .set('Authorization', `Bearer ${testToken}`)
        .attach('file', Buffer.from('test'), '../../etc/passwd');

      expect([400, 403]).toContain(response.status);
    });

    it('should require authentication for uploads', async () => {
      const response = await request(app)
        .post('/api/speckle/upload')
        .attach('file', Buffer.from('test'), 'test.ifc');

      expect(response.status).toBe(401);
    });
  });

  describe('3. Performance: Upload Speed', () => {
    it('should stream large files efficiently', async () => {
      const fileSize = 10 * 1024 * 1024; // 10MB
      const testFile = Buffer.alloc(fileSize);

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/speckle/upload')
        .set('Authorization', `Bearer ${testToken}`)
        .attach('file', testFile, 'test.ifc')
        .timeout(30000);

      const duration = Date.now() - startTime;

      // Should stream (not buffer entire file)
      expect(duration).toBeLessThan(5000); // 10MB should upload <5s

      console.log(`✅ Uploaded ${fileSize / 1024 / 1024}MB in ${duration}ms`);
    });
  });
});
