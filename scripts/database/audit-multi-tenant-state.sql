-- =============================================================================
-- MULTI-TENANT ARCHITECTURE STATE AUDIT
-- =============================================================================
-- Purpose: Comprehensive audit of current multi-tenant implementation state
-- Usage: psql $DATABASE_URL -f audit-multi-tenant-state.sql
-- Output: Detailed report of schema compliance and data integrity
-- =============================================================================

\set QUIET on
\pset border 2
\pset format wrapped

\echo ''
\echo '==============================================================================='
\echo 'MULTI-TENANT ARCHITECTURE AUDIT REPORT'
\echo '==============================================================================='
\echo 'Database: ' :DBNAME
\echo 'Timestamp: ' `date`
\echo '==============================================================================='
\echo ''

-- =============================================================================
-- Section 1: Schema Structure Validation
-- =============================================================================

\echo '--- SECTION 1: SCHEMA STRUCTURE VALIDATION ---'
\echo ''

\echo '1.1 Tenants Table Existence:'
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants')
    THEN '✓ PASS: tenants table exists'
    ELSE '✗ FAIL: tenants table does not exist'
  END as status;

\echo ''
\echo '1.2 Tenant-Scoped Tables with tenant_id Column:'
SELECT
  table_name,
  CASE
    WHEN column_name = 'tenant_id' THEN '✓ Has tenant_id'
    ELSE '✗ Missing tenant_id'
  END as status,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'projects', 'audit_log')
  AND column_name = 'tenant_id'
ORDER BY table_name;

\echo ''
\echo '1.3 NOT NULL Constraint Validation:'
SELECT
  table_name,
  column_name,
  is_nullable,
  CASE
    WHEN table_name = 'projects' AND is_nullable = 'NO' THEN '✓ PASS: projects.tenant_id is NOT NULL'
    WHEN table_name = 'projects' AND is_nullable = 'YES' THEN '✗ FAIL: projects.tenant_id is NULLABLE (should be NOT NULL)'
    WHEN table_name = 'users' AND is_nullable = 'YES' THEN '✓ PASS: users.tenant_id is NULLABLE (correct for platform admins)'
    WHEN table_name = 'audit_log' AND is_nullable = 'YES' THEN '✓ PASS: audit_log.tenant_id is NULLABLE (correct for platform events)'
    ELSE 'INFO: ' || table_name || '.' || column_name || ' is ' || is_nullable
  END as validation_status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
ORDER BY table_name;

\echo ''
\echo '1.4 Foreign Key Constraints:'
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.update_rule,
  rc.delete_rule,
  CASE
    WHEN tc.constraint_type = 'FOREIGN KEY' THEN '✓ FK exists'
    ELSE '✗ FK missing'
  END as status
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'tenant_id'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

\echo ''
\echo '1.5 Platform Admin Column Existence:'
SELECT
  table_name,
  column_name,
  data_type,
  column_default,
  CASE
    WHEN column_name = 'is_platform_admin' THEN '✓ Platform admin column exists'
    ELSE '✗ Missing'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'is_platform_admin';

-- =============================================================================
-- Section 2: Data Integrity Audit
-- =============================================================================

\echo ''
\echo '--- SECTION 2: DATA INTEGRITY AUDIT ---'
\echo ''

\echo '2.1 Tenant Count:'
SELECT
  COUNT(*) as total_tenants,
  CASE
    WHEN COUNT(*) = 0 THEN '✗ CRITICAL: No tenants exist'
    WHEN COUNT(*) = 1 THEN '⚠ WARNING: Only 1 tenant (expected for single-tenant setup)'
    ELSE '✓ OK: Multiple tenants exist'
  END as status
FROM tenants;

\echo ''
\echo '2.2 Tenant Details:'
SELECT
  id,
  slug,
  name,
  status,
  subscription_tier,
  created_at
FROM tenants
ORDER BY created_at;

\echo ''
\echo '2.3 Orphaned Projects (projects without tenant_id):'
SELECT
  COUNT(*) as orphan_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS: No orphaned projects'
    ELSE '✗ FAIL: ' || COUNT(*) || ' projects without tenant_id'
  END as status
FROM projects
WHERE tenant_id IS NULL;

\echo ''
\echo '2.4 Orphaned Projects Details (if any):'
SELECT
  id,
  name,
  status,
  owner_id,
  created_at
FROM projects
WHERE tenant_id IS NULL
LIMIT 10;

\echo ''
\echo '2.5 Orphaned Users (non-admin users without tenant_id):'
SELECT
  COUNT(*) as orphan_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✓ PASS: No orphaned users'
    ELSE '✗ FAIL: ' || COUNT(*) || ' non-admin users without tenant_id'
  END as status
FROM users
WHERE tenant_id IS NULL
  AND (is_platform_admin IS NULL OR is_platform_admin = false);

\echo ''
\echo '2.6 Orphaned Users Details (if any):'
SELECT
  id,
  email,
  full_name,
  role,
  is_platform_admin,
  created_at
FROM users
WHERE tenant_id IS NULL
  AND (is_platform_admin IS NULL OR is_platform_admin = false)
LIMIT 10;

\echo ''
\echo '2.7 Platform Administrators:'
SELECT
  COUNT(*) as platform_admin_count,
  CASE
    WHEN COUNT(*) = 0 THEN '⚠ WARNING: No platform administrators'
    WHEN COUNT(*) >= 1 THEN '✓ OK: ' || COUNT(*) || ' platform admin(s)'
  END as status
FROM users
WHERE is_platform_admin = true;

\echo ''
\echo '2.8 Platform Admin Details:'
SELECT
  id,
  email,
  full_name,
  role,
  tenant_id,
  created_at
