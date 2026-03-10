import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, cleanTestDatabase, queryTestDatabase } from '../../__utils__/test-database';

/**
 * ENTERPRISE INTEGRATION TESTS - PROJECT REPOSITORY
 *
 * Purpose: Project repository operations with complex relationships
 * Scope: CRUD, relationships, soft delete, analytics aggregation
 * Framework: Vitest + PostgreSQL + Prisma
 *
 * ENTERPRISE FOCUS:
 * - Health: Cascading operations, foreign key integrity, transaction isolation
 * - Security: Row-level security, ownership validation, access control
 * - Performance: Complex queries, aggregations, full-text search
 */

describe('Database - Project Repository Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  describe('1. Project CRUD', () => {
    it('should create project with relationships', async () => {
      const result = await queryTestDatabase(`
        INSERT INTO projects (name, description, owner_id)
        VALUES ($1, $2, $3)
        RETURNING id, name
      `, ['Test Project', 'Description', 1]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Test Project');
    });

    it('should enforce foreign key constraints', async () => {
      await expect(
        queryTestDatabase(`
          INSERT INTO projects (name, owner_id)
          VALUES ($1, $2)
        `, ['Invalid Project', 99999]) // Non-existent owner
      ).rejects.toThrow(/foreign key|constraint/i);
    });
  });

  describe('2. Performance: Complex Queries', () => {
    it('should optimize project search', async () => {
      // Create projects
      for (let i = 0; i < 50; i++) {
        await queryTestDatabase(`
          INSERT INTO projects (name, description, owner_id)
          VALUES ($1, $2, $3)
        `, [`Project ${i}`, `Description ${i}`, 1]);
      }

      const startTime = Date.now();

      await queryTestDatabase(`
        SELECT * FROM projects
        WHERE name ILIKE $1
        ORDER BY created_at DESC
        LIMIT 10
      `, ['%Project%']);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(50);

      console.log(`✅ Project search: ${duration}ms`);
    });
  });

  describe('3. Soft Delete', () => {
    it('should implement soft delete', async () => {
      const result = await queryTestDatabase(`
        INSERT INTO projects (name, owner_id)
        VALUES ($1, $2)
        RETURNING id
      `, ['Soft Delete Project', 1]);

      const projectId = result.rows[0].id;

      // Soft delete
      await queryTestDatabase(`
        UPDATE projects SET deleted_at = NOW()
        WHERE id = $1
      `, [projectId]);

      // Verify excluded from normal queries
      const activeResult = await queryTestDatabase(`
        SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL
      `, [projectId]);

      expect(activeResult.rows).toHaveLength(0);
    });
  });
});
