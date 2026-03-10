#!/usr/bin/env ts-node
/**
 * Multi-Tenant Data Migration Script (MT-M5)
 *
 * Migrates existing data to multi-tenant structure by:
 * 1. Creating a default tenant for legacy data
 * 2. Assigning all existing projects to the default tenant
 * 3. Assigning all existing users to the default tenant
 * 4. Verifying zero data loss
 *
 * @module scripts/database/migrate-to-multi-tenant
 * @version 1.0.0
 *
 * Usage:
 *   npx ts-node scripts/database/migrate-to-multi-tenant.ts --dry-run
 *   npx ts-node scripts/database/migrate-to-multi-tenant.ts --execute
 *   npx ts-node scripts/database/migrate-to-multi-tenant.ts --rollback
 *
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   DEFAULT_TENANT_SLUG - Slug for default tenant (default: 'default-tenant')
 *   DEFAULT_TENANT_NAME - Name for default tenant (default: 'Default Organization')
 *   DEFAULT_TENANT_EMAIL - Admin email for default tenant
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

// ==============================================================================
// Configuration
// ==============================================================================

interface MigrationConfig {
  mode: 'dry-run' | 'execute' | 'rollback' | 'status';
  defaultTenantSlug: string;
  defaultTenantName: string;
  defaultTenantEmail: string;
  databaseUrl: string;
  verbose: boolean;
}

interface MigrationStats {
  projectsTotal: number;
  projectsMigrated: number;
  usersTotal: number;
  usersMigrated: number;
  auditLogsTotal: number;
  auditLogsMigrated: number;
  tenantId: string | null;
  startTime: Date;
  endTime?: Date;
  success: boolean;
  errors: string[];
}

// ==============================================================================
// Utility Functions
// ==============================================================================

function parseArgs(): MigrationConfig {
  const args = process.argv.slice(2);

  let mode: MigrationConfig['mode'] = 'status';
  let verbose = false;

  for (const arg of args) {
    if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--execute') mode = 'execute';
    else if (arg === '--rollback') mode = 'rollback';
    else if (arg === '--status') mode = 'status';
    else if (arg === '--verbose' || arg === '-v') verbose = true;
  }

  return {
    mode,
    defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG || 'default-tenant',
    defaultTenantName: process.env.DEFAULT_TENANT_NAME || 'Default Organization',
    defaultTenantEmail: process.env.DEFAULT_TENANT_EMAIL || 'admin@example.com',
    databaseUrl: process.env.DATABASE_URL || '',
    verbose,
  };
}

function log(message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '\x1b[36m[INFO]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
    success: '\x1b[32m[SUCCESS]\x1b[0m',
  }[level];

  console.log(`${timestamp} ${prefix} ${message}`);
}

// ==============================================================================
// Migration Core Functions
// ==============================================================================

/**
 * Check if default tenant already exists
 */
async function checkDefaultTenant(client: PoolClient, slug: string): Promise<string | null> {
  const result = await client.query(
    'SELECT id FROM tenants WHERE slug = $1',
    [slug]
  );
  return result.rows[0]?.id || null;
}

/**
 * Create default tenant for legacy data
 */
