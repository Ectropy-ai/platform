-- ============================================================================
-- Migration: Demo Projects Table
-- Purpose: Store metadata for admin-created demo BIM projects
-- Created: 2025-12-19
-- Phase: 5a-d3 (One-Click Demo Setup)
-- ============================================================================
--
-- CONTEXT:
-- This migration supports the one-click demo setup feature that allows
-- administrators to create fully-configured BIM demo projects with Speckle
-- integration. The demo_projects table tracks which demo projects have been
-- created, including their Speckle stream IDs, uploaded model object IDs,
-- and configuration metadata.
--
-- FEATURE WORKFLOW:
-- 1. Admin clicks "Start Demo Setup" button in Admin Dashboard
-- 2. DemoSetupService creates Speckle admin user (idempotent)
-- 3. DemoSetupService creates Speckle project/stream via GraphQL
-- 4. DemoSetupService uploads IFC file for selected building type
-- 5. Metadata stored in demo_projects table (this schema)
-- 6. Admin redirected to BIM viewer with stream + object IDs
--
-- BUILDING TYPES SUPPORTED:
-- - residential-single-family: Ifc4_SampleHouse.ifc
-- - residential-multi-family: Ifc2x3_Duplex_Architecture.ifc
-- - commercial-office: demo-office-building.ifc
-- - commercial-large: Ifc4_Revit_ARC.ifc
--
-- RELATED FILES:
-- - apps/api-gateway/src/services/demo-setup.service.ts (backend service)
-- - apps/api-gateway/src/routes/admin.routes.ts (API endpoints)
-- - apps/web-dashboard/src/components/admin/DemoSetupDialog.tsx (frontend)
-- - apps/web-dashboard/src/pages/AdminDashboard.tsx (admin button)
-- - scripts/core/speckle-demo-setup.sh (bash automation)
-- ============================================================================

-- Create demo_projects table
CREATE TABLE IF NOT EXISTS demo_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Speckle integration identifiers
    stream_id VARCHAR(255) NOT NULL UNIQUE,
    object_id VARCHAR(255) NOT NULL,

    -- Project metadata
    project_name VARCHAR(255) NOT NULL,
    building_type VARCHAR(50) NOT NULL CHECK (
        building_type IN (
            'residential-single-family',
            'residential-multi-family',
            'commercial-office',
            'commercial-large'
        )
    ),

    -- Deployment environment (staging vs production)
    environment VARCHAR(20) NOT NULL CHECK (
        environment IN ('staging', 'production')
    ),

    -- Admin user who created this demo (nullable for backward compatibility)
    admin_user_id UUID,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_demo_projects_stream_id ON demo_projects(stream_id);
CREATE INDEX idx_demo_projects_building_type ON demo_projects(building_type);
CREATE INDEX idx_demo_projects_environment ON demo_projects(environment);
CREATE INDEX idx_demo_projects_created_at ON demo_projects(created_at DESC);
CREATE INDEX idx_demo_projects_admin_user_id ON demo_projects(admin_user_id);

-- Updated_at trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_demo_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_demo_projects_updated_at
    BEFORE UPDATE ON demo_projects
    FOR EACH ROW
    EXECUTE FUNCTION update_demo_projects_updated_at();

-- Comments for documentation
COMMENT ON TABLE demo_projects IS 'Stores metadata for admin-created demo BIM projects with Speckle integration';
COMMENT ON COLUMN demo_projects.stream_id IS 'Speckle stream ID (unique identifier for the BIM project)';
COMMENT ON COLUMN demo_projects.object_id IS 'Speckle object ID (specific version of the uploaded IFC model)';
COMMENT ON COLUMN demo_projects.project_name IS 'Human-readable project name displayed in BIM viewer';
COMMENT ON COLUMN demo_projects.building_type IS 'Type of building demo (residential-single-family, commercial-office, etc.)';
COMMENT ON COLUMN demo_projects.environment IS 'Deployment environment where demo was created (staging or production)';
COMMENT ON COLUMN demo_projects.admin_user_id IS 'ID of admin user who created this demo project (nullable)';
COMMENT ON COLUMN demo_projects.created_at IS 'Timestamp when demo project was created';
COMMENT ON COLUMN demo_projects.updated_at IS 'Timestamp when demo project metadata was last updated';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
