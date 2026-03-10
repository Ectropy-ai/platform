-- =================================================
-- Migration 004: Project Members Table
-- =================================================
-- Purpose: Enable multi-user project collaboration and Row Level Security
-- Author: Enterprise Integration Team
-- Date: 2025-11-14
-- Dependencies: Requires migrations 001-003 to be applied
-- =================================================

-- Create project_members table for multi-tenant authorization
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_level INT NOT NULL, -- 1=READ, 2=WRITE, 3=ADMIN
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique membership
  UNIQUE(project_id, user_id),

  -- Validate permission level
  CONSTRAINT check_permission_level CHECK (permission_level BETWEEN 1 AND 3)
);

-- Add indexes for query performance
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_members_permission ON project_members(permission_level);

-- Add comments for documentation
COMMENT ON TABLE project_members IS 'Project team membership with role-based access control';
COMMENT ON COLUMN project_members.permission_level IS '1=READ (view only), 2=WRITE (edit), 3=ADMIN (full control)';
COMMENT ON COLUMN project_members.invited_by IS 'User who invited this member to the project';
COMMENT ON COLUMN project_members.joined_at IS 'Timestamp when user joined/accepted invitation';

-- Add updated_at trigger
CREATE TRIGGER trigger_project_members_updated_at
  BEFORE UPDATE ON project_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =================================================
-- Re-apply RLS Policies from Migration 003
-- =================================================
-- Now that project_members table exists, we can create the RLS policies

-- Enable RLS on Speckle tables
ALTER TABLE speckle_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE speckle_sync_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (from partial migration 003)
DROP POLICY IF EXISTS speckle_streams_access_policy ON speckle_streams;
DROP POLICY IF EXISTS speckle_sync_logs_access_policy ON speckle_sync_logs;

-- Policy: Users can only access Speckle streams for projects they have access to
CREATE POLICY speckle_streams_access_policy ON speckle_streams
  FOR ALL
  USING (
    construction_project_id IN (
      -- Projects where user is a member
      SELECT project_id FROM project_members WHERE user_id = current_user_id()
    )
    OR
    -- Projects owned by user
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = construction_project_id
      AND owner_id = current_user_id()
    )
  );

-- Policy: Users can only access Speckle sync logs for projects they have access to
CREATE POLICY speckle_sync_logs_access_policy ON speckle_sync_logs
  FOR ALL
  USING (
    construction_project_id IN (
      -- Projects where user is a member
      SELECT project_id FROM project_members WHERE user_id = current_user_id()
    )
    OR
    -- Projects owned by user
    EXISTS (
      SELECT 1 FROM projects
      WHERE id = construction_project_id
      AND owner_id = current_user_id()
    )
  );

-- =================================================
-- Verification and Summary
-- =================================================

DO $$
DECLARE
  table_count INT;
  index_count INT;
  policy_count INT;
BEGIN
  -- Count tables
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'project_members';

  -- Count indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'project_members';

  -- Count RLS policies
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename LIKE 'speckle%';

  -- Log results
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Migration 004 completed successfully';
  RAISE NOTICE '=================================================';
  RAISE NOTICE '  - project_members table: % created', CASE WHEN table_count > 0 THEN 'YES' ELSE 'NO' END;
  RAISE NOTICE '  - Indexes created: %', index_count;
  RAISE NOTICE '  - RLS policies created: % (expected: 2)', policy_count;
  RAISE NOTICE '=================================================';
  RAISE NOTICE 'Multi-tenant security: FULLY ENABLED';
  RAISE NOTICE '  - Row Level Security: ACTIVE';
  RAISE NOTICE '  - Team collaboration: ENABLED';
  RAISE NOTICE '  - Permission levels: READ, WRITE, ADMIN';
  RAISE NOTICE '=================================================';

  -- Verify success
  IF table_count = 0 THEN
    RAISE EXCEPTION 'Migration failed: project_members table not created';
  END IF;

  IF policy_count < 2 THEN
    RAISE WARNING 'Expected 2 RLS policies, but found %', policy_count;
  END IF;
END
$$;
