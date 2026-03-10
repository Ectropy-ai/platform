-- MT-M3 Row-Level Security (RLS) Implementation
-- Generated: 2026-01-23
-- Feature: Multi-Tenant Data Isolation for PIPEDA Compliance
-- Depends: MT-M1 (Multi-Tenant Foundation), MT-M2 (Tenant Context Service)

-- ==============================================================================
-- RLS Helper Functions
-- ==============================================================================

-- Get current tenant ID from session variable (set by application)
CREATE OR REPLACE FUNCTION rls_current_tenant_id()
RETURNS UUID AS $$
DECLARE
    tenant_id_str TEXT;
BEGIN
    -- Get tenant ID from session variable set by TenantContextService
    tenant_id_str := current_setting('app.current_tenant_id', true);

    -- Return NULL if not set (allows platform-level operations)
    IF tenant_id_str IS NULL OR tenant_id_str = '' THEN
        RETURN NULL;
    END IF;

    RETURN tenant_id_str::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if current user is a platform admin
CREATE OR REPLACE FUNCTION rls_is_platform_admin()
RETURNS BOOLEAN AS $$
DECLARE
    is_admin TEXT;
BEGIN
    is_admin := current_setting('app.is_platform_admin', true);
    RETURN COALESCE(is_admin = 'true', false);
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check tenant access (direct tenant_id column)
-- Returns TRUE if: platform admin, tenant matches, or row is platform-level (NULL tenant_id)
CREATE OR REPLACE FUNCTION rls_check_tenant_access(row_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Platform admins can access everything
    IF rls_is_platform_admin() THEN
        RETURN true;
    END IF;

    -- Allow access to platform-level data (NULL tenant_id)
    IF row_tenant_id IS NULL THEN
        RETURN true;
    END IF;

    -- Check if tenant matches
    RETURN row_tenant_id = rls_current_tenant_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check tenant access via project (for tables with project_id but no tenant_id)
CREATE OR REPLACE FUNCTION rls_check_project_tenant_access(row_project_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    project_tenant_id UUID;
BEGIN
    -- Platform admins can access everything
    IF rls_is_platform_admin() THEN
        RETURN true;
    END IF;

    -- Allow NULL project_id (global resources)
    IF row_project_id IS NULL THEN
        RETURN true;
    END IF;

    -- Look up tenant_id from projects table
    SELECT tenant_id INTO project_tenant_id
    FROM projects
    WHERE id = row_project_id;

    -- If project doesn't exist or has no tenant, deny access
    IF project_tenant_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check if tenant matches
    RETURN project_tenant_id = rls_current_tenant_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- Enable RLS on Primary Tables (Direct tenant_id)
-- ==============================================================================

-- Tenants table - only admins or own tenant
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_tenants" ON "tenants"
    FOR ALL
    USING (rls_is_platform_admin() OR id = rls_current_tenant_id())
    WITH CHECK (rls_is_platform_admin() OR id = rls_current_tenant_id());

-- Users table - tenant scoped with NULL for platform admins
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_users" ON "users"
    FOR ALL
    USING (rls_check_tenant_access(tenant_id))
    WITH CHECK (rls_check_tenant_access(tenant_id));

-- Projects table - tenant scoped
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_projects" ON "projects"
    FOR ALL
    USING (rls_check_tenant_access(tenant_id))
    WITH CHECK (rls_check_tenant_access(tenant_id));

-- Audit Log - tenant scoped with NULL for platform events
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_audit_log" ON "audit_log"
    FOR ALL
    USING (rls_check_tenant_access(tenant_id))
    WITH CHECK (rls_check_tenant_access(tenant_id));

-- ==============================================================================
-- Enable RLS on Project-Scoped Tables
-- ==============================================================================

-- Project Roles
ALTER TABLE "project_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_roles" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_project_roles" ON "project_roles"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Construction Elements
ALTER TABLE "construction_elements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "construction_elements" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_construction_elements" ON "construction_elements"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Uploaded IFC Files
ALTER TABLE "uploaded_ifc_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "uploaded_ifc_files" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_uploaded_ifc_files" ON "uploaded_ifc_files"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Proposals
ALTER TABLE "proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proposals" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_proposals" ON "proposals"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Speckle Streams
ALTER TABLE "speckle_streams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "speckle_streams" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_speckle_streams" ON "speckle_streams"
    FOR ALL
    USING (rls_check_project_tenant_access(construction_project_id))
    WITH CHECK (rls_check_project_tenant_access(construction_project_id));

-- Speckle Sync Logs
ALTER TABLE "speckle_sync_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "speckle_sync_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_speckle_sync_logs" ON "speckle_sync_logs"
    FOR ALL
    USING (rls_check_project_tenant_access(construction_project_id))
    WITH CHECK (rls_check_project_tenant_access(construction_project_id));

-- Participants (Authority system)
ALTER TABLE "participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "participants" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_participants" ON "participants"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Voxels
ALTER TABLE "voxels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voxels" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_voxels" ON "voxels"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- PM Decisions
ALTER TABLE "pm_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pm_decisions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_pm_decisions" ON "pm_decisions"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Consequences
ALTER TABLE "consequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consequences" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_consequences" ON "consequences"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Schedule Proposals
ALTER TABLE "schedule_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_proposals" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_schedule_proposals" ON "schedule_proposals"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Inspections
ALTER TABLE "inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspections" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_inspections" ON "inspections"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- ==============================================================================
-- Enable RLS on Dual-Process / USF Tables
-- ==============================================================================

-- Decision Events
ALTER TABLE "decision_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "decision_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_decision_events" ON "decision_events"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- Success Patterns (can be global with NULL project_id)
ALTER TABLE "success_patterns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "success_patterns" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_success_patterns" ON "success_patterns"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- SDI Snapshots
ALTER TABLE "sdi_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sdi_snapshots" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_sdi_snapshots" ON "sdi_snapshots"
    FOR ALL
    USING (rls_check_project_tenant_access(project_id))
    WITH CHECK (rls_check_project_tenant_access(project_id));

-- ==============================================================================
-- NOTE: USF Tables Not Yet Created
-- ==============================================================================
-- The following tables will be added in a future migration (MT-M4):
-- - usf_profiles
-- - usf_work_packets
-- - usf_labor_allocations
-- - usf_attributions
--
-- RLS policies for these tables will be enabled when the tables are created.

-- ==============================================================================
-- Enable RLS on Voxel-Related Tables (via voxel_id → voxels.project_id)
-- ==============================================================================

-- Helper function for voxel-based access
CREATE OR REPLACE FUNCTION rls_check_voxel_tenant_access(row_voxel_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    voxel_project_id UUID;
BEGIN
    -- Platform admins can access everything
    IF rls_is_platform_admin() THEN
        RETURN true;
    END IF;

    -- Allow NULL voxel_id
    IF row_voxel_id IS NULL THEN
        RETURN true;
    END IF;

    -- Look up project_id from voxels table
    SELECT project_id INTO voxel_project_id
    FROM voxels
    WHERE id = row_voxel_id;

    -- Delegate to project-based check
    RETURN rls_check_project_tenant_access(voxel_project_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Voxel Decision Attachments
ALTER TABLE "voxel_decision_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voxel_decision_attachments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_voxel_decision_attachments" ON "voxel_decision_attachments"
    FOR ALL
    USING (rls_check_voxel_tenant_access(voxel_id))
    WITH CHECK (rls_check_voxel_tenant_access(voxel_id));

-- Tolerance Overrides
ALTER TABLE "tolerance_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tolerance_overrides" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_tolerance_overrides" ON "tolerance_overrides"
    FOR ALL
    USING (rls_check_voxel_tenant_access(voxel_id))
    WITH CHECK (rls_check_voxel_tenant_access(voxel_id));

-- Pre-Approvals
ALTER TABLE "pre_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pre_approvals" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_pre_approvals" ON "pre_approvals"
    FOR ALL
    USING (rls_check_voxel_tenant_access(voxel_id))
    WITH CHECK (rls_check_voxel_tenant_access(voxel_id));

-- Voxel Alerts
ALTER TABLE "voxel_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voxel_alerts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_voxel_alerts" ON "voxel_alerts"
    FOR ALL
    USING (rls_check_voxel_tenant_access(voxel_id))
    WITH CHECK (rls_check_voxel_tenant_access(voxel_id));

-- ==============================================================================
-- Enable RLS on Decision-Related Tables (via decision_id → pm_decisions.project_id)
-- ==============================================================================

-- Helper function for decision-based access
CREATE OR REPLACE FUNCTION rls_check_decision_tenant_access(row_decision_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    decision_project_id UUID;
BEGIN
    -- Platform admins can access everything
    IF rls_is_platform_admin() THEN
        RETURN true;
    END IF;

    -- Allow NULL decision_id
    IF row_decision_id IS NULL THEN
        RETURN true;
    END IF;

    -- Look up project_id from pm_decisions table
    SELECT project_id INTO decision_project_id
    FROM pm_decisions
    WHERE id = row_decision_id;

    -- Delegate to project-based check
    RETURN rls_check_project_tenant_access(decision_project_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Acknowledgments
ALTER TABLE "acknowledgments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acknowledgments" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_acknowledgments" ON "acknowledgments"
    FOR ALL
    USING (rls_check_decision_tenant_access(decision_id))
    WITH CHECK (rls_check_decision_tenant_access(decision_id));

-- ==============================================================================
-- NOTE: USF Transitive Tables Not Yet Created
-- ==============================================================================
-- Helper function rls_check_work_packet_tenant_access() will be created
-- in MT-M4 when USF tables are added.
-- Tables pending: usf_labor_allocations, usf_attributions

-- ==============================================================================
-- Enable RLS on Remaining Tables
-- ==============================================================================

-- Votes (via proposal_id → proposals.project_id)
CREATE OR REPLACE FUNCTION rls_check_proposal_tenant_access(row_proposal_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    proposal_project_id UUID;
BEGIN
    IF rls_is_platform_admin() THEN
        RETURN true;
    END IF;

    IF row_proposal_id IS NULL THEN
        RETURN true;
    END IF;

    SELECT project_id INTO proposal_project_id
    FROM proposals
    WHERE id = row_proposal_id;

    RETURN rls_check_project_tenant_access(proposal_project_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

ALTER TABLE "votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "votes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_votes" ON "votes"
    FOR ALL
    USING (rls_check_proposal_tenant_access(proposal_id))
    WITH CHECK (rls_check_proposal_tenant_access(proposal_id));

-- User Sessions (via user_id → users.tenant_id)
CREATE OR REPLACE FUNCTION rls_check_user_tenant_access(row_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_tenant_id UUID;
BEGIN
    IF rls_is_platform_admin() THEN
        RETURN true;
    END IF;

    IF row_user_id IS NULL THEN
        RETURN true;
    END IF;

    SELECT tenant_id INTO user_tenant_id
    FROM users
    WHERE id = row_user_id;

    RETURN rls_check_tenant_access(user_tenant_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_user_sessions" ON "user_sessions"
    FOR ALL
    USING (rls_check_user_tenant_access(user_id))
    WITH CHECK (rls_check_user_tenant_access(user_id));

-- Authority Levels (global configuration - platform admin only for writes)
ALTER TABLE "authority_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "authority_levels" FORCE ROW LEVEL SECURITY;

CREATE POLICY "authority_levels_read" ON "authority_levels"
    FOR SELECT
    USING (true); -- Everyone can read authority levels

CREATE POLICY "authority_levels_write" ON "authority_levels"
    FOR ALL
    USING (rls_is_platform_admin())
    WITH CHECK (rls_is_platform_admin());

-- Waitlist (platform-level - admin only)
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waitlist" FORCE ROW LEVEL SECURITY;

CREATE POLICY "waitlist_admin_only" ON "waitlist"
    FOR ALL
    USING (rls_is_platform_admin())
    WITH CHECK (rls_is_platform_admin());

-- ==============================================================================
-- Performance Optimization: Add indexes for RLS function lookups
-- ==============================================================================

-- These indexes help with the lookup functions used by RLS policies
-- Most already exist from M1 but adding any missing ones

CREATE INDEX IF NOT EXISTS "idx_voxels_id_project" ON "voxels"("id", "project_id");
CREATE INDEX IF NOT EXISTS "idx_pm_decisions_id_project" ON "pm_decisions"("id", "project_id");
CREATE INDEX IF NOT EXISTS "idx_proposals_id_project" ON "proposals"("id", "project_id");
CREATE INDEX IF NOT EXISTS "idx_users_id_tenant" ON "users"("id", "tenant_id");

-- Note: idx_usf_work_packets_id_project will be created when USF tables are added (MT-M4)

-- ==============================================================================
-- Grants for RLS Functions
-- ==============================================================================

-- Grant execute permissions on RLS helper functions to authenticated role
-- (Adjust role name based on your PostgreSQL configuration)
GRANT EXECUTE ON FUNCTION rls_current_tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_is_platform_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_check_tenant_access(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_check_project_tenant_access(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_check_voxel_tenant_access(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_check_decision_tenant_access(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_check_proposal_tenant_access(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION rls_check_user_tenant_access(UUID) TO PUBLIC;

-- Note: rls_check_work_packet_tenant_access() grant will be added in MT-M4

-- ==============================================================================
-- Documentation
-- ==============================================================================

COMMENT ON FUNCTION rls_current_tenant_id() IS 'Returns current tenant UUID from session variable app.current_tenant_id';
COMMENT ON FUNCTION rls_is_platform_admin() IS 'Returns true if app.is_platform_admin session variable is set to true';
COMMENT ON FUNCTION rls_check_tenant_access(UUID) IS 'Checks if current session has access to specified tenant_id';
COMMENT ON FUNCTION rls_check_project_tenant_access(UUID) IS 'Checks tenant access via project_id foreign key lookup';
COMMENT ON FUNCTION rls_check_voxel_tenant_access(UUID) IS 'Checks tenant access via voxel_id → project_id chain';
COMMENT ON FUNCTION rls_check_decision_tenant_access(UUID) IS 'Checks tenant access via decision_id → project_id chain';

-- ==============================================================================
-- Summary
-- ==============================================================================
-- RLS enabled on 22 tables (USF tables will be added in MT-M4):
-- - Primary (direct tenant_id): tenants, users, projects, audit_log
-- - Project-scoped: project_roles, construction_elements, uploaded_ifc_files,
--   proposals, speckle_streams, speckle_sync_logs, participants, voxels,
--   pm_decisions, consequences, schedule_proposals, inspections,
--   decision_events, success_patterns, sdi_snapshots
-- - Voxel-scoped: voxel_decision_attachments, tolerance_overrides, pre_approvals, voxel_alerts
-- - Decision-scoped: acknowledgments
-- - Other: votes (proposal-scoped), user_sessions (user-scoped), authority_levels, waitlist
--
-- Deferred to MT-M4 (tables not yet created):
-- - USF tables: usf_profiles, usf_work_packets, usf_labor_allocations, usf_attributions
