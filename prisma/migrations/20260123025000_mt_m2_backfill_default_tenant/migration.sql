-- MT-M2 Backfill Default Tenant Migration
-- Generated: 2026-01-25
-- Feature: Backfill existing data with default tenant
-- Prerequisite: MT-M1 must be applied (tenant_id columns exist but are nullable)
-- Next Step: MT-M3 (RLS) then MT-M4 (NOT NULL constraints)

-- ==============================================================================
-- IMPORTANT: This migration creates a default tenant and assigns all existing
-- data to it. This is for migrating from single-tenant to multi-tenant.
--
-- For fresh installations, skip this migration and use proper tenant seeding.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- Step 1: Create Default Tenant (if not exists)
-- ==============================================================================

DO $$
DECLARE
  default_tenant_id UUID;
  tenant_exists BOOLEAN;
BEGIN
  -- Check if default tenant already exists
  SELECT EXISTS (
    SELECT 1 FROM tenants WHERE slug = 'default-tenant'
  ) INTO tenant_exists;

  IF NOT tenant_exists THEN
    -- Create default tenant
    INSERT INTO tenants (
      slug,
      name,
      status,
      subscription_tier,
      primary_email,
      max_projects,
      max_users,
      max_storage_gb,
      data_region
    ) VALUES (
      'default-tenant',
      'Default Organization',
      'ACTIVE',
      'ENTERPRISE',
      'admin@example.com',
      9999,  -- Unlimited for migration
      9999,
      9999,
      'us-west-2'
    )
    RETURNING id INTO default_tenant_id;

    RAISE NOTICE 'Created default tenant with ID: %', default_tenant_id;
  ELSE
    SELECT id FROM tenants WHERE slug = 'default-tenant' INTO default_tenant_id;
    RAISE NOTICE 'Default tenant already exists with ID: %', default_tenant_id;
  END IF;

  -- ==============================================================================
  -- Step 2: Backfill Projects with Default Tenant
  -- ==============================================================================

  -- Update projects without tenant_id
  UPDATE projects
  SET tenant_id = default_tenant_id
  WHERE tenant_id IS NULL;

  RAISE NOTICE 'Backfilled % projects with default tenant',
    (SELECT COUNT(*) FROM projects WHERE tenant_id = default_tenant_id);

  -- ==============================================================================
  -- Step 3: Backfill Users with Default Tenant
  -- ==============================================================================

  -- Update non-admin users without tenant_id
  UPDATE users
  SET tenant_id = default_tenant_id
  WHERE tenant_id IS NULL
    AND (is_platform_admin IS NULL OR is_platform_admin = false);

  RAISE NOTICE 'Backfilled % users with default tenant',
    (SELECT COUNT(*) FROM users WHERE tenant_id = default_tenant_id);

  -- ==============================================================================
  -- Step 4: Backfill Audit Logs with Default Tenant (if applicable)
  -- ==============================================================================

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    UPDATE audit_log
    SET tenant_id = default_tenant_id
    WHERE tenant_id IS NULL;  -- Backfill all audit logs without tenant

    RAISE NOTICE 'Backfilled % audit logs with default tenant',
      (SELECT COUNT(*) FROM audit_log WHERE tenant_id = default_tenant_id);
  END IF;

END $$;

-- ==============================================================================
-- Verification: Ensure no orphaned data remains
-- ==============================================================================

DO $$
DECLARE
  orphan_projects INT;
  orphan_users INT;
BEGIN
  -- Check for orphaned projects
  SELECT COUNT(*) INTO orphan_projects
  FROM projects WHERE tenant_id IS NULL;

  IF orphan_projects > 0 THEN
    RAISE WARNING '% projects still have NULL tenant_id after backfill', orphan_projects;
  ELSE
    RAISE NOTICE '✓ All projects have tenant_id assigned';
  END IF;

  -- Check for orphaned non-admin users
  SELECT COUNT(*) INTO orphan_users
  FROM users
  WHERE tenant_id IS NULL
    AND (is_platform_admin IS NULL OR is_platform_admin = false);

  IF orphan_users > 0 THEN
    RAISE WARNING '% non-admin users still have NULL tenant_id after backfill', orphan_users;
  ELSE
    RAISE NOTICE '✓ All non-admin users have tenant_id assigned';
  END IF;
END $$;

COMMIT;

-- ==============================================================================
-- Post-Migration Notes
-- ==============================================================================

-- 1. The default tenant (slug: 'default-tenant') now owns all existing data
-- 2. Platform admins (is_platform_admin = true) have NULL tenant_id (correct)
-- 3. Next migration (MT-M4) will add NOT NULL constraints to projects.tenant_id
-- 4. After deployment, consider renaming 'default-tenant' to match your organization

-- To rename the default tenant:
-- UPDATE tenants SET slug = 'your-org', name = 'Your Organization'
-- WHERE slug = 'default-tenant';
