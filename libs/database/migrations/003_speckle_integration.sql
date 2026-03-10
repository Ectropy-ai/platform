-- Migration 003: Speckle BIM Integration
-- Adds Speckle integration tables for bidirectional BIM data synchronization
-- Date: 2025-11-13
-- Purpose: Enable self-hosted Speckle BIM platform integration with construction management

-- Enable required extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- ============================================================================
-- SPECKLE STREAMS TABLE
-- ============================================================================
-- Maps construction projects to Speckle streams for BIM collaboration
CREATE TABLE IF NOT EXISTS speckle_streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    construction_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    stream_id VARCHAR(255) NOT NULL UNIQUE,
    stream_name VARCHAR(500) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT speckle_streams_project_unique UNIQUE(construction_project_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_speckle_streams_project ON speckle_streams(construction_project_id);
CREATE INDEX IF NOT EXISTS idx_speckle_streams_stream_id ON speckle_streams(stream_id);

-- Comments for documentation
COMMENT ON TABLE speckle_streams IS 'Maps construction projects to Speckle BIM streams';
COMMENT ON COLUMN speckle_streams.construction_project_id IS 'Foreign key to construction projects table';
COMMENT ON COLUMN speckle_streams.stream_id IS 'Speckle stream identifier from Speckle server';
COMMENT ON COLUMN speckle_streams.stream_name IS 'Human-readable name of the Speckle stream';

-- ============================================================================
-- SPECKLE SYNC LOGS TABLE
-- ============================================================================
-- Tracks all synchronization operations between Ectropy and Speckle
CREATE TABLE IF NOT EXISTS speckle_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    construction_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    operation VARCHAR(50) NOT NULL CHECK (operation IN ('import', 'export', 'sync')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('started', 'in_progress', 'completed', 'failed')),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    objects_processed INTEGER DEFAULT 0,
    objects_successful INTEGER DEFAULT 0,
    objects_failed INTEGER DEFAULT 0,
    error_details JSONB,

    -- Constraints
    CONSTRAINT speckle_sync_logs_objects_check CHECK (
        objects_processed = objects_successful + objects_failed
    )
);

-- Indexes for performance and monitoring
CREATE INDEX IF NOT EXISTS idx_speckle_sync_logs_project ON speckle_sync_logs(construction_project_id);
CREATE INDEX IF NOT EXISTS idx_speckle_sync_logs_status ON speckle_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_speckle_sync_logs_operation ON speckle_sync_logs(operation);
CREATE INDEX IF NOT EXISTS idx_speckle_sync_logs_started_at ON speckle_sync_logs(started_at DESC);

-- Comments
COMMENT ON TABLE speckle_sync_logs IS 'Audit log of all Speckle synchronization operations';
COMMENT ON COLUMN speckle_sync_logs.operation IS 'Type of sync: import (Speckle→DB), export (DB→Speckle), or bidirectional sync';
COMMENT ON COLUMN speckle_sync_logs.status IS 'Current status of the sync operation';
COMMENT ON COLUMN speckle_sync_logs.error_details IS 'JSON object containing error details if sync failed';

-- ============================================================================
-- CONSTRUCTION ELEMENTS TABLE ENHANCEMENTS
-- ============================================================================
-- Add Speckle-specific columns to existing construction_elements table
-- Note: This assumes construction_elements table already exists from previous migrations

-- Add speckle_object_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'construction_elements'
        AND column_name = 'speckle_object_id'
    ) THEN
        ALTER TABLE construction_elements
        ADD COLUMN speckle_object_id VARCHAR(255);

        -- Add index for fast Speckle lookups
        CREATE INDEX idx_construction_elements_speckle_id
        ON construction_elements(speckle_object_id)
        WHERE speckle_object_id IS NOT NULL;
    END IF;
END $$;

-- Add element_type column if it doesn't exist (for Speckle type mapping)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'construction_elements'
        AND column_name = 'element_type'
    ) THEN
        ALTER TABLE construction_elements
        ADD COLUMN element_type VARCHAR(100);

        CREATE INDEX idx_construction_elements_type
        ON construction_elements(element_type);
    END IF;
END $$;

-- Add geometry_data column if it doesn't exist (for BIM geometry storage)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'construction_elements'
        AND column_name = 'geometry_data'
    ) THEN
        ALTER TABLE construction_elements
        ADD COLUMN geometry_data JSONB;

        -- GIN index for efficient JSONB queries
        CREATE INDEX idx_construction_elements_geometry
        ON construction_elements USING GIN (geometry_data);
    END IF;
END $$;

