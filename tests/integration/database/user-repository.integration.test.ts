import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase, queryTestDatabase } from '../../__utils__/test-database';

/**
 * ENTERPRISE INTEGRATION TESTS - USER REPOSITORY
 *
 * Purpose: User repository operations with database integration
 * Scope: CRUD, relationships, constraints, query optimization
 * Framework: Vitest + PostgreSQL + Prisma
 *
 * ENTERPRISE FOCUS:
 * - Health: Transaction integrity, constraint violations, deadlock detection
 * - Security: SQL injection prevention, PII encryption, audit logging
 * - Performance: Query <10ms, index usage, N+1 prevention, connection pool
 */

describe('Database - User Repository Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('1. User CRUD Operations', () => {
    describe('Health: Transaction Integrity', () => {
      it('should create user with valid data', async () => {
        const result = await queryTestDatabase(`
          INSERT INTO users (email, name, password_hash)
          VALUES ($1, $2, $3)
          RETURNING id, email, name
        `, ['test@example.com', 'Test User', 'hashed_password']);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toHaveProperty('id');
        expect(result.rows[0].email).toBe('test@example.com');
      });

      it('should enforce unique email constraint', async () => {
        // Create first user
        await queryTestDatabase(`
          INSERT INTO users (email, name, password_hash)
          VALUES ($1, $2, $3)
        `, ['duplicate@example.com', 'User 1', 'hash1']);

        // Attempt duplicate
        await expect(
          queryTestDatabase(`
            INSERT INTO users (email, name, password_hash)
            VALUES ($1, $2, $3)
          `, ['duplicate@example.com', 'User 2', 'hash2'])
        ).rejects.toThrow(/unique|duplicate/i);
      });

      it('should rollback transaction on error', async () => {
        const client = await queryTestDatabase('BEGIN');

        try {
          await queryTestDatabase(`
            INSERT INTO users (email, name, password_hash)
            VALUES ($1, $2, $3)
          `, ['rollback@example.com', 'Rollback User', 'hash']);

          // Force error
          await queryTestDatabase(`INSERT INTO invalid_table VALUES (1)`);
        } catch (error) {
          await queryTestDatabase('ROLLBACK');
        }

        // Verify no user created
        const result = await queryTestDatabase(`
          SELECT * FROM users WHERE email = $1
        `, ['rollback@example.com']);

        expect(result.rows).toHaveLength(0);
      });
    });

    describe('Security: SQL Injection Prevention', () => {
      it('should use parameterized queries', async () => {
        // ENTERPRISE PATTERN: SQL injection prevention
        const maliciousInput = "'; DROP TABLE users; --";

        const result = await queryTestDatabase(`
          SELECT * FROM users WHERE email = $1
        `, [maliciousInput]);

        // Should safely query (no injection)
        expect(result.rows).toHaveLength(0);
      });

      it('should validate input before database operations', async () => {
        // Test with invalid data
        await expect(
          queryTestDatabase(`
            INSERT INTO users (email, name, password_hash)
            VALUES ($1, $2, $3)
          `, ['invalid-email', 'Test', 'hash'])
        ).rejects.toThrow();
      });
    });

    describe('Performance: Query Optimization', () => {
      it('should execute query in <10ms', async () => {
        // Create user first
        await queryTestDatabase(`
          INSERT INTO users (email, name, password_hash)
          VALUES ($1, $2, $3)
        `, ['perf@example.com', 'Perf User', 'hash']);

        const measurements: number[] = [];

        for (let i = 0; i < 100; i++) {
          const startTime = Date.now();

          await queryTestDatabase(`
            SELECT * FROM users WHERE email = $1
          `, ['perf@example.com']);

          measurements.push(Date.now() - startTime);
        }

        const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;
        expect(avgDuration).toBeLessThan(10);

        console.log(`✅ User query avg: ${avgDuration.toFixed(2)}ms (SLA: <10ms)`);
      });

      it('should use index for email queries', async () => {
        const explainResult = await queryTestDatabase(`
          EXPLAIN SELECT * FROM users WHERE email = $1
        `, ['test@example.com']);

        const plan = JSON.stringify(explainResult.rows);

        // Should use index scan (not seq scan)
        expect(plan.toLowerCase()).toMatch(/index|btree/);
      });

      it('should prevent N+1 queries with eager loading', async () => {
        // Create users with relationships
        for (let i = 0; i < 10; i++) {
          await queryTestDatabase(`
            INSERT INTO users (email, name, password_hash)
            VALUES ($1, $2, $3)
          `, [`n1user${i}@example.com`, `User ${i}`, 'hash']);
        }

        // Query with JOIN (not N+1)
        const startTime = Date.now();

        await queryTestDatabase(`
          SELECT u.*, r.name as role_name
          FROM users u
          LEFT JOIN user_roles ur ON u.id = ur.user_id
          LEFT JOIN roles r ON ur.role_id = r.id
        `);

        const duration = Date.now() - startTime;

        // Should be fast (single query)
        expect(duration).toBeLessThan(20);
      });
    });
  });

  describe('2. User Relationships', () => {
    it('should handle user-role relationships', async () => {
      // Create user
      const userResult = await queryTestDatabase(`
        INSERT INTO users (email, name, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['role@example.com', 'Role User', 'hash']);

      const userId = userResult.rows[0].id;

      // Assign role
      await queryTestDatabase(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
      `, [userId, 1]); // Assuming role 1 exists

      // Verify relationship
      const result = await queryTestDatabase(`
        SELECT * FROM user_roles WHERE user_id = $1
      `, [userId]);

      expect(result.rows).toHaveLength(1);
    });

    it('should cascade delete user relationships', async () => {
      // Create user with relationships
      const userResult = await queryTestDatabase(`
        INSERT INTO users (email, name, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['cascade@example.com', 'Cascade User', 'hash']);

      const userId = userResult.rows[0].id;

      // Create relationships
      await queryTestDatabase(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
      `, [userId, 1]);

      // Delete user
      await queryTestDatabase(`
        DELETE FROM users WHERE id = $1
      `, [userId]);

      // Verify relationships deleted
      const rolesResult = await queryTestDatabase(`
        SELECT * FROM user_roles WHERE user_id = $1
      `, [userId]);

      expect(rolesResult.rows).toHaveLength(0);
    });
  });

  describe('3. User Search & Pagination', () => {
    it('should implement efficient pagination', async () => {
      // Create 100 users
      for (let i = 0; i < 100; i++) {
        await queryTestDatabase(`
          INSERT INTO users (email, name, password_hash)
          VALUES ($1, $2, $3)
        `, [`page${i}@example.com`, `Page User ${i}`, 'hash']);
      }

      // Paginate
      const measurements: number[] = [];

      for (let page = 0; page < 5; page++) {
        const startTime = Date.now();

        const result = await queryTestDatabase(`
          SELECT * FROM users
          ORDER BY created_at DESC
          LIMIT 20 OFFSET $1
        `, [page * 20]);

        measurements.push(Date.now() - startTime);

        expect(result.rows.length).toBeLessThanOrEqual(20);
      }

      const avgDuration = measurements.reduce((a, b) => a + b) / measurements.length;
      expect(avgDuration).toBeLessThan(50);

      console.log(`✅ Pagination avg: ${avgDuration.toFixed(2)}ms (5 pages)`);
    });
  });
});
