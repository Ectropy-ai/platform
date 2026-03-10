-- MT-M4 Enforce NOT NULL Constraints Migration
-- Generated: 2026-01-25
-- Feature: Add NOT NULL constraints to enforce multi-tenant isolation
-- Prerequisites:
--   - MT-M1: tenant_id columns exist (nullable)
--   - MT-M2: All data backfilled with tenant assignments
--   - MT-M3: Row-Level Security policies enabled
--
-- This migration enforces data integrity at the database level

-- ==============================================================================
-- CRITICAL: This migration will FAIL if any orphaned data exists
-- Run audit scripts first to ensure all data has been assigned to tenants
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- Pre-Flight Validation: Check for Orphaned Data
-- ==============================================================================

DO $$
DECLARE
  orphan_projects INT;
  orphan_users INT;
BEGIN
  -- Check projects
  SELECT COUNT(*) INTO orphan_projects
  FROM projects WHERE tenant_id IS NULL;

  IF orphan_projects > 0 THEN
    RAISE EXCEPTION 'Cannot add NOT NULL constraint: % projects have NULL tenant_id. Run MT-M2 backfill first.', orphan_projects;
  END IF;

  -- Check users (excluding platform admins)
  SELECT COUNT(*) INTO orphan_users
  FROM users
  WHERE tenant_id IS NULL
    AND (is_platform_admin IS NULL OR is_platform_admin = false);

  IF orphan_users > 0 THEN
    RAISE EXCEPTION 'Cannot add NOT NULL constraint: % non-admin users have NULL tenant_id. Run MT-M2 backfill first.', orphan_users;
  END IF;

  RAISE NOTICE '✓ Pre-flight validation passed: No orphaned data found';
END $$;

-- ==============================================================================
-- Step 1: Add NOT NULL Constraint to projects.tenant_id
-- ==============================================================================

-- Projects MUST always belong to a tenant (business requirement)
ALTER TABLE projects
ALTER COLUMN tenant_id SET NOT NULL;

-- Verify constraint was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'projects'
      AND column_name = 'tenant_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE '✓ projects.tenant_id is now NOT NULL';
  ELSE
    RAISE EXCEPTION 'Failed to add NOT NULL constraint to projects.tenant_id';
  END IF;
END $$;

-- ==============================================================================
-- Step 2: Validate User tenant_id Remains NULLABLE
-- ==============================================================================

-- Users.tenant_id MUST remain nullable for platform administrators
-- This is validated but not changed

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'tenant_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE '✓ users.tenant_id correctly remains NULLABLE (for platform admins)';
  ELSE
    RAISE WARNING 'users.tenant_id is NOT NULL - this may be incorrect';
  END IF;
END $$;

-- ==============================================================================
-- Step 3: Add Check Constraint for User Tenant Consistency
-- ==============================================================================

-- Enforce: Non-platform-admin users MUST have a tenant_id
-- Platform admins (is_platform_admin = true) MAY have NULL tenant_id

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_tenant_consistency_check;

ALTER TABLE users
ADD CONSTRAINT users_tenant_consistency_check
CHECK (
  (is_platform_admin = true AND tenant_id IS NULL) OR  -- Platform admin: must have NULL tenant
  (is_platform_admin = false AND tenant_id IS NOT NULL) OR  -- Regular user: must have tenant
  (is_platform_admin IS NULL AND tenant_id IS NOT NULL)  -- Legacy: assume regular user
);

DO $$
BEGIN
  RAISE NOTICE '✓ Added check constraint: users must have tenant_id unless platform admin';
END $$;

-- ==============================================================================
-- Step 4: Validate Audit Log Structure
-- ==============================================================================

-- Audit logs can have NULL tenant_id for platform-level events
-- No constraints added, but we validate the structure

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'audit_log'
      AND column_name = 'tenant_id'
      AND is_nullable = 'YES'
  ) THEN
    RAISE NOTICE '✓ audit_log.tenant_id correctly remains NULLABLE';
  END IF;
END $$;

-- ==============================================================================
-- Step 5: Add Indexes for NOT NULL Enforcement Performance
-- ==============================================================================

-- Index for efficient tenant-scoped project queries
CREATE INDEX IF NOT EXISTS idx_projects_tenant_not_null
ON projects(tenant_id)
WHERE tenant_id IS NOT NULL;

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_projects_tenant_status_active
ON projects(tenant_id, status)
WHERE status IN ('active', 'planning');

DO $$
BEGIN
  RAISE NOTICE '✓ Added performance indexes for tenant-scoped queries';
END $$;

-- ==============================================================================
-- Step 6: Validation Summary
-- ==============================================================================

DO $$
DECLARE
  total_projects INT;
  total_users INT;
  total_platform_admins INT;
  projects_with_tenant INT;
  users_with_tenant INT;
BEGIN
  -- Projects validation
  SELECT COUNT(*) INTO total_projects FROM projects;
  SELECT COUNT(*) INTO projects_with_tenant FROM projects WHERE tenant_id IS NOT NULL;

  IF total_projects = projects_with_tenant THEN
    RAISE NOTICE '✓ All % projects have tenant_id', total_projects;
  ELSE
    RAISE WARNING '% of % projects missing tenant_id', (total_projects - projects_with_tenant), total_projects;
  END IF;

  -- Users validation
  SELECT COUNT(*) INTO total_users FROM users;
  SELECT COUNT(*) INTO total_platform_admins FROM users WHERE is_platform_admin = true;
  SELECT COUNT(*) INTO users_with_tenant
  FROM users WHERE tenant_id IS NOT NULL OR is_platform_admin = true;

  RAISE NOTICE '✓ Total users: % (% platform admins, % tenant users)',
    total_users, total_platform_admins, (total_users - total_platform_admins);

  IF total_users = users_with_tenant THEN
    RAISE NOTICE '✓ All users correctly assigned';
  ELSE
    RAISE WARNING '% users have inconsistent tenant assignment', (total_users - users_with_tenant);
  END IF;
END $$;

COMMIT;

-- ==============================================================================
-- Post-Migration Notes
-- ==============================================================================

-- 1. projects.tenant_id is now NOT NULL - all projects MUST belong to a tenant
-- 2. users.tenant_id remains NULLABLE - platform admins have NULL tenant_id
-- 3. Check constraint enforces: regular users must have tenant_id
-- 4. Indexes added for efficient tenant-scoped queries
-- 5. Schema now matches Prisma schema.prisma expectations

-- ==============================================================================
-- Rollback Instructions (Emergency Only)
-- ==============================================================================

-- WARNING: Rollback will allow orphaned data again
-- Only use if absolutely necessary

-- To rollback:
-- BEGIN;
-- ALTER TABLE projects ALTER COLUMN tenant_id DROP NOT NULL;
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_consistency_check;
-- DROP INDEX IF EXISTS idx_projects_tenant_not_null;
-- DROP INDEX IF EXISTS idx_projects_tenant_status_active;
-- COMMIT;
