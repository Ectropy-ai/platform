/**
 * ENTERPRISE INTEGRATION TEST TEMPLATE
 *
 * Template Metadata (MCP-Servable):
 * - Framework: Supertest + Jest
 * - Type: Integration Test
 * - Target Coverage: 75%
 * - Pattern: API Contract Testing + Database Integration
 *
 * USAGE:
 * pnpm test:generate integration <api-route-path>
 *
 * EXAMPLE:
 * pnpm test:generate integration apps/api-gateway/src/routes/projects.ts
 * → Creates apps/api-gateway/src/routes/projects.integration.spec.ts
 *
 * INTEGRATION TEST SCOPE:
 * - HTTP API contracts (request/response validation)
 * - Database operations (create, read, update, delete)
 * - Authentication/authorization flows
 * - Error handling and validation
 * - External service integrations (with mocking)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { type Express } from 'express';

// ============================================================================
// TEMPLATE PLACEHOLDERS (replaced by generator)
// ============================================================================
// {{API_ROUTE}} - Route being tested (e.g., "/api/projects")
// {{ROUTE_NAME}} - Descriptive name (e.g., "Projects API")
// {{APP_IMPORT}} - Import for Express app instance

// import app from '../../main'; // Example import

describe('{{ROUTE_NAME}} Integration Tests', () => {
  let appInstance: Express;
  let testDatabaseConnection: any;

  // ============================================================================
  // TEST LIFECYCLE - DATABASE SETUP/TEARDOWN
  // ============================================================================

  beforeAll(async () => {
    // Initialize test database connection
    // testDatabaseConnection = await createTestDatabaseConnection();

    // Run migrations for test database
    // await runMigrations(testDatabaseConnection);

    // Initialize app instance
    // appInstance = await createApp({ db: testDatabaseConnection });
  });

  afterAll(async () => {
    // Close database connections
    // await testDatabaseConnection.close();

    // Close app instance
    // await appInstance.close();
  });

  beforeEach(async () => {
    // Seed database with test data before each test
    // await seedDatabase(testDatabaseConnection);
  });

  afterEach(async () => {
    // Clean up database after each test
    // await truncateAllTables(testDatabaseConnection);
  });

  // ============================================================================
  // HTTP GET TESTS
  // ============================================================================

  describe('GET {{API_ROUTE}}', () => {
    it('should return 200 and list of resources', async () => {
      const response = await request(appInstance)
        .get('{{API_ROUTE}}')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should support pagination', async () => {
      const response = await request(appInstance)
        .get('{{API_ROUTE}}?page=1&limit=10')
        .expect(200);

      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.totalPages).toBeDefined();
    });

    it('should support filtering', async () => {
      const response = await request(appInstance)
        .get('{{API_ROUTE}}?filter=active')
        .expect(200);

      expect(response.body.data).toBeDefined();
      // Verify all items match filter
      response.body.data.forEach((item: any) => {
        expect(item.status).toBe('active');
      });
    });

    it('should support sorting', async () => {
      const response = await request(appInstance)
        .get('{{API_ROUTE}}?sortBy=createdAt&order=desc')
        .expect(200);

      const items = response.body.data;
      // Verify items are sorted correctly
      for (let i = 0; i < items.length - 1; i++) {
        const currentDate = new Date(items[i].createdAt);
        const nextDate = new Date(items[i + 1].createdAt);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
    });

    it('should return 404 for non-existent resource', async () => {
      await request(appInstance)
        .get('{{API_ROUTE}}/non-existent-id')
        .expect(404)
        .expect((res) => {
          expect(res.body.error).toBeDefined();
          expect(res.body.error.message).toContain('not found');
        });
    });
  });

  // ============================================================================
  // HTTP POST TESTS (CREATE)
  // ============================================================================

  describe('POST {{API_ROUTE}}', () => {
    it('should create new resource with valid data', async () => {
      const newResource = {
        // TODO: Add valid resource data
        name: 'Test Resource',
        description: 'Integration test resource'
      };

      const response = await request(appInstance)
        .post('{{API_ROUTE}}')
        .send(newResource)
        .expect(201)
        .expect('Content-Type', /json/);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.name).toBe(newResource.name);

      // Verify resource persisted to database
      // const dbRecord = await findResourceById(response.body.data.id);
      // expect(dbRecord).toBeDefined();
    });

    it('should return 400 for invalid data', async () => {
      const invalidResource = {
        // Missing required fields
      };

      await request(appInstance)
        .post('{{API_ROUTE}}')
        .send(invalidResource)
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toBeDefined();
          expect(res.body.error.validationErrors).toBeDefined();
        });
    });

    it('should return 409 for duplicate resource', async () => {
      const resource = { uniqueField: 'unique-value' };

      // Create first resource
      await request(appInstance)
        .post('{{API_ROUTE}}')
        .send(resource)
        .expect(201);

      // Attempt duplicate creation
      await request(appInstance)
        .post('{{API_ROUTE}}')
        .send(resource)
        .expect(409)
        .expect((res) => {
          expect(res.body.error.message).toContain('already exists');
        });
    });
  });

  // ============================================================================
  // HTTP PUT/PATCH TESTS (UPDATE)
  // ============================================================================

  describe('PUT/PATCH {{API_ROUTE}}/:id', () => {
    let existingResourceId: string;

    beforeEach(async () => {
      // Create resource for update tests
      const response = await request(appInstance)
        .post('{{API_ROUTE}}')
        .send({ name: 'Resource to Update' })
        .expect(201);

      existingResourceId = response.body.data.id;
    });

    it('should update existing resource', async () => {
      const updates = { name: 'Updated Name' };

      const response = await request(appInstance)
        .put(`{{API_ROUTE}}/${existingResourceId}`)
        .send(updates)
        .expect(200);

      expect(response.body.data.name).toBe(updates.name);
      expect(response.body.data.id).toBe(existingResourceId);
    });

    it('should return 404 for non-existent resource update', async () => {
      await request(appInstance)
        .put('{{API_ROUTE}}/non-existent-id')
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('should validate update data', async () => {
      await request(appInstance)
        .put(`{{API_ROUTE}}/${existingResourceId}`)
        .send({ invalidField: 'invalid' })
        .expect(400);
    });
  });

  // ============================================================================
  // HTTP DELETE TESTS
  // ============================================================================

  describe('DELETE {{API_ROUTE}}/:id', () => {
    let resourceToDelete: string;

    beforeEach(async () => {
      const response = await request(appInstance)
        .post('{{API_ROUTE}}')
        .send({ name: 'Resource to Delete' })
        .expect(201);

      resourceToDelete = response.body.data.id;
    });

    it('should delete existing resource', async () => {
      await request(appInstance)
        .delete(`{{API_ROUTE}}/${resourceToDelete}`)
        .expect(204);

      // Verify resource no longer exists
      await request(appInstance)
        .get(`{{API_ROUTE}}/${resourceToDelete}`)
        .expect(404);
    });

    it('should return 404 for non-existent resource deletion', async () => {
      await request(appInstance)
        .delete('{{API_ROUTE}}/non-existent-id')
        .expect(404);
    });
  });

  // ============================================================================
  // AUTHENTICATION & AUTHORIZATION TESTS
  // ============================================================================

  describe('Authentication & Authorization', () => {
    it('should require authentication for protected routes', async () => {
      await request(appInstance)
        .get('{{API_ROUTE}}')
        .expect(401)
        .expect((res) => {
          expect(res.body.error.message).toContain('authentication required');
        });
    });

    it('should accept valid bearer token', async () => {
      const validToken = 'valid-test-token';

      await request(appInstance)
        .get('{{API_ROUTE}}')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });

    it('should reject invalid token', async () => {
      await request(appInstance)
        .get('{{API_ROUTE}}')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should enforce role-based access control', async () => {
      const userToken = 'user-role-token';
      const adminToken = 'admin-role-token';

      // Regular user cannot access admin route
      await request(appInstance)
        .post('{{API_ROUTE}}/admin-action')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      // Admin can access
      await request(appInstance)
        .post('{{API_ROUTE}}/admin-action')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should return 400 for malformed JSON', async () => {
      await request(appInstance)
        .post('{{API_ROUTE}}')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should return 500 for server errors with proper format', async () => {
      // Mock a server error scenario
      // This depends on your error handling middleware
    });

    it('should include request ID in error responses', async () => {
      const response = await request(appInstance)
        .get('{{API_ROUTE}}/non-existent')
        .expect(404);

      expect(response.body.error.requestId).toBeDefined();
    });
  });

  // ============================================================================
  // PERFORMANCE & LIMITS TESTS
  // ============================================================================

  describe('Performance & Limits', () => {
    it('should handle large payloads gracefully', async () => {
      const largePayload = {
        data: new Array(1000).fill({ field: 'value' })
      };

      await request(appInstance)
        .post('{{API_ROUTE}}/bulk')
        .send(largePayload)
        .expect((res) => {
          expect(res.statusCode).toBeLessThan(500);
        });
    });

    it('should enforce rate limiting', async () => {
      // Make requests up to rate limit
      const requests = Array.from({ length: 100 }, () =>
        request(appInstance).get('{{API_ROUTE}}')
      );

      const responses = await Promise.all(requests);

      // Should eventually get 429 Too Many Requests
      const rateLimitedResponse = responses.find(r => r.statusCode === 429);
      expect(rateLimitedResponse).toBeDefined();
    });
  });
});

// ============================================================================
// TEMPLATE METADATA (for generator introspection)
// ============================================================================
export const templateMetadata = {
  type: 'integration',
  framework: 'supertest-jest',
  targetCoverage: 75,
  patterns: ['api-contract', 'database-integration', 'auth-testing'],
  mcp: {
    servable: true,
    schemaVersion: '1.0',
    capabilities: ['contract-testing', 'schema-validation', 'api-mocking']
  }
};
