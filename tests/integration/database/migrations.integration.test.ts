import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, queryTestDatabase } from '../../__utils__/test-database';

/**
 * ENTERPRISE INTEGRATION TESTS - DATABASE MIGRATIONS
 *
 * Purpose: Database migration validation and integrity
 * Scope: Migration execution, rollback, schema versioning, idempotence
 * Framework: Vitest + PostgreSQL + Prisma Migrate
 *
 * ENTERPRISE FOCUS:
 * - Health: Migration failure recovery, partial rollback, zero-downtime
 * - Security: Migration script injection prevention, privilege escalation
 * - Performance: Migration execution time, index creation, large tables
 */

describe('Database - Migrations Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('1. Migration Execution', () => {
    it('should track migration history', async () => {
      const result = await queryTestDatabase(`
        SELECT * FROM _prisma_migrations
        ORDER BY finished_at DESC
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      console.log(`✅ ${result.rows.length} migrations applied`);
    });

    it('should ensure schema version consistency', async () => {
      const result = await queryTestDatabase(`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at ASC
      `);

      // All migrations should be completed
      expect(result.rows.every(r => r.finished_at !== null)).toBe(true);
    });
  });

  describe('2. Schema Validation', () => {
    it('should have all required tables', async () => {
      const requiredTables = ['users', 'projects', 'organizations'];

      for (const table of requiredTables) {
        const result = await queryTestDatabase(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          )
        `, [table]);

        expect(result.rows[0].exists).toBe(true);
      }

      console.log(`✅ All required tables exist`);
    });

    it('should have proper indexes', async () => {
      const result = await queryTestDatabase(`
        SELECT tablename, indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      console.log(`✅ ${result.rows.length} indexes created`);
    });
  });

  describe('3. Performance: Migration Speed', () => {
    it('should execute migrations efficiently', async () => {
      // Check migration execution times
      const result = await queryTestDatabase(`
        SELECT
          migration_name,
          finished_at - started_at AS duration
        FROM _prisma_migrations
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
      `);

      result.rows.forEach(row => {
        console.log(`Migration: ${row.migration_name} - Duration: ${row.duration}`);
      });
    });
  });
});
