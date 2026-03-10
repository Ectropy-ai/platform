-- User Management M1: Database-Driven Authorization
-- Milestone: User Management M1 (Database Models & Migrations)
-- Feature: user-management
-- Date: 2026-01-28
--
-- PURPOSE:
-- Replaces AUTHORIZED_USERS environment variable with database-driven authorization.
-- Adds is_authorized boolean and authorized_at timestamp for audit trail.
--
-- BENEFITS:
-- - Eliminates manual SSH access for user provisioning
-- - Provides audit trail (who was authorized when)
-- - Enables self-service user management via admin UI
-- - Foundation for full User Management feature (M1-M6)
--
-- MIGRATION STRATEGY:
-- 1. Add new columns with safe defaults (is_authorized=false)
-- 2. Backfill existing users based on current authorization patterns
-- 3. Platform admins (is_platform_admin=true) are automatically authorized
-- 4. Demo/test users (admin@ectropy.com, demo@ectropy.com, test@ectropy.com) are automatically authorized
--
-- SAFETY:
-- - Non-breaking: Existing code continues to work (AUTHORIZED_USERS still checked)
-- - Backward compatible: New field defaults to false, no user blocked
-- - Rollback safe: Can drop columns without data loss

-- ============================================================================
-- STEP 1: Add new columns to users table
-- ============================================================================

-- Add is_authorized column (default false for safety)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_authorized BOOLEAN NOT NULL DEFAULT false;

-- Add authorized_at timestamp for audit trail
ALTER TABLE users
ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN users.is_authorized IS 'User Management M1: Database-driven authorization (replaces AUTHORIZED_USERS env var)';
COMMENT ON COLUMN users.authorized_at IS 'User Management M1: Timestamp when user was authorized (audit trail)';

-- ============================================================================
-- STEP 2: Backfill existing users with proper authorization
-- ============================================================================

-- Authorize all platform admins (cross-tenant access)
UPDATE users
SET
  is_authorized = true,
  authorized_at = COALESCE(created_at, NOW())
WHERE is_platform_admin = true
  AND is_authorized = false;

-- Authorize known demo/test users (used in seed scripts and E2E tests)
UPDATE users
SET
  is_authorized = true,
  authorized_at = COALESCE(created_at, NOW())
WHERE email IN (
  'admin@ectropy.com',
  'demo@ectropy.com',
  'test@ectropy.com',
  'erik.luhman@gmail.com'
)
AND is_authorized = false;

-- ============================================================================
-- STEP 3: Create index for authorization queries (performance optimization)
-- ============================================================================

-- Index for fast authorization lookups during OAuth
CREATE INDEX IF NOT EXISTS idx_users_is_authorized
ON users(is_authorized)
WHERE is_authorized = true;

-- Composite index for email + authorization (covers OAuth lookup pattern)
CREATE INDEX IF NOT EXISTS idx_users_email_authorized
ON users(email, is_authorized);

-- ============================================================================
-- STEP 4: Verification queries (commented out, run manually if needed)
-- ============================================================================

-- Verify migration success:
-- SELECT
--   COUNT(*) FILTER (WHERE is_authorized = true) as authorized_count,
--   COUNT(*) FILTER (WHERE is_authorized = false) as unauthorized_count,
--   COUNT(*) FILTER (WHERE is_platform_admin = true) as platform_admin_count
-- FROM users;

-- Verify authorized users:
-- SELECT email, is_platform_admin, is_authorized, authorized_at
-- FROM users
-- WHERE is_authorized = true
-- ORDER BY authorized_at DESC;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

-- DROP INDEX IF EXISTS idx_users_email_authorized;
-- DROP INDEX IF EXISTS idx_users_is_authorized;
-- ALTER TABLE users DROP COLUMN IF EXISTS authorized_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_authorized;
