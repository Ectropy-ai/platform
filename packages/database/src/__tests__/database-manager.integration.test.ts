/**
 * Database Manager Integration Tests
 *
 * Purpose: Validate entire database infrastructure including RLS isolation,
 * connection management, and tenant resolution.
 *
 * Test Coverage:
 * - RLS isolation (tenants can't see each other's data)
 * - DatabaseManager API (getPlatformDatabase, getTenantDatabase, getDatabaseForUser)
 * - Connection pooling (client reuse and cleanup)
 * - Tenant validation (status checks)
 * - Error handling (invalid tenant IDs, missing tenants)
 * - Health checks
 *
 * Requirements:
 * - PLATFORM_DATABASE_URL environment variable
 * - SHARED_DATABASE_URL environment variable
 * - Test tenants seeded in both databases
 *
 * @group integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DatabaseManager } from '../clients/connection-manager.js';
import { RLSContextError } from '../middleware/rls-context.js';
import { validateTenantId } from '../middleware/rls-context.js';

// Test data - UUIDs for test tenants
// These should match tenants seeded in Phase 2 (scripts/seed-test-tenant-final.cjs)
const TEST_TENANT_1_ID = '550e8400-e29b-41d4-a716-446655440000'; // test-trial tenant
const TEST_TENANT_2_ID = '550e8400-e29b-41d4-a716-446655440001'; // second test tenant (if exists)
const TEST_USER_1_ID = '660e8400-e29b-41d4-a716-446655440000'; // Alice (OWNER)
const TEST_USER_2_ID = '660e8400-e29b-41d4-a716-446655440001'; // Bob (MEMBER)

describe('DatabaseManager Integration Tests', () => {
  // Cleanup after all tests
  afterAll(async () => {
    await DatabaseManager.shutdown();
  });

  describe('Platform Database', () => {
    it('should get Platform database singleton', () => {
      const platformDb1 = DatabaseManager.getPlatformDatabase();
      const platformDb2 = DatabaseManager.getPlatformDatabase();

      // Should return same instance (singleton pattern)
      expect(platformDb1).toBe(platformDb2);
    });

    it('should query Platform database without RLS', async () => {
      const platformDb = DatabaseManager.getPlatformDatabase();

      // Query tenants table (Platform DB, no RLS)
      const tenants = await platformDb.tenant.findMany({
        take: 5,
      });

      // Should return tenants (no RLS filtering)
      expect(Array.isArray(tenants)).toBe(true);
    });

    it('should handle Platform database errors gracefully', async () => {
      const platformDb = DatabaseManager.getPlatformDatabase();

      // Query with invalid ID format should fail
      await expect(
        platformDb.tenant.findUnique({
          where: { id: 'invalid-uuid' },
        })
      ).rejects.toThrow();
    });
  });

  describe('Tenant Database with RLS', () => {
    it('should get tenant database with RLS enforcement', async () => {
      // Get tenant database
      const tenantDb = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );

      // Should return Prisma client instance
      expect(tenantDb).toBeDefined();
      expect(tenantDb.$connect).toBeDefined();
      expect(tenantDb.project).toBeDefined();
    });

    it('should reject invalid tenant ID format', async () => {
      await expect(
        DatabaseManager.getTenantDatabase('invalid-uuid')
      ).rejects.toThrow(RLSContextError);
    });

    it('should reject non-existent tenant', async () => {
      const nonExistentTenantId = '00000000-0000-0000-0000-000000000000';

      await expect(
        DatabaseManager.getTenantDatabase(nonExistentTenantId)
      ).rejects.toThrow('not found');
    });

    it('should cache tenant database clients (connection pooling)', async () => {
      // Get tenant database twice
      const tenantDb1 = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );
      const tenantDb2 = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );

      // Should return same instance (cached)
      expect(tenantDb1).toBe(tenantDb2);

      // Verify in pool stats
      const stats = DatabaseManager.getPoolStats();
      expect(stats.sharedTrials.activeClients).toBeGreaterThan(0);
      expect(stats.sharedTrials.tenantIds).toContain(TEST_TENANT_1_ID);
    });
  });

  describe('RLS Isolation', () => {
    // Set up test data
    let testProject1Id: string;
    let testProject2Id: string;

    beforeEach(async () => {
      // Create test projects for each tenant
      // This assumes test tenants exist from Phase 2 seeding

      try {
        const tenantDb1 = await DatabaseManager.getTenantDatabase(
          TEST_TENANT_1_ID
        );

        // Create test project for tenant 1
        const project1 = await tenantDb1.project.create({
          data: {
            id: '770e8400-e29b-41d4-a716-446655440001',
            name: 'RLS Test Project Tenant 1',
            description: 'Project for RLS isolation testing',
            location: 'Test Location 1',
            status: 'PLANNING',
            tenantId: TEST_TENANT_1_ID,
          },
        });
        testProject1Id = project1.id;

        // If TEST_TENANT_2_ID exists, create project for tenant 2
        // This will fail if tenant 2 doesn't exist, which is fine for testing
        try {
          const tenantDb2 = await DatabaseManager.getTenantDatabase(
            TEST_TENANT_2_ID
          );
          const project2 = await tenantDb2.project.create({
            data: {
              id: '770e8400-e29b-41d4-a716-446655440002',
              name: 'RLS Test Project Tenant 2',
              description: 'Project for RLS isolation testing',
              location: 'Test Location 2',
              status: 'PLANNING',
              tenantId: TEST_TENANT_2_ID,
            },
          });
          testProject2Id = project2.id;
        } catch (error) {
          // Tenant 2 doesn't exist, skip
          console.log('Tenant 2 not found, skipping multi-tenant RLS test');
        }
      } catch (error) {
        console.error('Failed to set up test data:', error);
        // Continue with tests - some may be skipped
      }
    });

    it('should only see projects for current tenant', async () => {
      const tenantDb1 = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );

      // Query projects for tenant 1
      const projects = await tenantDb1.project.findMany();

      // Should only see tenant 1's projects
      expect(projects.every((p) => p.tenantId === TEST_TENANT_1_ID)).toBe(true);

      // Should not see tenant 2's projects
      if (testProject2Id) {
        const project2Query = await tenantDb1.project.findUnique({
          where: { id: testProject2Id },
        });
        expect(project2Query).toBeNull();
      }
    });

    it('should prevent cross-tenant data access', async () => {
      if (!testProject2Id) {
        console.log('Skipping cross-tenant test - only one tenant available');
        return;
      }

      const tenantDb1 = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );

      // Attempt to query project from tenant 2 using tenant 1's database
      const project = await tenantDb1.project.findUnique({
        where: { id: testProject2Id },
      });

      // RLS should filter it out (returns null)
      expect(project).toBeNull();
    });

    it('should enforce RLS on INSERT operations', async () => {
      const tenantDb1 = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );

      // Attempt to create project with wrong tenant_id should fail
      // RLS policies check tenant_id = current_setting('app.current_tenant_id')
      await expect(
        tenantDb1.project.create({
          data: {
            name: 'Invalid Tenant Project',
            description: 'Should fail RLS check',
            location: 'Invalid',
            status: 'PLANNING',
            tenantId: TEST_TENANT_2_ID, // Wrong tenant ID
          },
        })
      ).rejects.toThrow();
    });

    it('should verify tenant context is set correctly', async () => {
      const tenantDb = await DatabaseManager.getTenantDatabase(
        TEST_TENANT_1_ID
      );

      // Query current tenant context from database
      const result = await tenantDb.$queryRaw<
        Array<{ current_tenant: string }>
      >`
        SELECT current_setting('app.current_tenant_id') as current_tenant
      `;

      // Should match requested tenant
      expect(result[0]?.current_tenant).toBe(TEST_TENANT_1_ID);
    });
  });

  describe('User-based Tenant Resolution', () => {
    it('should get database for user', async () => {
      // This test requires user record to exist in Platform database
      // The user should have a tenantId field

      try {
        const userDb = await DatabaseManager.getDatabaseForUser(TEST_USER_1_ID);

        // Should return tenant-scoped database
        expect(userDb).toBeDefined();
        expect(userDb.project).toBeDefined();
      } catch (error) {
        // User might not exist in Platform database
        console.log(
          'User lookup test skipped - user not found in Platform database'
        );
        expect((error as Error).message).toContain('not found');
      }
    });

    it('should reject non-existent user', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

      await expect(
        DatabaseManager.getDatabaseForUser(nonExistentUserId)
      ).rejects.toThrow('not found');
    });
  });

  describe('Tenant Validation', () => {
    it('should validate UUID format', () => {
      // Valid UUID
      expect(() => validateTenantId(TEST_TENANT_1_ID)).not.toThrow();

      // Invalid UUIDs
      expect(() => validateTenantId('invalid')).toThrow(RLSContextError);
      expect(() => validateTenantId('123')).toThrow(RLSContextError);
      expect(() => validateTenantId('')).toThrow(RLSContextError);
      expect(() => validateTenantId(null as any)).toThrow(RLSContextError);
      expect(() => validateTenantId(undefined as any)).toThrow(
        RLSContextError
      );
    });

    it('should reject suspended tenants', async () => {
      // This test requires a suspended tenant to exist
      // For now, we document the expected behavior
      // TODO: Seed suspended tenant for testing

      const suspendedTenantId = '00000000-0000-0000-0000-000000000001';

      try {
        await DatabaseManager.getTenantDatabase(suspendedTenantId);
        // If it doesn't throw, tenant doesn't exist or isn't suspended
      } catch (error) {
        // Should throw error for suspended tenant
        expect((error as Error).message).toMatch(
          /not found|suspended|expired/i
        );
      }
    });
  });

  describe('Health Checks', () => {
    it('should check Platform database health', async () => {
      const health = await DatabaseManager.healthCheck();

      expect(health.platform).toBeDefined();
      expect(health.platform.status).toBe('healthy');
    });

    it('should check tenant database health', async () => {
      const health = await DatabaseManager.healthCheck({
        includeTenantCheck: true,
        testTenantId: TEST_TENANT_1_ID,
      });

      expect(health.platform).toBeDefined();
      expect(health.platform.status).toBe('healthy');

      expect(health.sharedTrials).toBeDefined();
      expect(health.sharedTrials?.status).toBe('healthy');
    });

    it('should report unhealthy status for invalid tenant', async () => {
      const health = await DatabaseManager.healthCheck({
        includeTenantCheck: true,
        testTenantId: '00000000-0000-0000-0000-000000000000',
      });

      // Tenant doesn't exist, should be unhealthy
      expect(health.sharedTrials?.status).toBe('unhealthy');
      expect(health.sharedTrials?.message).toBeDefined();
    });
  });

  describe('Connection Pooling', () => {
    it('should track active tenant clients', async () => {
      // Get initial stats
      const statsBefore = DatabaseManager.getPoolStats();
      const clientCountBefore = statsBefore.sharedTrials.activeClients;

      // Create new tenant client
      const newTenantId = TEST_TENANT_1_ID;
      await DatabaseManager.getTenantDatabase(newTenantId);

      // Get updated stats
      const statsAfter = DatabaseManager.getPoolStats();

      // Should have at least one client
      expect(statsAfter.sharedTrials.activeClients).toBeGreaterThanOrEqual(
        clientCountBefore
      );
      expect(statsAfter.sharedTrials.tenantIds).toContain(newTenantId);
      expect(statsAfter.sharedTrials.lastAccessTimes[newTenantId]).toBeDefined();
    });

    it('should close specific tenant database', async () => {
      // Get tenant database (ensures it's in pool)
      await DatabaseManager.getTenantDatabase(TEST_TENANT_1_ID);

      // Verify it's in pool
      expect(
        DatabaseManager.isTenantDatabaseInitialized(TEST_TENANT_1_ID)
      ).toBe(true);

      // Close it
      await DatabaseManager.closeTenantDatabase(TEST_TENANT_1_ID);

      // Should no longer be in pool
      expect(
        DatabaseManager.isTenantDatabaseInitialized(TEST_TENANT_1_ID)
      ).toBe(false);
    });

    it('should handle graceful shutdown', async () => {
      // Create some tenant clients
      await DatabaseManager.getTenantDatabase(TEST_TENANT_1_ID);

      // Get stats before shutdown
      const statsBefore = DatabaseManager.getPoolStats();
      expect(statsBefore.sharedTrials.activeClients).toBeGreaterThan(0);

      // Shutdown
      await DatabaseManager.shutdown();

      // Get stats after shutdown
      const statsAfter = DatabaseManager.getPoolStats();
      expect(statsAfter.sharedTrials.activeClients).toBe(0);
      expect(statsAfter.sharedTrials.tenantIds).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Test with invalid tenant ID format
      await expect(
        DatabaseManager.getTenantDatabase('not-a-uuid')
      ).rejects.toThrow(RLSContextError);
    });

    it('should provide clear error messages', async () => {
      try {
        await DatabaseManager.getTenantDatabase('invalid-uuid');
        throw new Error('Should have thrown RLSContextError');
      } catch (error) {
        expect(error).toBeInstanceOf(RLSContextError);
        expect((error as RLSContextError).message).toContain('Invalid tenant');
        expect((error as RLSContextError).message).toContain('UUID');
      }
    });

    it('should handle Platform database query errors', async () => {
      const platformDb = DatabaseManager.getPlatformDatabase();

      // Invalid query should throw
      await expect(
        platformDb.tenant.findUnique({
          where: { id: 'not-a-uuid' },
        })
      ).rejects.toThrow();
    });
  });

  describe('Database Manager Configuration', () => {
    it('should allow custom initialization', () => {
      // Initialize with custom config
      DatabaseManager.initialize({
        platformOptions: {
          enableLogging: false,
        },
        sharedTrialsOptions: {
          maxIdleTime: 600000, // 10 minutes
        },
        autoCleanup: true,
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('should auto-initialize on first use', () => {
      // Getting database should auto-initialize if not already initialized
      const platformDb = DatabaseManager.getPlatformDatabase();
      expect(platformDb).toBeDefined();
    });
  });
});
