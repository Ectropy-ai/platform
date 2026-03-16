-- Fix RLS: Add permissive app_access policies for the ectropy DB user
--
-- Root cause: All tables had RLS enabled with tenant_isolation policies
-- that check session variables (app.current_tenant_id), but the API gateway
-- connects as the 'ectropy' user and never sets these variables. Without
-- a permissive policy for the ectropy role, every query returned empty results.
--
-- This caused passport.findUnique({ where: { email } }) to return null for
-- existing users, falling into the new-user path which then failed on
-- tenant.create() — also blocked by RLS.
--
-- Fix: Permissive app_access policies for the ectropy role on all RLS-enabled
-- tables. Auth is enforced at the API layer, not the DB layer, for this role.
-- Same pattern already applied to speckle_streams and speckle_sync_logs.
--
-- Idempotent: uses DO/EXCEPTION blocks so re-running is safe.

-- Core auth tables (critical for login flow)
DO $$ BEGIN
  CREATE POLICY "users_app_access" ON "users"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "tenants_app_access" ON "tenants"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "user_sessions_app_access" ON "user_sessions"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Project & role tables
DO $$ BEGIN
  CREATE POLICY "projects_app_access" ON "projects"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "project_roles_app_access" ON "project_roles"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Decision engine tables
DO $$ BEGIN
  CREATE POLICY "pm_decisions_app_access" ON "pm_decisions"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "decision_events_app_access" ON "decision_events"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "proposals_app_access" ON "proposals"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "votes_app_access" ON "votes"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "participants_app_access" ON "participants"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "consequences_app_access" ON "consequences"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "pre_approvals_app_access" ON "pre_approvals"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "acknowledgments_app_access" ON "acknowledgments"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "schedule_proposals_app_access" ON "schedule_proposals"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Inspection & construction tables
DO $$ BEGIN
  CREATE POLICY "inspections_app_access" ON "inspections"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "construction_elements_app_access" ON "construction_elements"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "tolerance_overrides_app_access" ON "tolerance_overrides"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "uploaded_ifc_files_app_access" ON "uploaded_ifc_files"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Voxel tables
DO $$ BEGIN
  CREATE POLICY "voxels_app_access" ON "voxels"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "voxel_alerts_app_access" ON "voxel_alerts"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "voxel_decision_attachments_app_access" ON "voxel_decision_attachments"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Analytics & audit tables
DO $$ BEGIN
  CREATE POLICY "sdi_snapshots_app_access" ON "sdi_snapshots"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "success_patterns_app_access" ON "success_patterns"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "audit_log_app_access" ON "audit_log"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reference data tables
DO $$ BEGIN
  CREATE POLICY "authority_levels_app_access" ON "authority_levels"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Waitlist
DO $$ BEGIN
  CREATE POLICY "waitlist_app_access" ON "waitlist"
    FOR ALL TO ectropy USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
