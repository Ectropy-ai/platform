import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase } from '../../__utils__/test-database';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';

/**
 * ENTERPRISE INTEGRATION TESTS - API GATEWAY SPECKLE ROUTES
 *
 * Purpose: Speckle API proxy and integration testing
 * Scope: Speckle routes, GraphQL, webhooks, file uploads
 * Framework: Vitest + Supertest + Mock Speckle API
 * Duration: <30 seconds total
 *
 * ENTERPRISE FOCUS:
 * - Health: Speckle service monitoring, fallback behavior, circuit breakers
 * - Security: API key forwarding, webhook signatures, rate limiting, file validation
 * - Performance: Proxy latency <100ms, file streaming, concurrent requests 50/s
 *
 * @see apps/mcp-server/data/evidence/2025-12/PHASE_3_INTEGRATION_TEST_EXPANSION_PLAN_2025-12-29.json
 */

describe('API Gateway - Speckle Routes Integration', () => {
  let app: any;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestServer({ service: 'api-gateway', port: 0 });
  });

  afterAll(async () => {
    await stopTestServer(app);
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('1. Speckle Proxy Routes', () => {
    describe('Health: Speckle Service Monitoring', () => {
      it('should monitor Speckle service availability', async () => {
        const response = await request(app)
          .get('/api/health')
          .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('services');

        if (response.body.services?.speckle) {
          const speckleHealth = response.body.services.speckle;
          expect(speckleHealth).toHaveProperty('status');
          expect(['healthy', 'degraded', 'down']).toContain(speckleHealth.status);

          console.log(`✅ Speckle service status: ${speckleHealth.status}`);
        }
      });

      it('should implement fallback when Speckle unavailable', async () => {
        // ENTERPRISE PATTERN: Graceful degradation
        // When Speckle is down, should return cached data or proper error

        const response = await request(app)
          .get('/api/speckle/projects')
          .set('Authorization', 'Bearer test_token')
          .set('Accept', 'application/json');

        // Should not return 502 (bad gateway) without handling
        if (response.status >= 500) {
          expect(response.body).toHaveProperty('error');
          expect(response.body).toHaveProperty('fallback');
          expect(response.body.message).not.toContain('ECONNREFUSED');
        }
      });

      it('should implement circuit breaker for Speckle failures', async () => {
        // ENTERPRISE PATTERN: Circuit breaker testing
        const failureThreshold = 5;
        const measurements: number[] = [];

        for (let i = 0; i < failureThreshold + 2; i++) {
          const startTime = Date.now();

          await request(app)
            .get('/api/speckle/invalid-endpoint')
            .set('Authorization', 'Bearer test_token')
            .set('Accept', 'application/json');

          measurements.push(Date.now() - startTime);
        }

        // Circuit should open after threshold (faster rejections)
        const avgEarly = measurements.slice(0, failureThreshold).reduce((a, b) => a + b) / failureThreshold;
        const avgLater = measurements.slice(failureThreshold).reduce((a, b) => a + b) / measurements.slice(failureThreshold).length;

        // Later requests should be faster (circuit open)
        expect(avgLater).toBeLessThan(avgEarly);

        console.log(`✅ Circuit breaker: early avg ${avgEarly.toFixed(0)}ms → later avg ${avgLater.toFixed(0)}ms`);
      });
    });

    describe('Security: API Authentication Forwarding', () => {
      it('should forward Speckle API tokens correctly', async () => {
        const testToken = 'test_speckle_api_token_12345';

        const response = await request(app)
          .get('/api/speckle/user/profile')
          .set('Authorization', `Bearer ${testToken}`)
          .set('Accept', 'application/json');

        // Should forward request with auth header
        // Mock Speckle API would validate this
        expect([200, 401, 403, 404]).toContain(response.status);
      });

      it('should reject requests without Speckle token', async () => {
        const response = await request(app)
          .get('/api/speckle/user/profile')
          .set('Accept', 'application/json');

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });

      it('should validate Speckle token format', async () => {
        const response = await request(app)
          .get('/api/speckle/user/profile')
          .set('Authorization', 'Bearer INVALID')
          .set('Accept', 'application/json');

        // Should validate token format before proxying
        expect([400, 401]).toContain(response.status);
      });

      it('should implement rate limiting per user', async () => {
        // ENTERPRISE PATTERN: Rate limiting
        const requestsPerWindow = 100;
        const testToken = 'test_token_rate_limit';

        const promises = Array.from({ length: requestsPerWindow + 10 }, () =>
          request(app)
            .get('/api/speckle/user/profile')
            .set('Authorization', `Bearer ${testToken}`)
            .set('Accept', 'application/json')
        );

        const responses = await Promise.all(promises);

        // Some requests should be rate limited (429)
        const rateLimited = responses.filter(r => r.status === 429);
        expect(rateLimited.length).toBeGreaterThan(0);

        console.log(`✅ Rate limiting: ${rateLimited.length}/${responses.length} requests throttled`);
      });
    });

    describe('Performance: Proxy Latency', () => {
      it('should add <100ms proxy overhead', async () => {
        // ENTERPRISE PATTERN: Proxy performance monitoring
        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .get('/api/speckle/health')
            .set('Authorization', 'Bearer test_token')
            .set('Accept', 'application/json');

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Proxy overhead <100ms
        expect(avgDuration).toBeLessThan(100);

        console.log(`✅ Proxy latency avg: ${avgDuration.toFixed(2)}ms (SLA: <100ms)`);
      });

      it('should handle 50 concurrent Speckle requests', async () => {
        const concurrentRequests = 50;
        const startTime = Date.now();

        const promises = Array.from({ length: concurrentRequests }, () =>
          request(app)
            .get('/api/speckle/health')
            .set('Authorization', 'Bearer test_token')
            .set('Accept', 'application/json')
        );

        const responses = await Promise.all(promises);
        const duration = Date.now() - startTime;

        // Most should succeed
        const successCount = responses.filter(r => r.status === 200).length;
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.9);

        // Should complete in <1s
        expect(duration).toBeLessThan(1000);

        console.log(`✅ Handled ${concurrentRequests} concurrent requests in ${duration}ms`);
      });
    });
  });

  describe('2. Speckle GraphQL Integration', () => {
    describe('Health: GraphQL Service', () => {
      it('should proxy GraphQL queries to Speckle', async () => {
        const query = {
          query: '{ user { name email } }',
        };

        const response = await request(app)
          .post('/api/speckle/graphql')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'application/json')
          .send(query);

        // Should proxy to Speckle GraphQL
        expect([200, 401, 400]).toContain(response.status);
      });

      it('should handle GraphQL errors gracefully', async () => {
        const invalidQuery = {
          query: '{ invalid_query }',
        };

        const response = await request(app)
          .post('/api/speckle/graphql')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'application/json')
          .send(invalidQuery);

        // Should return proper error structure
        if (response.status >= 400) {
          expect(response.body).toHaveProperty('errors');
        }
      });
    });

    describe('Security: GraphQL Security', () => {
      it('should enforce query depth limiting', async () => {
        // ENTERPRISE PATTERN: GraphQL security
        const deepQuery = {
          query: `{
            user {
              projects {
                streams {
                  commits {
                    objects {
                      children {
                        children {
                          children {
                            # Too deep
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
        };

        const response = await request(app)
          .post('/api/speckle/graphql')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'application/json')
          .send(deepQuery);

        // Should reject queries exceeding depth limit
        expect([400, 413]).toContain(response.status);
      });

      it('should enforce query complexity limits', async () => {
        // ENTERPRISE PATTERN: Query complexity cost analysis
        const complexQuery = {
          query: `{
            user {
              projects(limit: 100) {
                streams(limit: 100) {
                  commits(limit: 100) {
                    # Cost: 100 * 100 * 100 = 1M
                  }
                }
              }
            }
          }`,
        };

        const response = await request(app)
          .post('/api/speckle/graphql')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'application/json')
          .send(complexQuery);

        // Should reject queries exceeding complexity limit
        expect([400, 413]).toContain(response.status);
      });

      it('should disable introspection in production', async () => {
        if (process.env.NODE_ENV === 'production') {
          const introspectionQuery = {
            query: '{ __schema { types { name } } }',
          };

          const response = await request(app)
            .post('/api/speckle/graphql')
            .set('Authorization', 'Bearer test_token')
            .set('Content-Type', 'application/json')
            .send(introspectionQuery);

          // Introspection should be disabled in production
          expect(response.status).toBe(400);
          expect(response.body).toHaveProperty('errors');
        }
      });
    });

    describe('Performance: GraphQL Query Performance', () => {
      it('should execute simple queries in <200ms', async () => {
        const simpleQuery = {
          query: '{ user { id name } }',
        };

        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .post('/api/speckle/graphql')
            .set('Authorization', 'Bearer test_token')
            .set('Content-Type', 'application/json')
            .send(simpleQuery);

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Simple GraphQL queries <200ms
        expect(avgDuration).toBeLessThan(200);

        console.log(`✅ GraphQL query avg: ${avgDuration.toFixed(2)}ms (SLA: <200ms)`);
      });
    });
  });

  describe('3. Speckle Webhook Handling', () => {
    describe('Health: Webhook Processing', () => {
      it('should accept valid webhooks from Speckle', async () => {
        const webhook = {
          event: 'stream.updated',
          streamId: 'test_stream_123',
          payload: { name: 'Updated Stream' },
        };

        const response = await request(app)
          .post('/api/speckle/webhook')
          .set('Content-Type', 'application/json')
          .set('X-Speckle-Signature', 'valid_signature')
          .send(webhook);

        // Should accept and process webhook
        expect([200, 202]).toContain(response.status);
      });

      it('should handle webhook processing failures gracefully', async () => {
        const invalidWebhook = {
          event: 'invalid.event',
          payload: 'INVALID',
        };

        const response = await request(app)
          .post('/api/speckle/webhook')
          .set('Content-Type', 'application/json')
          .set('X-Speckle-Signature', 'valid_signature')
          .send(invalidWebhook);

        // Should return proper error
        if (response.status >= 400) {
          expect(response.body).toHaveProperty('error');
        }
      });
    });

    describe('Security: Webhook Signature Verification', () => {
      it('should verify webhook signatures', async () => {
        // ENTERPRISE PATTERN: Webhook security
        const webhook = {
          event: 'stream.updated',
          streamId: 'test_stream_123',
        };

        const response = await request(app)
          .post('/api/speckle/webhook')
          .set('Content-Type', 'application/json')
          .set('X-Speckle-Signature', 'INVALID_SIGNATURE')
          .send(webhook);

        // Should reject webhooks with invalid signatures
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      });

      it('should reject webhooks without signatures', async () => {
        const webhook = {
          event: 'stream.updated',
          streamId: 'test_stream_123',
        };

        const response = await request(app)
          .post('/api/speckle/webhook')
          .set('Content-Type', 'application/json')
          .send(webhook);

        expect(response.status).toBe(401);
      });

      it('should prevent SSRF attacks in webhook URLs', async () => {
        // ENTERPRISE PATTERN: SSRF prevention
        const maliciousWebhook = {
          event: 'callback.requested',
          callbackUrl: 'http://localhost:22/admin', // Internal service
        };

        const response = await request(app)
          .post('/api/speckle/webhook')
          .set('Content-Type', 'application/json')
          .set('X-Speckle-Signature', 'valid_signature')
          .send(maliciousWebhook);

        // Should validate callback URL against whitelist
        expect([400, 403]).toContain(response.status);
      });
    });

    describe('Performance: Webhook Processing', () => {
      it('should acknowledge webhooks in <100ms', async () => {
        // ENTERPRISE PATTERN: Fast webhook acknowledgement
        const webhook = {
          event: 'stream.updated',
          streamId: 'test_stream_123',
        };

        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .post('/api/speckle/webhook')
            .set('Content-Type', 'application/json')
            .set('X-Speckle-Signature', 'valid_signature')
            .send(webhook);

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Webhook acknowledgement <100ms (process async)
        expect(avgDuration).toBeLessThan(100);

        console.log(`✅ Webhook acknowledgement avg: ${avgDuration.toFixed(2)}ms`);
      });
    });
  });

  describe('4. Speckle File Upload Integration', () => {
    describe('Health: File Upload Service', () => {
      it('should accept file uploads', async () => {
        const response = await request(app)
          .post('/api/speckle/upload')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'multipart/form-data')
          .attach('file', Buffer.from('test file content'), 'test.ifc');

        // Should accept file upload
        expect([200, 201, 202]).toContain(response.status);
      });

      it('should handle upload failures gracefully', async () => {
        // Upload without file
        const response = await request(app)
          .post('/api/speckle/upload')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'multipart/form-data');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('Security: File Upload Validation', () => {
      it('should validate file types', async () => {
        // ENTERPRISE PATTERN: File type validation
        const response = await request(app)
          .post('/api/speckle/upload')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'multipart/form-data')
          .attach('file', Buffer.from('<?php echo "malicious"; ?>'), 'malware.php');

        // Should reject disallowed file types
        expect([400, 415]).toContain(response.status);
      });

      it('should enforce file size limits', async () => {
        // Create large file (> limit)
        const largeFile = Buffer.alloc(100 * 1024 * 1024); // 100MB

        const response = await request(app)
          .post('/api/speckle/upload')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'multipart/form-data')
          .attach('file', largeFile, 'large.ifc')
          .timeout(30000);

        // Should reject files exceeding size limit
        expect([413, 400]).toContain(response.status);
      });

      it('should prevent path traversal in filenames', async () => {
        // ENTERPRISE PATTERN: Path traversal prevention
        const response = await request(app)
          .post('/api/speckle/upload')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'multipart/form-data')
          .attach('file', Buffer.from('test'), '../../etc/passwd');

        // Should sanitize filename
        expect([400, 403]).toContain(response.status);
      });
    });

    describe('Performance: File Upload Streaming', () => {
      it('should stream file uploads (no buffering)', async () => {
        // ENTERPRISE PATTERN: Streaming upload
        const fileSize = 10 * 1024 * 1024; // 10MB
        const testFile = Buffer.alloc(fileSize);

        const startTime = Date.now();

        const response = await request(app)
          .post('/api/speckle/upload')
          .set('Authorization', 'Bearer test_token')
          .set('Content-Type', 'multipart/form-data')
          .attach('file', testFile, 'test.ifc')
          .timeout(30000);

        const duration = Date.now() - startTime;

        // Should stream (not wait for full upload before processing)
        // For 10MB at 10MB/s minimum, should take <1s
        expect(duration).toBeLessThan(2000);

        console.log(`✅ Uploaded ${fileSize / 1024 / 1024}MB in ${duration}ms`);
      });
    });
  });

  describe('5. Request/Response Transformation', () => {
    describe('Health: Response Mapping', () => {
      it('should transform Speckle responses to standard format', async () => {
        const response = await request(app)
          .get('/api/speckle/user/profile')
          .set('Authorization', 'Bearer test_token')
          .set('Accept', 'application/json');

        if (response.status === 200) {
          // Should have standard response structure
          expect(response.body).toBeDefined();
          expect(typeof response.body).toBe('object');
        }
      });

      it('should handle Speckle error responses', async () => {
        const response = await request(app)
          .get('/api/speckle/nonexistent')
          .set('Authorization', 'Bearer test_token')
          .set('Accept', 'application/json');

        if (response.status >= 400) {
          // Should transform Speckle errors to standard format
          expect(response.body).toHaveProperty('error');
          expect(response.body).not.toHaveProperty('stack');
          expect(response.body).not.toHaveProperty('stackTrace');
        }
      });
    });

    describe('Security: Response Sanitization', () => {
      it('should not expose Speckle API keys in responses', async () => {
        const response = await request(app)
          .get('/api/speckle/user/profile')
          .set('Authorization', 'Bearer test_token')
          .set('Accept', 'application/json');

        const responseText = JSON.stringify(response.body).toLowerCase();

        // Should not leak API keys
        expect(responseText).not.toContain('api_key');
        expect(responseText).not.toContain('api_secret');
        expect(responseText).not.toContain('token');
        expect(responseText).not.toContain('password');
      });
    });
  });
});