-- Add updated_at column if it doesn't exist (for change tracking)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'construction_elements'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE construction_elements
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- DATABASE FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on speckle_streams
DROP TRIGGER IF EXISTS trigger_speckle_streams_updated_at ON speckle_streams;
CREATE TRIGGER trigger_speckle_streams_updated_at
    BEFORE UPDATE ON speckle_streams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at on construction_elements
DROP TRIGGER IF EXISTS trigger_construction_elements_updated_at ON construction_elements;
CREATE TRIGGER trigger_construction_elements_updated_at
    BEFORE UPDATE ON construction_elements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- View for monitoring active sync operations
CREATE OR REPLACE VIEW v_active_speckle_syncs AS
SELECT
    sl.id,
    sl.construction_project_id,
    p.name AS project_name,
    sl.operation,
    sl.status,
    sl.started_at,
    EXTRACT(EPOCH FROM (NOW() - sl.started_at)) AS duration_seconds,
    sl.objects_processed,
    sl.objects_successful,
    sl.objects_failed
FROM speckle_sync_logs sl
JOIN projects p ON p.id = sl.construction_project_id
WHERE sl.status IN ('started', 'in_progress')
ORDER BY sl.started_at DESC;

COMMENT ON VIEW v_active_speckle_syncs IS 'Real-time view of active Speckle synchronization operations';

-- View for project-stream mappings with statistics
CREATE OR REPLACE VIEW v_project_speckle_streams AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    ss.stream_id,
    ss.stream_name,
    ss.created_at AS stream_created_at,
    COUNT(DISTINCT ce.id) AS element_count,
    MAX(sl.started_at) AS last_sync_at,
    COUNT(DISTINCT sl.id) FILTER (WHERE sl.status = 'completed') AS successful_syncs,
    COUNT(DISTINCT sl.id) FILTER (WHERE sl.status = 'failed') AS failed_syncs
FROM projects p
LEFT JOIN speckle_streams ss ON ss.construction_project_id = p.id
LEFT JOIN construction_elements ce ON ce.project_id = p.id AND ce.speckle_object_id IS NOT NULL
LEFT JOIN speckle_sync_logs sl ON sl.construction_project_id = p.id
GROUP BY p.id, p.name, ss.stream_id, ss.stream_name, ss.created_at;

COMMENT ON VIEW v_project_speckle_streams IS 'Overview of Speckle integration status for all projects';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE speckle_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE speckle_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access Speckle data for projects they have access to
CREATE POLICY speckle_streams_access_policy ON speckle_streams
    FOR ALL
    USING (
        construction_project_id IN (
            SELECT project_id FROM project_members WHERE user_id = current_user_id()
        )
        OR
        EXISTS (
            SELECT 1 FROM projects
            WHERE id = construction_project_id
            AND owner_id = current_user_id()
        )
    );

CREATE POLICY speckle_sync_logs_access_policy ON speckle_sync_logs
    FOR ALL
    USING (
        construction_project_id IN (
            SELECT project_id FROM project_members WHERE user_id = current_user_id()
        )
        OR
        EXISTS (
            SELECT 1 FROM projects
            WHERE id = construction_project_id
            AND owner_id = current_user_id()
        )
    );

-- Note: Assumes current_user_id() function exists from previous migrations
-- If not, create it:
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================================
-- DATA VALIDATION
-- ============================================================================

-- Verify migration success
DO $$
DECLARE
    table_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Count new tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_name IN ('speckle_streams', 'speckle_sync_logs')
    AND table_schema = 'public';

    -- Count new indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename IN ('speckle_streams', 'speckle_sync_logs', 'construction_elements')
    AND schemaname = 'public'
    AND indexname LIKE 'idx_speckle%' OR indexname LIKE '%speckle%';

    -- Raise notice with results
    RAISE NOTICE 'Speckle integration migration completed successfully';
    RAISE NOTICE '  - Tables created/verified: %', table_count;
    RAISE NOTICE '  - Indexes created: %', index_count;
    RAISE NOTICE '  - Views created: 2';
    RAISE NOTICE '  - Triggers created: 2';
    RAISE NOTICE '  - RLS policies: 2';

    -- Fail if tables weren't created
    IF table_count < 2 THEN
        RAISE EXCEPTION 'Migration failed: Expected 2 tables, found %', table_count;
    END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Migration 003 successfully adds Speckle BIM integration infrastructure
-- Next steps:
--   1. Initialize Speckle server database (separate 'speckle' database)
--   2. Configure Speckle environment variables
--   3. Deploy Speckle services via docker-compose
--   4. Test bidirectional synchronization