FROM users
WHERE is_platform_admin = true
ORDER BY created_at;

-- =============================================================================
-- Section 3: Tenant Distribution Analysis
-- =============================================================================

\echo ''
\echo '--- SECTION 3: TENANT DISTRIBUTION ANALYSIS ---'
\echo ''

\echo '3.1 Users Per Tenant:'
SELECT
  COALESCE(t.slug, 'NO_TENANT') as tenant,
  COALESCE(t.name, 'Orphaned Users') as tenant_name,
  COUNT(u.id) as user_count,
  SUM(CASE WHEN u.is_platform_admin = true THEN 1 ELSE 0 END) as platform_admins,
  SUM(CASE WHEN u.is_platform_admin = false OR u.is_platform_admin IS NULL THEN 1 ELSE 0 END) as regular_users
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
GROUP BY t.slug, t.name
ORDER BY user_count DESC;

\echo ''
\echo '3.2 Projects Per Tenant:'
SELECT
  COALESCE(t.slug, 'NO_TENANT') as tenant,
  COALESCE(t.name, 'Orphaned Projects') as tenant_name,
  COUNT(p.id) as project_count,
  SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_projects,
  SUM(CASE WHEN p.status = 'planning' THEN 1 ELSE 0 END) as planning_projects,
  SUM(CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END) as completed_projects
FROM projects p
LEFT JOIN tenants t ON p.tenant_id = t.id
GROUP BY t.slug, t.name
ORDER BY project_count DESC;

-- =============================================================================
-- Section 4: Migration Status
-- =============================================================================

\echo ''
\echo '--- SECTION 4: MIGRATION STATUS ---'
\echo ''

\echo '4.1 Prisma Migrations Applied:'
SELECT
  migration_name,
  started_at,
  finished_at,
  CASE
    WHEN migration_name LIKE '%mt_m%' THEN '✓ Multi-Tenant Migration'
    ELSE 'Standard Migration'
  END as migration_type
FROM _prisma_migrations
WHERE migration_name LIKE '%mt%' OR migration_name LIKE '%tenant%'
ORDER BY started_at DESC;

\echo ''
\echo '4.2 Expected Multi-Tenant Migrations:'
WITH expected_migrations AS (
  SELECT unnest(ARRAY[
    '20260123020000_mt_m1_multi_tenant_foundation',
    'mt_m2_backfill_default_tenant',
    '20260123030000_mt_m3_enable_rls',
    'mt_m4_enforce_not_null'
  ]) as expected_name
)
SELECT
  em.expected_name,
  CASE
    WHEN pm.migration_name IS NOT NULL THEN '✓ Applied'
    ELSE '✗ MISSING'
  END as status,
  pm.finished_at
FROM expected_migrations em
LEFT JOIN _prisma_migrations pm ON pm.migration_name LIKE '%' || em.expected_name || '%'
ORDER BY em.expected_name;

-- =============================================================================
-- Section 5: Row-Level Security (RLS) Status
-- =============================================================================

\echo ''
\echo '--- SECTION 5: ROW-LEVEL SECURITY STATUS ---'
\echo ''

\echo '5.1 RLS Enabled on Tenant-Scoped Tables:'
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE
    WHEN rowsecurity = true THEN '✓ RLS Enabled'
    ELSE '⚠ RLS NOT Enabled'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'projects', 'audit_log', 'construction_elements', 'voxels', 'decisions')
ORDER BY tablename;

\echo ''
\echo '5.2 RLS Policies:'
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'projects', 'audit_log')
ORDER BY tablename, policyname;

-- =============================================================================
-- Section 6: Indexes for Multi-Tenant Performance
-- =============================================================================

\echo ''
\echo '--- SECTION 6: MULTI-TENANT INDEXES ---'
\echo ''

\echo '6.1 Tenant ID Indexes:'
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef,
  CASE
    WHEN indexdef LIKE '%tenant_id%' THEN '✓ Tenant index exists'
    ELSE 'No tenant index'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexdef LIKE '%tenant_id%'
ORDER BY tablename, indexname;

-- =============================================================================
-- Section 7: Summary and Recommendations
-- =============================================================================

\echo ''
\echo '--- SECTION 7: AUDIT SUMMARY ---'
\echo ''

WITH audit_summary AS (
  SELECT
    'Tenants Table' as check_name,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants')
      THEN 'PASS' ELSE 'FAIL' END as status
  UNION ALL
  SELECT
    'Projects tenant_id NOT NULL',
    CASE WHEN (SELECT is_nullable FROM information_schema.columns
               WHERE table_name = 'projects' AND column_name = 'tenant_id') = 'NO'
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'No Orphaned Projects',
    CASE WHEN (SELECT COUNT(*) FROM projects WHERE tenant_id IS NULL) = 0
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'No Orphaned Users',
    CASE WHEN (SELECT COUNT(*) FROM users
               WHERE tenant_id IS NULL AND (is_platform_admin = false OR is_platform_admin IS NULL)) = 0
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'At Least One Tenant Exists',
    CASE WHEN (SELECT COUNT(*) FROM tenants) > 0
      THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT
    'Platform Admin Exists',
    CASE WHEN (SELECT COUNT(*) FROM users WHERE is_platform_admin = true) > 0
      THEN 'PASS' ELSE 'WARNING' END
)
SELECT
  check_name,
  status,
  CASE
    WHEN status = 'PASS' THEN '✓'
    WHEN status = 'WARNING' THEN '⚠'
    ELSE '✗'
  END as indicator
FROM audit_summary;

\echo ''
\echo '==============================================================================='
\echo 'END OF AUDIT REPORT'
\echo '==============================================================================='
\echo ''

\set QUIET off
