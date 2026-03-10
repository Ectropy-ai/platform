/**
 * MT-M3 Row-Level Security Integration Tests
 *
 * Tests for PostgreSQL RLS policies ensuring tenant data isolation.
 * Verifies PIPEDA compliance requirements for multi-tenant data protection.
 *
 * @module tests/integration/multi-tenant/rls.integration.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Test configuration
const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// Test data
interface TestTenant {
  id: string;
  slug: string;
  name: string;
}

interface TestProject {
  id: string;
  tenant_id: string;
  name: string;
}

interface TestUser {
  id: string;
  tenant_id: string | null;
  email: string;
  is_platform_admin: boolean;
}

describe('MT-M3 Row-Level Security Integration Tests', () => {
  let pool: Pool;
  let client: PoolClient;

  // Test tenants
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  // Test projects
  let projectA1: TestProject;
  let projectA2: TestProject;
  let projectB1: TestProject;

  // Test users
  let userA: TestUser;
  let userB: TestUser;
  let platformAdmin: TestUser;

  beforeAll(async () => {
    if (!TEST_DB_URL) {
      console.warn('Skipping RLS tests: No database URL configured');
      return;
    }

    pool = new Pool({ connectionString: TEST_DB_URL });
    client = await pool.connect();

    // Create test tenants
    tenantA = {
      id: uuidv4(),
      slug: `test-tenant-a-${Date.now()}`,
      name: 'Test Tenant A',
    };
    tenantB = {
      id: uuidv4(),
      slug: `test-tenant-b-${Date.now()}`,
      name: 'Test Tenant B',
    };

    await client.query(
      `INSERT INTO tenants (id, slug, name, status) VALUES ($1, $2, $3, 'ACTIVE'), ($4, $5, $6, 'ACTIVE')`,
      [tenantA.id, tenantA.slug, tenantA.name, tenantB.id, tenantB.slug, tenantB.name]
    );

    // Create test projects
    projectA1 = { id: uuidv4(), tenant_id: tenantA.id, name: 'Project A1' };
    projectA2 = { id: uuidv4(), tenant_id: tenantA.id, name: 'Project A2' };
    projectB1 = { id: uuidv4(), tenant_id: tenantB.id, name: 'Project B1' };

    await client.query(
      `INSERT INTO projects (id, tenant_id, name, status) VALUES
       ($1, $2, $3, 'ACTIVE'), ($4, $5, $6, 'ACTIVE'), ($7, $8, $9, 'ACTIVE')`,
      [
        projectA1.id, projectA1.tenant_id, projectA1.name,
        projectA2.id, projectA2.tenant_id, projectA2.name,
        projectB1.id, projectB1.tenant_id, projectB1.name,
      ]
    );

    // Create test users
    userA = {
      id: uuidv4(),
      tenant_id: tenantA.id,
      email: `user-a-${Date.now()}@test.com`,
      is_platform_admin: false,
    };
    userB = {
      id: uuidv4(),
      tenant_id: tenantB.id,
      email: `user-b-${Date.now()}@test.com`,
      is_platform_admin: false,
    };
    platformAdmin = {
      id: uuidv4(),
      tenant_id: null,
      email: `admin-${Date.now()}@test.com`,
      is_platform_admin: true,
    };

    await client.query(
      `INSERT INTO users (id, tenant_id, email, is_platform_admin, name, role, auth_method) VALUES
       ($1, $2, $3, $4, 'User A', 'user', 'email'),
       ($5, $6, $7, $8, 'User B', 'user', 'email'),
       ($9, $10, $11, $12, 'Platform Admin', 'admin', 'email')`,
      [
        userA.id, userA.tenant_id, userA.email, userA.is_platform_admin,
        userB.id, userB.tenant_id, userB.email, userB.is_platform_admin,
        platformAdmin.id, platformAdmin.tenant_id, platformAdmin.email, platformAdmin.is_platform_admin,
      ]
    );
  });

  afterAll(async () => {
    if (!pool) return;

    // Clean up test data
    try {
      await client.query(`DELETE FROM users WHERE email LIKE '%@test.com'`);
      await client.query(`DELETE FROM projects WHERE name LIKE 'Project %'`);
      await client.query(`DELETE FROM tenants WHERE slug LIKE 'test-tenant-%'`);
    } catch (error) {
      console.error('Cleanup error:', error);
    }

    client.release();
    await pool.end();
  });

  // Helper to set tenant context
  async function setTenantContext(tenantId: string | null, isPlatformAdmin: boolean = false): Promise<void> {
    if (tenantId) {
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    } else {
      await client.query("SELECT set_config('app.current_tenant_id', '', true)");
    }
    await client.query("SELECT set_config('app.is_platform_admin', $1, true)", [
      isPlatformAdmin ? 'true' : 'false',
    ]);
  }

  // Helper to clear tenant context
  async function clearTenantContext(): Promise<void> {
    await client.query("SELECT set_config('app.current_tenant_id', '', true)");
    await client.query("SELECT set_config('app.is_platform_admin', 'false', true)");
  }

  describe('Project Isolation', () => {
    beforeEach(async () => {
      await clearTenantContext();
    });

    it('should only return projects belonging to current tenant', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT * FROM projects');
      const projectIds = result.rows.map((p: any) => p.id);

      expect(projectIds).toContain(projectA1.id);
      expect(projectIds).toContain(projectA2.id);
      expect(projectIds).not.toContain(projectB1.id);
    });

    it('should not allow Tenant A to see Tenant B projects', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT * FROM projects WHERE id = $1', [projectB1.id]);

      expect(result.rows).toHaveLength(0);
    });

    it('should not allow Tenant B to see Tenant A projects', async () => {
      await setTenantContext(tenantB.id);

      const result = await client.query('SELECT * FROM projects WHERE id = $1', [projectA1.id]);

      expect(result.rows).toHaveLength(0);
    });

    it('should allow platform admin to see all projects', async () => {
      await setTenantContext(null, true);

      const result = await client.query('SELECT * FROM projects WHERE id IN ($1, $2, $3)', [
        projectA1.id,
        projectA2.id,
        projectB1.id,
      ]);

      expect(result.rows).toHaveLength(3);
    });
  });

  describe('User Isolation', () => {
    beforeEach(async () => {
      await clearTenantContext();
    });

    it('should only return users belonging to current tenant', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT * FROM users WHERE tenant_id IS NOT NULL');
      const userIds = result.rows.map((u: any) => u.id);

      expect(userIds).toContain(userA.id);
      expect(userIds).not.toContain(userB.id);
    });

    it('should allow platform admin to see all users', async () => {
      await setTenantContext(null, true);

      const result = await client.query('SELECT * FROM users WHERE id IN ($1, $2, $3)', [
        userA.id,
        userB.id,
        platformAdmin.id,
      ]);

      expect(result.rows).toHaveLength(3);
    });

    it('should allow access to platform admins (null tenant_id)', async () => {
      await setTenantContext(tenantA.id);

      // Platform admin has NULL tenant_id, should be visible
      const result = await client.query('SELECT * FROM users WHERE id = $1', [platformAdmin.id]);

      expect(result.rows).toHaveLength(1);
    });
  });

  describe('Tenant Isolation', () => {
    beforeEach(async () => {
      await clearTenantContext();
    });

    it('should only allow tenant to see their own tenant record', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT * FROM tenants');
      const tenantIds = result.rows.map((t: any) => t.id);

      expect(tenantIds).toContain(tenantA.id);
      expect(tenantIds).not.toContain(tenantB.id);
    });

    it('should allow platform admin to see all tenants', async () => {
      await setTenantContext(null, true);

      const result = await client.query('SELECT * FROM tenants WHERE id IN ($1, $2)', [
        tenantA.id,
        tenantB.id,
      ]);

      expect(result.rows).toHaveLength(2);
    });
  });

  describe('Cross-Tenant Write Prevention', () => {
    beforeEach(async () => {
      await clearTenantContext();
    });

    it('should not allow creating project for another tenant', async () => {
      await setTenantContext(tenantA.id);

      // Attempt to create project for Tenant B while in Tenant A context
      await expect(
        client.query(
          `INSERT INTO projects (id, tenant_id, name, status) VALUES ($1, $2, $3, 'ACTIVE')`,
          [uuidv4(), tenantB.id, 'Malicious Project']
        )
      ).rejects.toThrow();
    });

    it('should not allow updating project of another tenant', async () => {
      await setTenantContext(tenantA.id);

      // Attempt to update Tenant B's project
      const result = await client.query(
        `UPDATE projects SET name = 'Hacked' WHERE id = $1`,
        [projectB1.id]
      );

      // RLS should prevent the update (0 rows affected)
      expect(result.rowCount).toBe(0);
    });

    it('should not allow deleting project of another tenant', async () => {
      await setTenantContext(tenantA.id);

      // Attempt to delete Tenant B's project
      const result = await client.query(`DELETE FROM projects WHERE id = $1`, [projectB1.id]);

      // RLS should prevent the delete (0 rows affected)
      expect(result.rowCount).toBe(0);
    });
  });

  describe('Audit Log Isolation', () => {
    let auditLogA: string;
    let auditLogB: string;
    let platformAuditLog: string;

    beforeAll(async () => {
      // Create test audit logs
      auditLogA = uuidv4();
      auditLogB = uuidv4();
      platformAuditLog = uuidv4();

      await client.query(
        `INSERT INTO audit_log (id, tenant_id, action, entity_type, entity_id, user_id) VALUES
         ($1, $2, 'CREATE', 'project', $3, $4),
         ($5, $6, 'CREATE', 'project', $7, $8),
         ($9, NULL, 'SYSTEM', 'platform', 'system', NULL)`,
        [
          auditLogA, tenantA.id, projectA1.id, userA.id,
          auditLogB, tenantB.id, projectB1.id, userB.id,
          platformAuditLog,
        ]
      );
    });

    afterAll(async () => {
      await client.query(`DELETE FROM audit_log WHERE id IN ($1, $2, $3)`, [
        auditLogA,
        auditLogB,
        platformAuditLog,
      ]);
    });

    beforeEach(async () => {
      await clearTenantContext();
    });

    it('should only return audit logs for current tenant', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT * FROM audit_log WHERE id IN ($1, $2)', [
        auditLogA,
        auditLogB,
      ]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(auditLogA);
    });

    it('should allow access to platform-level audit logs (null tenant_id)', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT * FROM audit_log WHERE id = $1', [platformAuditLog]);

      expect(result.rows).toHaveLength(1);
    });
  });

  describe('RLS Helper Functions', () => {
    beforeEach(async () => {
      await clearTenantContext();
    });

    it('rls_current_tenant_id should return correct tenant ID', async () => {
      await setTenantContext(tenantA.id);

      const result = await client.query('SELECT rls_current_tenant_id() as tenant_id');

      expect(result.rows[0].tenant_id).toBe(tenantA.id);
    });

    it('rls_current_tenant_id should return NULL when not set', async () => {
      await clearTenantContext();

      const result = await client.query('SELECT rls_current_tenant_id() as tenant_id');

      expect(result.rows[0].tenant_id).toBeNull();
    });

    it('rls_is_platform_admin should return correct admin status', async () => {
      await setTenantContext(null, true);

      const result = await client.query('SELECT rls_is_platform_admin() as is_admin');

      expect(result.rows[0].is_admin).toBe(true);
    });

    it('rls_is_platform_admin should default to false', async () => {
      await setTenantContext(tenantA.id, false);

      const result = await client.query('SELECT rls_is_platform_admin() as is_admin');

      expect(result.rows[0].is_admin).toBe(false);
    });

    it('rls_check_tenant_access should validate tenant access', async () => {
      await setTenantContext(tenantA.id);

      const resultOwn = await client.query('SELECT rls_check_tenant_access($1) as has_access', [
        tenantA.id,
      ]);
      const resultOther = await client.query('SELECT rls_check_tenant_access($1) as has_access', [
        tenantB.id,
      ]);
      const resultNull = await client.query('SELECT rls_check_tenant_access(NULL) as has_access');

      expect(resultOwn.rows[0].has_access).toBe(true);
      expect(resultOther.rows[0].has_access).toBe(false);
      expect(resultNull.rows[0].has_access).toBe(true); // NULL tenant_id = platform-level
    });

    it('rls_check_project_tenant_access should validate project access', async () => {
      await setTenantContext(tenantA.id);

      const resultOwn = await client.query(
        'SELECT rls_check_project_tenant_access($1) as has_access',
        [projectA1.id]
      );
      const resultOther = await client.query(
        'SELECT rls_check_project_tenant_access($1) as has_access',
        [projectB1.id]
      );

      expect(resultOwn.rows[0].has_access).toBe(true);
      expect(resultOther.rows[0].has_access).toBe(false);
    });
  });

  describe('Transaction Isolation', () => {
    beforeEach(async () => {
      await clearTenantContext();
    });

    it('should maintain tenant context within transaction', async () => {
      await setTenantContext(tenantA.id);

      await client.query('BEGIN');

      // Verify context is maintained
      const midResult = await client.query('SELECT * FROM projects');
      expect(midResult.rows.every((p: any) => p.tenant_id === tenantA.id)).toBe(true);

      await client.query('ROLLBACK');
    });

    it('should not leak data across transactions with different tenants', async () => {
      // First transaction as Tenant A
      await setTenantContext(tenantA.id);
      await client.query('BEGIN');
      const resultA = await client.query('SELECT COUNT(*) as count FROM projects');
      await client.query('COMMIT');

      // Second transaction as Tenant B
      await setTenantContext(tenantB.id);
      await client.query('BEGIN');
      const resultB = await client.query('SELECT COUNT(*) as count FROM projects');
      await client.query('COMMIT');

      // Counts should be different
      expect(Number(resultA.rows[0].count)).toBe(2); // A has 2 projects
      expect(Number(resultB.rows[0].count)).toBe(1); // B has 1 project
    });
  });
});

// ============================================================================
// Performance Tests (Optional - run separately)
// ============================================================================

describe.skip('RLS Performance Tests', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) return;

    pool = new Pool({ connectionString: dbUrl });
    client = await pool.connect();
  });

  afterAll(async () => {
    if (client) client.release();
    if (pool) await pool.end();
  });

  it('should execute RLS-filtered queries within acceptable time', async () => {
    const tenantId = uuidv4(); // Use a test tenant
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);

    const start = Date.now();

    // Execute multiple queries to test performance
    for (let i = 0; i < 100; i++) {
      await client.query('SELECT * FROM projects LIMIT 10');
    }

    const duration = Date.now() - start;

    // Should complete 100 queries in under 1 second
    expect(duration).toBeLessThan(1000);
  });
});
