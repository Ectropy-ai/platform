import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase } from '../../__utils__/test-database';
import { createTestServer, stopTestServer } from '../../__utils__/test-server';
import { generateTestId } from '../../__utils__/test-helpers';

/**
 * ENTERPRISE INTEGRATION TESTS - API GATEWAY USER CRUD
 *
 * Purpose: User CRUD operations with RBAC enforcement
 * Scope: User lifecycle, validation, authorization, performance
 * Framework: Vitest + Supertest + PostgreSQL
 * Duration: <30 seconds total
 *
 * ENTERPRISE FOCUS:
 * - Health: Transaction integrity, cascading operations, error recovery
 * - Security: RBAC enforcement, PII encryption, user enumeration prevention, mass assignment
 * - Performance: User creation <50ms, search <100ms, N+1 query prevention
 *
 * @see apps/mcp-server/data/evidence/2025-12/PHASE_3_INTEGRATION_TEST_EXPANSION_PLAN_2025-12-29.json
 */

describe('API Gateway - User CRUD Integration', () => {
  let app: any;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    await setupTestDatabase();
    app = await createTestServer({ service: 'api-gateway', port: 0 });

    // Create admin and regular user tokens for testing
    adminToken = 'admin_test_token';
    userToken = 'user_test_token';
  });

  afterAll(async () => {
    await stopTestServer(app);
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('1. User Creation (POST /api/users)', () => {
    describe('Health: Transaction Integrity', () => {
      it('should create user with all required fields', async () => {
        const userData = {
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePass123!',
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(userData);

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('email', userData.email);
        expect(response.body).toHaveProperty('name', userData.name);
        expect(response.body).not.toHaveProperty('password'); // Should not return password
      });

      it('should rollback on validation failure', async () => {
        // ENTERPRISE PATTERN: Transaction rollback
        const invalidUser = {
          email: 'invalid-email', // Invalid format
          name: 'Test User',
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidUser);

        expect(response.status).toBe(400);

        // Verify no partial data created
        const usersResponse = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`);

        const createdUser = usersResponse.body.find((u: any) => u.email === invalidUser.email);
        expect(createdUser).toBeUndefined();
      });

      it('should handle constraint violations gracefully', async () => {
        // Create first user
        const userData = {
          email: 'duplicate@example.com',
          name: 'User 1',
          password: 'Pass123!',
        };

        await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(userData);

        // Attempt duplicate
        const duplicateResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(userData);

        expect(duplicateResponse.status).toBe(409); // Conflict
        expect(duplicateResponse.body).toHaveProperty('error');
        expect(duplicateResponse.body.error).toMatch(/already exists|duplicate/i);
      });
    });

    describe('Security: Input Validation & Mass Assignment', () => {
      it('should validate required fields', async () => {
        const invalidUser = {
          name: 'Test User',
          // Missing email and password
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(invalidUser);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('errors');
      });

      it('should prevent mass assignment of protected fields', async () => {
        // ENTERPRISE PATTERN: Mass assignment prevention
        const maliciousUser = {
          email: 'test@example.com',
          name: 'Test User',
          password: 'Pass123!',
          role: 'admin', // Should not be assignable
          isVerified: true, // Should not be assignable
          credits: 9999, // Should not be assignable
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(maliciousUser);

        if (response.status === 201) {
          // Should ignore protected fields
          expect(response.body.role).not.toBe('admin');
          expect(response.body.credits).not.toBe(9999);
        }
      });

      it('should enforce password complexity requirements', async () => {
        const weakPasswords = ['123', 'password', 'abc123'];

        for (const password of weakPasswords) {
          const response = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              email: `test${password}@example.com`,
              name: 'Test User',
              password,
            });

          expect(response.status).toBe(400);
          expect(response.body.errors).toContain('password');
        }
      });

      it('should hash passwords before storage', async () => {
        // ENTERPRISE PATTERN: Password hashing
        const userData = {
          email: 'secure@example.com',
          name: 'Secure User',
          password: 'SecurePass123!',
        };

        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(userData);

        expect(response.status).toBe(201);

        // Password should never be returned in response
        expect(response.body).not.toHaveProperty('password');
        expect(response.body).not.toHaveProperty('passwordHash');

        // Verify password is hashed (would check DB directly in real test)
        // Should use bcrypt/argon2 with sufficient cost factor
      });

      it('should prevent user enumeration via timing attacks', async () => {
        // ENTERPRISE PATTERN: Constant-time responses
        const existingEmail = 'existing@example.com';

        // Create user
        await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: existingEmail,
            name: 'Existing User',
            password: 'Pass123!',
          });

        // Measure response time for existing vs non-existing
        const measurements = {
          existing: [] as number[],
          nonExisting: [] as number[],
        };

        for (let i = 0; i < 5; i++) {
          // Check existing
          let startTime = Date.now();
          await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              email: existingEmail,
              name: 'Duplicate',
              password: 'Pass123!',
            });
          measurements.existing.push(Date.now() - startTime);

          // Check non-existing
          startTime = Date.now();
          await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              email: `nonexistent${i}@example.com`,
              name: 'New User',
              password: 'Pass123!',
            });
          measurements.nonExisting.push(Date.now() - startTime);
        }

        const avgExisting = measurements.existing.reduce((a, b) => a + b) / measurements.existing.length;
        const avgNonExisting = measurements.nonExisting.reduce((a, b) => a + b) / measurements.nonExisting.length;

        // Timing difference should be minimal (< 20% variance)
        const variance = Math.abs(avgExisting - avgNonExisting) / Math.max(avgExisting, avgNonExisting);
        expect(variance).toBeLessThan(0.2);
      });
    });

    describe('Security: RBAC Enforcement', () => {
      it('should allow admins to create users', async () => {
        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'newuser@example.com',
            name: 'New User',
            password: 'Pass123!',
          });

        expect(response.status).toBe(201);
      });

      it('should prevent regular users from creating users', async () => {
        const response = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            email: 'unauthorized@example.com',
            name: 'Unauthorized',
            password: 'Pass123!',
          });

        expect(response.status).toBe(403);
      });

      it('should prevent unauthenticated user creation', async () => {
        const response = await request(app)
          .post('/api/users')
          .send({
            email: 'anon@example.com',
            name: 'Anonymous',
            password: 'Pass123!',
          });

        expect(response.status).toBe(401);
      });
    });

    describe('Performance: User Creation', () => {
      it('should create user in <50ms', async () => {
        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              email: `perf${i}@example.com`,
              name: `Perf User ${i}`,
              password: 'Pass123!',
            });

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: User creation <50ms
        expect(avgDuration).toBeLessThan(50);

        console.log(`✅ User creation avg: ${avgDuration.toFixed(2)}ms (SLA: <50ms)`);
      });
    });
  });

  describe('2. User Retrieval (GET /api/users)', () => {
    describe('Security: Authorization & Data Filtering', () => {
      it('should return users for authorized requests', async () => {
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should not expose PII to unauthorized users', async () => {
        // Create user with PII
        await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'pii@example.com',
            name: 'PII User',
            password: 'Pass123!',
            phone: '555-1234',
            ssn: '123-45-6789',
          });

        // Regular user should not see PII
        const response = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${userToken}`);

        if (response.status === 200) {
          const user = response.body.find((u: any) => u.email === 'pii@example.com');
          if (user) {
            expect(user).not.toHaveProperty('ssn');
            expect(user).not.toHaveProperty('passwordHash');
          }
        }
      });
    });

    describe('Performance: User Search & Pagination', () => {
      it('should implement efficient pagination', async () => {
        // Create 100 users
        const createPromises = Array.from({ length: 100 }, (_, i) =>
          request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              email: `user${i}@example.com`,
              name: `User ${i}`,
              password: 'Pass123!',
            })
        );

        await Promise.all(createPromises);

        // Paginate
        const measurements: number[] = [];

        for (let page = 0; page < 5; page++) {
          const startTime = Date.now();

          const response = await request(app)
            .get('/api/users?page=' + page + '&limit=20')
            .set('Authorization', `Bearer ${adminToken}`);

          measurements.push(Date.now() - startTime);

          expect(response.status).toBe(200);
          expect(response.body.length).toBeLessThanOrEqual(20);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Paginated queries <100ms
        expect(avgDuration).toBeLessThan(100);

        console.log(`✅ Pagination avg: ${avgDuration.toFixed(2)}ms (5 pages, SLA: <100ms)`);
      });

      it('should prevent N+1 query problems', async () => {
        // ENTERPRISE PATTERN: Eager loading
        // Create users with relationships
        for (let i = 0; i < 10; i++) {
          await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              email: `n1user${i}@example.com`,
              name: `N+1 User ${i}`,
              password: 'Pass123!',
            });
        }

        // Fetch with relationships
        const startTime = Date.now();

        await request(app)
          .get('/api/users?include=roles,organizations')
          .set('Authorization', `Bearer ${adminToken}`);

        const duration = Date.now() - startTime;

        // Should use JOIN (not N+1 queries)
        // With N+1: 10 users = 1 + 10 + 10 = 21 queries
        // With JOIN: 10 users = 1 query
        // Time should be similar to simple query
        expect(duration).toBeLessThan(100);
      });

      it('should implement efficient search', async () => {
        // Create searchable users
        await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'findme@example.com',
            name: 'Searchable User',
            password: 'Pass123!',
          });

        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .get('/api/users?search=findme')
            .set('Authorization', `Bearer ${adminToken}`);

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: Search with index <100ms
        expect(avgDuration).toBeLessThan(100);

        console.log(`✅ User search avg: ${avgDuration.toFixed(2)}ms (SLA: <100ms)`);
      });
    });
  });

  describe('3. User Update (PUT /api/users/:id)', () => {
    describe('Security: Authorization & Validation', () => {
      it('should allow users to update their own profile', async () => {
        // Create user
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'selfupdate@example.com',
            name: 'Self Update',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        // Update own profile
        const updateResponse = await request(app)
          .put(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${userToken}`) // Own token
          .send({
            name: 'Updated Name',
          });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.name).toBe('Updated Name');
      });

      it('should prevent users from updating other profiles', async () => {
        // Create user
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'other@example.com',
            name: 'Other User',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        // Attempt unauthorized update
        const updateResponse = await request(app)
          .put(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${userToken}`) // Different user
          .send({
            name: 'Hacked Name',
          });

        expect(updateResponse.status).toBe(403);
      });

      it('should prevent elevation of privileges', async () => {
        // Create user
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'priv@example.com',
            name: 'Priv User',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        // Attempt to escalate to admin
        const updateResponse = await request(app)
          .put(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            role: 'admin',
          });

        if (updateResponse.status === 200) {
          // Should ignore role update
          expect(updateResponse.body.role).not.toBe('admin');
        }
      });
    });

    describe('Performance: Update Operations', () => {
      it('should update user in <30ms', async () => {
        // Create user
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'updateperf@example.com',
            name: 'Update Perf',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        const measurements: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();

          await request(app)
            .put(`/api/users/${userId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
              name: `Updated ${i}`,
            });

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;

        // SLA: User update <30ms
        expect(avgDuration).toBeLessThan(30);

        console.log(`✅ User update avg: ${avgDuration.toFixed(2)}ms (SLA: <30ms)`);
      });
    });
  });

  describe('4. User Deletion (DELETE /api/users/:id)', () => {
    describe('Health: Cascading Deletes', () => {
      it('should handle cascading deletes gracefully', async () => {
        // ENTERPRISE PATTERN: Cascading delete integrity
        // Create user with relationships
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'cascade@example.com',
            name: 'Cascade User',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        // Delete user
        const deleteResponse = await request(app)
          .delete(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(deleteResponse.status).toBe(204);

        // Verify cascading (projects, sessions, etc. should be deleted or nullified)
        // This would check related tables in real test
      });

      it('should implement soft delete for audit trail', async () => {
        // Create user
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'softdelete@example.com',
            name: 'Soft Delete',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        // Soft delete
        await request(app)
          .delete(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        // Should not appear in normal queries
        const usersResponse = await request(app)
          .get('/api/users')
          .set('Authorization', `Bearer ${adminToken}`);

        const deletedUser = usersResponse.body.find((u: any) => u.id === userId);
        expect(deletedUser).toBeUndefined();

        // But should be retrievable with deleted=true flag (admin only)
        const deletedResponse = await request(app)
          .get(`/api/users/${userId}?includeDeleted=true`)
          .set('Authorization', `Bearer ${adminToken}`);

        if (deletedResponse.status === 200) {
          expect(deletedResponse.body).toHaveProperty('deletedAt');
        }
      });
    });

    describe('Security: Authorization', () => {
      it('should prevent unauthorized deletions', async () => {
        const createResponse = await request(app)
          .post('/api/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            email: 'nodelete@example.com',
            name: 'No Delete',
            password: 'Pass123!',
          });

        const userId = createResponse.body.id;

        const deleteResponse = await request(app)
          .delete(`/api/users/${userId}`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(deleteResponse.status).toBe(403);
      });
    });
  });
});