async function createDefaultTenant(
  client: PoolClient,
  config: MigrationConfig
): Promise<string> {
  const tenantId = randomUUID();

  await client.query(`
    INSERT INTO tenants (
      id, slug, name, status, subscription_tier,
      primary_email, billing_email,
      max_projects, max_users, max_storage_gb,
      data_region, compliance_flags, retention_days,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, 'ACTIVE', 'ENTERPRISE',
      $4, $4,
      9999, 9999, 9999,
      'us-west-2', ARRAY['PIPEDA']::text[], 2555,
      NOW(), NOW()
    )
    ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [
    tenantId,
    config.defaultTenantSlug,
    config.defaultTenantName,
    config.defaultTenantEmail,
  ]);

  log(`Created/updated default tenant: ${config.defaultTenantSlug} (${tenantId})`, 'success');
  return tenantId;
}

/**
 * Get migration statistics before migration
 */
async function getMigrationStats(client: PoolClient): Promise<MigrationStats> {
  const [projects, users, auditLogs, projectsMigrated, usersMigrated, auditLogsMigrated] = await Promise.all([
    client.query('SELECT COUNT(*) as count FROM projects'),
    client.query('SELECT COUNT(*) as count FROM users'),
    client.query('SELECT COUNT(*) as count FROM audit_log'),
    client.query('SELECT COUNT(*) as count FROM projects WHERE tenant_id IS NOT NULL'),
    client.query('SELECT COUNT(*) as count FROM users WHERE tenant_id IS NOT NULL'),
    client.query('SELECT COUNT(*) as count FROM audit_log WHERE tenant_id IS NOT NULL'),
  ]);

  return {
    projectsTotal: parseInt(projects.rows[0].count),
    projectsMigrated: parseInt(projectsMigrated.rows[0].count),
    usersTotal: parseInt(users.rows[0].count),
    usersMigrated: parseInt(usersMigrated.rows[0].count),
    auditLogsTotal: parseInt(auditLogs.rows[0].count),
    auditLogsMigrated: parseInt(auditLogsMigrated.rows[0].count),
    tenantId: null,
    startTime: new Date(),
    success: false,
    errors: [],
  };
}

/**
 * Migrate projects to default tenant
 */
async function migrateProjects(
  client: PoolClient,
  tenantId: string,
  dryRun: boolean
): Promise<number> {
  const countResult = await client.query(
    'SELECT COUNT(*) as count FROM projects WHERE tenant_id IS NULL'
  );
  const count = parseInt(countResult.rows[0].count);

  if (count === 0) {
    log('No projects to migrate (all already have tenant_id)', 'info');
    return 0;
  }

  if (dryRun) {
    log(`[DRY-RUN] Would migrate ${count} projects to tenant ${tenantId}`, 'info');
    return count;
  }

  const result = await client.query(`
    UPDATE projects
    SET tenant_id = $1, updated_at = NOW()
    WHERE tenant_id IS NULL
  `, [tenantId]);

  log(`Migrated ${result.rowCount} projects to tenant ${tenantId}`, 'success');
  return result.rowCount || 0;
}

/**
 * Migrate users to default tenant
 */
async function migrateUsers(
  client: PoolClient,
  tenantId: string,
  dryRun: boolean
): Promise<number> {
  // Don't migrate platform admins (they have is_platform_admin = true)
  const countResult = await client.query(
    'SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL AND (is_platform_admin IS NULL OR is_platform_admin = false)'
  );
  const count = parseInt(countResult.rows[0].count);

  if (count === 0) {
    log('No users to migrate (all already have tenant_id or are platform admins)', 'info');
    return 0;
  }

  if (dryRun) {
    log(`[DRY-RUN] Would migrate ${count} users to tenant ${tenantId}`, 'info');
    return count;
  }

  const result = await client.query(`
    UPDATE users
    SET tenant_id = $1, updated_at = NOW()
    WHERE tenant_id IS NULL
      AND (is_platform_admin IS NULL OR is_platform_admin = false)
  `, [tenantId]);

  log(`Migrated ${result.rowCount} users to tenant ${tenantId}`, 'success');
  return result.rowCount || 0;
}

/**
 * Migrate audit logs to default tenant
 */
async function migrateAuditLogs(
  client: PoolClient,
  tenantId: string,
  dryRun: boolean
): Promise<number> {
  // Associate audit logs with tenant based on user_id or target_id
  const countResult = await client.query(`
    SELECT COUNT(*) as count
    FROM audit_log a
    WHERE a.tenant_id IS NULL
      AND (
        EXISTS (SELECT 1 FROM users u WHERE u.id::text = a.user_id AND u.tenant_id = $1)
        OR EXISTS (SELECT 1 FROM projects p WHERE p.id::text = a.target_id AND p.tenant_id = $1)
      )
  `, [tenantId]);
  const count = parseInt(countResult.rows[0].count);

  if (count === 0) {
    log('No audit logs to migrate', 'info');
    return 0;
  }

  if (dryRun) {
    log(`[DRY-RUN] Would migrate ${count} audit logs to tenant ${tenantId}`, 'info');
    return count;
  }

  const result = await client.query(`
    UPDATE audit_log a
    SET tenant_id = $1
    WHERE a.tenant_id IS NULL
      AND (
        EXISTS (SELECT 1 FROM users u WHERE u.id::text = a.user_id AND u.tenant_id = $1)
        OR EXISTS (SELECT 1 FROM projects p WHERE p.id::text = a.target_id AND p.tenant_id = $1)
      )
  `, [tenantId]);

  log(`Migrated ${result.rowCount} audit logs to tenant ${tenantId}`, 'success');
  return result.rowCount || 0;
}

/**
 * Verify migration integrity
 */
async function verifyMigration(
  client: PoolClient,
  tenantId: string,
  beforeStats: MigrationStats
): Promise<{ success: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check all projects have tenant_id (except if they had one before)
  const orphanProjects = await client.query(
    'SELECT COUNT(*) as count FROM projects WHERE tenant_id IS NULL'
  );
  if (parseInt(orphanProjects.rows[0].count) > 0) {
    issues.push(`${orphanProjects.rows[0].count} projects still have no tenant_id`);
  }

  // Check non-admin users have tenant_id
  const orphanUsers = await client.query(
    'SELECT COUNT(*) as count FROM users WHERE tenant_id IS NULL AND (is_platform_admin IS NULL OR is_platform_admin = false)'
  );
  if (parseInt(orphanUsers.rows[0].count) > 0) {
    issues.push(`${orphanUsers.rows[0].count} non-admin users still have no tenant_id`);
  }

  // Verify record counts match
  const afterStats = await getMigrationStats(client);

  if (afterStats.projectsTotal !== beforeStats.projectsTotal) {
    issues.push(`Project count changed: ${beforeStats.projectsTotal} -> ${afterStats.projectsTotal}`);
  }

  if (afterStats.usersTotal !== beforeStats.usersTotal) {
    issues.push(`User count changed: ${beforeStats.usersTotal} -> ${afterStats.usersTotal}`);
  }

  // Log verification results
  if (issues.length === 0) {
    log('Migration verification passed', 'success');
    log(`  - Projects: ${afterStats.projectsMigrated}/${afterStats.projectsTotal} have tenant_id`, 'info');
    log(`  - Users: ${afterStats.usersMigrated}/${afterStats.usersTotal} have tenant_id`, 'info');
    log(`  - Audit logs: ${afterStats.auditLogsMigrated}/${afterStats.auditLogsTotal} have tenant_id`, 'info');
  } else {
    log('Migration verification FAILED', 'error');
    issues.forEach(issue => log(`  - ${issue}`, 'error'));
  }

  return { success: issues.length === 0, issues };
}

/**
 * Rollback migration
 */
async function rollbackMigration(
  client: PoolClient,
  tenantSlug: string
): Promise<void> {
  log('Starting rollback...', 'warn');

  // Get tenant ID
  const tenantResult = await client.query(
    'SELECT id FROM tenants WHERE slug = $1',
    [tenantSlug]
  );

  if (tenantResult.rows.length === 0) {
    log(`No tenant found with slug: ${tenantSlug}`, 'error');
    return;
  }

  const tenantId = tenantResult.rows[0].id;

  // Clear tenant_id from audit logs
  await client.query(
    'UPDATE audit_log SET tenant_id = NULL WHERE tenant_id = $1',
    [tenantId]
  );
  log('Cleared tenant_id from audit logs', 'info');

  // Clear tenant_id from users (but keep platform admins as-is)
  await client.query(
    'UPDATE users SET tenant_id = NULL WHERE tenant_id = $1',
    [tenantId]
  );
  log('Cleared tenant_id from users', 'info');

  // Note: We can't easily clear tenant_id from projects because it's required
  // The rollback would need to drop the NOT NULL constraint first
  log('WARNING: Projects retain tenant_id (column is NOT NULL). Manual intervention may be needed.', 'warn');

  log('Rollback completed', 'success');
}

// ==============================================================================
// Main Execution
// ==============================================================================

async function main(): Promise<void> {
  const config = parseArgs();

  log('='.repeat(60), 'info');
  log('Multi-Tenant Data Migration Script (MT-M5)', 'info');
  log('='.repeat(60), 'info');
  log(`Mode: ${config.mode}`, 'info');
  log(`Default Tenant: ${config.defaultTenantSlug}`, 'info');

  if (!config.databaseUrl) {
    log('DATABASE_URL environment variable is required', 'error');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = await pool.connect();

  try {
    // Check current status
    const existingTenantId = await checkDefaultTenant(client, config.defaultTenantSlug);
    const beforeStats = await getMigrationStats(client);

    log('\nCurrent Status:', 'info');
    log(`  - Default tenant exists: ${existingTenantId ? 'Yes' : 'No'}`, 'info');
    log(`  - Projects: ${beforeStats.projectsMigrated}/${beforeStats.projectsTotal} have tenant_id`, 'info');
    log(`  - Users: ${beforeStats.usersMigrated}/${beforeStats.usersTotal} have tenant_id`, 'info');
    log(`  - Audit logs: ${beforeStats.auditLogsMigrated}/${beforeStats.auditLogsTotal} have tenant_id`, 'info');

    if (config.mode === 'status') {
      log('\nUse --dry-run to see what would be migrated', 'info');
      log('Use --execute to run the migration', 'info');
      log('Use --rollback to undo the migration', 'info');
      return;
    }

    if (config.mode === 'rollback') {
      await rollbackMigration(client, config.defaultTenantSlug);
      return;
    }

    const isDryRun = config.mode === 'dry-run';

    if (isDryRun) {
      log('\n[DRY-RUN MODE] No changes will be made', 'warn');
    } else {
      log('\n[EXECUTE MODE] Changes will be committed', 'warn');
    }

    // Start transaction for execute mode
    if (!isDryRun) {
      await client.query('BEGIN');
    }

    try {
      // Step 1: Create or get default tenant
      let tenantId: string;
      if (existingTenantId) {
        tenantId = existingTenantId;
        log(`Using existing tenant: ${tenantId}`, 'info');
      } else {
        if (isDryRun) {
          tenantId = '[new-tenant-id]';
          log(`[DRY-RUN] Would create tenant: ${config.defaultTenantSlug}`, 'info');
        } else {
          tenantId = await createDefaultTenant(client, config);
        }
      }

      // Step 2: Migrate projects
      log('\nMigrating projects...', 'info');
      await migrateProjects(client, tenantId, isDryRun);

      // Step 3: Migrate users
      log('\nMigrating users...', 'info');
      await migrateUsers(client, tenantId, isDryRun);

      // Step 4: Migrate audit logs
      log('\nMigrating audit logs...', 'info');
      await migrateAuditLogs(client, tenantId, isDryRun);

      // Step 5: Verify migration
      if (!isDryRun) {
        log('\nVerifying migration...', 'info');
        const verification = await verifyMigration(client, tenantId, beforeStats);

        if (verification.success) {
          await client.query('COMMIT');
          log('\nMigration completed successfully!', 'success');
        } else {
          await client.query('ROLLBACK');
          log('\nMigration rolled back due to verification failures', 'error');
          process.exit(1);
        }
      } else {
        log('\n[DRY-RUN] Migration preview complete. Run with --execute to apply changes.', 'info');
      }

    } catch (error) {
      if (!isDryRun) {
        await client.query('ROLLBACK');
      }
      throw error;
    }

  } catch (error) {
    log(`Migration failed: ${(error as Error).message}`, 'error');
    if (config.verbose) {
      console.error(error);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
main().catch(console.error);

export {
  parseArgs,
  MigrationConfig,
  MigrationStats,
  createDefaultTenant,
  migrateProjects,
  migrateUsers,
  migrateAuditLogs,
  verifyMigration,
  rollbackMigration,
};
