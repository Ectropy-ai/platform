-- =============================================================================
-- MULTI-TENANT DEMO SEED DATA FOR ECTROPY PLATFORM
-- =============================================================================
--
-- PURPOSE: Creates proper multi-tenant demo data for dev/staging/test environments
-- USAGE: Run this script in dev/staging/test databases only
-- SECURITY: Contains test credentials - NOT for production use
--
-- AUTHENTICATION (Phase 1 - February 2026):
-- - Production: OAuth-only (Google) - no password authentication
-- - @luh.tech domain: Automatic platform admin access (auto-created on first login)
-- - Other users: Must have is_authorized=true in database to log in
-- - Demo credentials below: LOCAL TESTING ONLY (password hashes non-functional in OAuth flow)
--
-- Creates:
-- - 1 Demo Tenant (ectropy-demo)
-- - 1 Platform Administrator (admin@ectropy.com, cross-tenant access)
-- - 2 Tenant Users (demo@ectropy.com, test@ectropy.com)
-- - 2 Demo Projects (both assigned to ectropy-demo tenant)
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- Enable Required Extensions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =============================================================================
-- Clean Up Existing Demo Data
-- =============================================================================

-- Delete in correct order (respecting foreign keys)
DELETE FROM project_roles WHERE project_id IN (
  SELECT id FROM projects WHERE name IN ('Demo Office Building', 'Sample Residential Complex')
);

DELETE FROM projects WHERE name IN ('Demo Office Building', 'Sample Residential Complex');

DELETE FROM users WHERE email IN ('demo@ectropy.com', 'admin@ectropy.com', 'test@ectropy.com');

DELETE FROM tenants WHERE slug = 'ectropy-demo';

-- =============================================================================
-- Create Demo Tenant
-- =============================================================================

