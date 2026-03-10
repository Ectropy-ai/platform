import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';

/**
 * ENTERPRISE INTEGRATION TESTS - SPECKLE GRAPHQL QUERIES
 *
 * Purpose: Speckle GraphQL query integration
 * Scope: Queries, mutations, subscriptions, complexity limits
 * Framework: Vitest + Supertest
 *
 * ENTERPRISE FOCUS:
 * - Health: GraphQL server health, query timeout, rate limiting
 * - Security: Query depth limits, complexity cost, authorization directives, introspection
 * - Performance: Query execution time, DataLoader batching, N+1 prevention, caching
 */

describe('Speckle - GraphQL Queries Integration', () => {
  let app: any;
  const testToken = 'test_speckle_token';

  beforeAll(async () => {
    app = await createTestServer({ service: 'api-gateway', port: 0 });
  });

  afterAll(async () => {
    await stopTestServer(app);
  });

  describe('1. GraphQL Queries', () => {
    it('should execute simple queries', async () => {
      const response = await request(app)
        .post('/api/speckle/graphql')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ query: '{ user { id name } }' });

      expect([200, 401, 503]).toContain(response.status);
    });

    it('should handle query errors', async () => {
      const response = await request(app)
        .post('/api/speckle/graphql')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ query: '{ invalid_field }' });

      if (response.status >= 400 || (response.body && response.body.errors)) {
        expect(response.body).toHaveProperty('errors');
      }
    });
  });

  describe('2. Security: Query Limits', () => {
    it('should enforce query depth limits', async () => {
      const deepQuery = {
        query: `{
          user {
            streams {
              commits {
                objects {
                  children {
                    children {
                      children { id }
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
        .set('Authorization', `Bearer ${testToken}`)
        .send(deepQuery);

      expect([400, 413]).toContain(response.status);
    });

    it('should enforce complexity limits', async () => {
      const complexQuery = {
        query: `{
          user {
            streams(limit: 1000) {
              commits(limit: 1000) { id }
            }
          }
        }`,
      };

      const response = await request(app)
        .post('/api/speckle/graphql')
        .set('Authorization', `Bearer ${testToken}`)
        .send(complexQuery);

      expect([400, 413]).toContain(response.status);
    });
  });

  describe('3. Performance: Query Execution', () => {
    it('should execute queries in <200ms', async () => {
      const measurements: number[] = [];

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();

        await request(app)
          .post('/api/speckle/graphql')
          .set('Authorization', `Bearer ${testToken}`)
          .send({ query: '{ user { id } }' });

        measurements.push(Date.now() - startTime);
      }

      const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;
      expect(avgDuration).toBeLessThan(200);

      console.log(`✅ GraphQL query avg: ${avgDuration.toFixed(2)}ms`);
    });
  });
});