INSERT INTO tenants (
  id,
  slug,
  name,
  status,
  subscription_tier,
  primary_email,
  billing_email,
  max_projects,
  max_users,
  max_storage_gb,
  data_region,
  compliance_flags,
  retention_days,
  features,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,  -- Fixed UUID for demo (easier testing)
  'ectropy-demo',
  'Ectropy Demo Organization',
  'ACTIVE',
  'ENTERPRISE',
  'admin@ectropy.ai',
  'billing@ectropy.ai',
  9999,  -- Unlimited for demo
  9999,
  9999,
  'us-west-2',
  ARRAY['PIPEDA', 'SOC2']::TEXT[],
  2555,  -- 7 years
  '{"bim_viewer": true, "ros_mro": true, "speckle_integration": true}'::JSONB,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- =============================================================================
-- Create Platform Administrator
-- =============================================================================

-- Platform admin has cross-tenant access (tenant_id = NULL)
INSERT INTO users (
  id,
  tenant_id,  -- NULL for platform admin
  email,
  full_name,
  password_hash,
  role,
  roles,
  is_platform_admin,
  is_active,
  is_authorized,  -- User Management M1: Database-driven authorization
  authorized_at,  -- User Management M1: Authorization timestamp
  picture,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  NULL,  -- Platform admin has no tenant
  'admin@ectropy.com',
  'Platform Administrator',
  '$2b$12$YQlXdJ8lKEfcmE8Hj/h6J.2sNd6vjB3L5c8vKxwZ9qDf2h4j6k8l2',  -- Password: admin123
  'admin',
  ARRAY['admin']::"StakeholderRole"[],
  true,  -- Is platform admin
  true,
  true,  -- Authorized for database-driven auth
  CURRENT_TIMESTAMP,  -- Authorization timestamp
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- =============================================================================
-- Create Tenant Users (Assigned to ectropy-demo)
-- =============================================================================

-- Demo User (Standard Role)
INSERT INTO users (
  id,
  tenant_id,
  email,
  full_name,
  password_hash,
  role,
  roles,
  is_platform_admin,
  is_active,
  is_authorized,  -- User Management M1: Database-driven authorization
  authorized_at,  -- User Management M1: Authorization timestamp
  picture,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::UUID,  -- ectropy-demo tenant
  'demo@ectropy.com',
  'Demo User',
  '$2b$12$YQlXdJ8lKEfcmE8Hj/h6J.2sNd6vjB3L5c8vKxwZ9qDf2h4j6k8l2',  -- Password: demo123
  'contractor',
  ARRAY['contractor']::"StakeholderRole"[],
  false,
  true,
  true,  -- Authorized for database-driven auth
  CURRENT_TIMESTAMP,  -- Authorization timestamp
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Test User (For E2E Testing)
INSERT INTO users (
  id,
  tenant_id,
  email,
  full_name,
  password_hash,
  role,
  roles,
  is_platform_admin,
  is_active,
  is_authorized,  -- User Management M1: Database-driven authorization
  authorized_at,  -- User Management M1: Authorization timestamp
  picture,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::UUID,  -- ectropy-demo tenant
  'test@ectropy.com',
  'Test User',
  '$2b$12$YQlXdJ8lKEfcmE8Hj/h6J.2sNd6vjB3L5c8vKxwZ9qDf2h4j6k8l2',  -- Password: test123
  'contractor',
  ARRAY['contractor', 'inspector']::"StakeholderRole"[],  -- Multiple roles for testing
  false,
  true,
  true,  -- Authorized for database-driven auth
  CURRENT_TIMESTAMP,  -- Authorization timestamp
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- =============================================================================
-- Create Demo Projects (Assigned to ectropy-demo tenant)
-- =============================================================================

-- Project 1: Demo Office Building
INSERT INTO projects (
  id,
  tenant_id,  -- REQUIRED: All projects must have tenant_id
  name,
  description,
  owner_id,
  status,
  total_budget,
  currency,
  start_date,
  expected_completion,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::UUID,  -- ectropy-demo tenant
  'Demo Office Building',
  'A sample office building project for demonstration purposes. This project showcases BIM integration, ROS MRO workflows, and multi-stakeholder collaboration.',
  (SELECT id FROM users WHERE email = 'demo@ectropy.com'),
  'active',
  2500000.00,
  'USD',
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE + INTERVAL '180 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Project 2: Sample Residential Complex
INSERT INTO projects (
  id,
  tenant_id,
  name,
  description,
  owner_id,
  status,
  total_budget,
  currency,
  start_date,
  expected_completion,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::UUID,  -- ectropy-demo tenant
  'Sample Residential Complex',
  'A sample residential project for testing and demonstration. Includes multi-unit construction with voxel-based progress tracking.',
  (SELECT id FROM users WHERE email = 'test@ectropy.com'),
  'planning',
  1800000.00,
  'USD',
  CURRENT_DATE + INTERVAL '15 days',
  CURRENT_DATE + INTERVAL '270 days',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- =============================================================================
-- Add Project Roles (Optional: For testing RBAC)
-- =============================================================================

-- Give demo user owner role on their project
INSERT INTO project_roles (
  id,
  project_id,
  user_id,
  role,
  is_active,
  assigned_at
)
SELECT
  gen_random_uuid(),
  p.id,
  u.id,
  'owner',
  true,
  CURRENT_TIMESTAMP
FROM projects p
CROSS JOIN users u
WHERE p.name = 'Demo Office Building'
  AND u.email = 'demo@ectropy.com';

-- Give test user owner role on their project
INSERT INTO project_roles (
  id,
  project_id,
  user_id,
  role,
  is_active,
  assigned_at
)
SELECT
  gen_random_uuid(),
  p.id,
  u.id,
  'owner',
  true,
  CURRENT_TIMESTAMP
FROM projects p
CROSS JOIN users u
WHERE p.name = 'Sample Residential Complex'
  AND u.email = 'test@ectropy.com';

-- Give admin read access to all projects (cross-tenant)
INSERT INTO project_roles (
  id,
  project_id,
  user_id,
  role,
  is_active,
  assigned_at
)
SELECT
  gen_random_uuid(),
  p.id,
  u.id,
  'admin',
  true,
  CURRENT_TIMESTAMP
FROM projects p
CROSS JOIN users u
WHERE u.email = 'admin@ectropy.com';

-- ROOT CAUSE #139 + #140 FIX: Grant ALL ectropy-demo tenant users access to demo projects
-- E2E tests authenticate via OAuth with various emails (TEST_GOOGLE_REFRESH_TOKEN)
-- Those users won't match demo@/test@/admin@ hardcoded emails above
-- This ensures ANY user in ectropy-demo tenant can access projects for E2E testing
-- ROOT CAUSE #140: Added is_active = true to ensure project_roles.is_active filter matches
INSERT INTO project_roles (
  id,
  project_id,
  user_id,
  role,
  is_active,
  assigned_at
)
SELECT
  gen_random_uuid(),
  p.id,
  u.id,
  'consultant',  -- ROOT CAUSE #231 FIX: Changed from 'member' (invalid enum) to 'consultant' (valid StakeholderRole)
  true,
  CURRENT_TIMESTAMP
FROM projects p
CROSS JOIN users u
WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'::UUID  -- ectropy-demo tenant
  AND u.tenant_id = '00000000-0000-0000-0000-000000000001'::UUID   -- ectropy-demo users
  AND NOT EXISTS (
    -- Don't duplicate if already has role from above
    SELECT 1 FROM project_roles pr
    WHERE pr.project_id = p.id AND pr.user_id = u.id
  );

COMMIT;

-- =============================================================================
-- Verification Queries
-- =============================================================================

\echo ''
\echo '==============================================================================='
\echo 'MULTI-TENANT DEMO DATA SEEDED SUCCESSFULLY'
\echo '==============================================================================='
\echo ''

\echo 'Tenants:'
SELECT
  id,
  slug,
  name,
  status,
  subscription_tier
FROM tenants
WHERE slug = 'ectropy-demo';

\echo ''
\echo 'Users by Tenant:'
SELECT
  COALESCE(t.slug, 'PLATFORM') as tenant,
  u.email,
  u.role,
  u.is_platform_admin as is_admin,
  u.is_active
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE u.email IN ('demo@ectropy.com', 'admin@ectropy.com', 'test@ectropy.com')
ORDER BY u.is_platform_admin DESC, u.email;

\echo ''
\echo 'Projects by Tenant:'
SELECT
  t.slug as tenant,
  p.name,
  p.status,
  p.total_budget,
  u.email as owner_email
FROM projects p
JOIN tenants t ON p.tenant_id = t.id
JOIN users u ON p.owner_id = u.id
WHERE p.name IN ('Demo Office Building', 'Sample Residential Complex')
ORDER BY p.name;

\echo ''
\echo '==============================================================================='
\echo 'AUTHENTICATION - PHASE 1 (February 2026)'
\echo '==============================================================================='
\echo ''
\echo 'PRODUCTION (OAuth-Only):'
\echo '  - Login via Google OAuth: https://staging.ectropy.ai/auth/google'
\echo '  - @luh.tech domain users: Automatic platform admin (auto-created on first login)'
\echo '  - Other users: Must have is_authorized=true in database to log in'
\echo '  - Password authentication: DISABLED in production/staging'
\echo ''
\echo 'LOCAL DEVELOPMENT (Password Testing):'
\echo '  1. Platform Administrator:'
\echo '     Email: admin@ectropy.com'
\echo '     Password: admin123 (LOCAL ONLY - not used in OAuth flow)'
\echo '     Tenant: NULL (platform-level access)'
\echo ''
\echo '  2. Demo User:'
\echo '     Email: demo@ectropy.com'
\echo '     Password: demo123 (LOCAL ONLY - not used in OAuth flow)'
\echo '     Tenant: ectropy-demo'
\echo '     Project: Demo Office Building'
\echo ''
\echo '  3. Test User:'
\echo '     Email: test@ectropy.com'
\echo '     Password: test123 (LOCAL ONLY - not used in OAuth flow)'
\echo '     Tenant: ectropy-demo'
\echo '     Project: Sample Residential Complex'
\echo ''
\echo '==============================================================================='
\echo 'MULTI-TENANT STRUCTURE SUMMARY'
\echo '==============================================================================='
\echo ''

SELECT
  'Tenants' as entity,
  COUNT(*) as count
FROM tenants WHERE slug = 'ectropy-demo'
UNION ALL
SELECT
  'Platform Admins',
  COUNT(*)
FROM users WHERE is_platform_admin = true
UNION ALL
SELECT
  'Tenant Users',
  COUNT(*)
FROM users WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
UNION ALL
SELECT
  'Projects',
  COUNT(*)
FROM projects WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::UUID;

\echo ''
\echo '⚠️  SECURITY WARNING:'
\echo '   - Password hashes above: LOCAL TESTING ONLY'
\echo '   - Production/Staging: OAuth-only authentication (Google)'
\echo '   - @luh.tech users: Automatic platform admin (auto-created via OAuth)'
\echo '   - Password authentication: DISABLED in secure environments'
\echo ''
\echo '==============================================================================='
