-- Speckle Database Setup for Federated Construction Platform
-- This script creates the Speckle database and integrates it with our construction platform

-- Connect to postgres and create Speckle database
\c postgres
CREATE DATABASE IF NOT EXISTS speckle_db;

-- Grant access to our existing user
GRANT ALL PRIVILEGES ON DATABASE speckle_db TO postgres;

-- Connect to our main construction platform database
\c construction_platform

-- Create Speckle integration tables
CREATE TABLE IF NOT EXISTS speckle_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    construction_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    speckle_project_id VARCHAR(255) NOT NULL UNIQUE,
    speckle_stream_id VARCHAR(255) NOT NULL,
    speckle_branch_name VARCHAR(255) DEFAULT 'main',
    sync_enabled BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS speckle_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    construction_element_id UUID NOT NULL REFERENCES construction_elements(id) ON DELETE CASCADE,
    speckle_object_id VARCHAR(255) NOT NULL,
    speckle_commit_id VARCHAR(255) NOT NULL,
    object_type VARCHAR(255) NOT NULL,
    object_data JSONB DEFAULT '{}',
    sync_status VARCHAR(50) DEFAULT 'pending',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(construction_element_id, speckle_object_id)
);

CREATE TABLE IF NOT EXISTS speckle_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    speckle_project_id UUID REFERENCES speckle_projects(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- 'import', 'export', 'bidirectional'
    sync_direction VARCHAR(50) NOT NULL, -- 'speckle_to_db', 'db_to_speckle'
    commit_id VARCHAR(255),
    objects_processed INTEGER DEFAULT 0,
    objects_successful INTEGER DEFAULT 0,
    objects_failed INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'in_progress',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_speckle_projects_construction_id ON speckle_projects(construction_project_id);
CREATE INDEX IF NOT EXISTS idx_speckle_projects_stream_id ON speckle_projects(speckle_stream_id);
CREATE INDEX IF NOT EXISTS idx_speckle_objects_element_id ON speckle_objects(construction_element_id);
CREATE INDEX IF NOT EXISTS idx_speckle_objects_speckle_id ON speckle_objects(speckle_object_id);
CREATE INDEX IF NOT EXISTS idx_speckle_objects_commit_id ON speckle_objects(speckle_commit_id);
CREATE INDEX IF NOT EXISTS idx_speckle_objects_type ON speckle_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_speckle_objects_data ON speckle_objects USING GIN (object_data);
CREATE INDEX IF NOT EXISTS idx_speckle_sync_log_project ON speckle_sync_log(speckle_project_id);
CREATE INDEX IF NOT EXISTS idx_speckle_sync_log_status ON speckle_sync_log(status);

-- Function to sync Speckle object to construction element
CREATE OR REPLACE FUNCTION sync_speckle_to_construction_element(
    p_speckle_object_id VARCHAR(255),
    p_speckle_commit_id VARCHAR(255),
    p_project_id UUID,
    p_object_data JSONB
) RETURNS UUID AS $$
DECLARE
    v_element_id UUID;
    v_element_type VARCHAR(100);
    v_ifc_id VARCHAR(255);
    v_properties JSONB;
    v_geometric_data JSONB;
BEGIN
    -- Extract data from Speckle object
    v_element_type := p_object_data->>'speckle_type';
    v_ifc_id := p_object_data->>'id';
    v_properties := COALESCE(p_object_data->'properties', '{}'::jsonb);
    v_geometric_data := COALESCE(p_object_data->'geometry', '{}'::jsonb);
    
    -- Check if construction element already exists
    SELECT ce.id INTO v_element_id
    FROM construction_elements ce
    JOIN speckle_objects so ON ce.id = so.construction_element_id
    WHERE so.speckle_object_id = p_speckle_object_id;
    
    IF v_element_id IS NULL THEN
        -- Create new construction element
        INSERT INTO construction_elements (
            project_id, 
            element_type, 
            ifc_id, 
            geometric_data, 
            properties,
            status
        ) VALUES (
            p_project_id,
            v_element_type,
            v_ifc_id,
            v_geometric_data,
            v_properties,
            'planned'
        ) RETURNING id INTO v_element_id;
        
        -- Create speckle object mapping
        INSERT INTO speckle_objects (
            construction_element_id,
            speckle_object_id,
            speckle_commit_id,
            object_type,
            object_data,
            sync_status,
            last_sync_at
        ) VALUES (
            v_element_id,
            p_speckle_object_id,
            p_speckle_commit_id,
            v_element_type,
            p_object_data,
            'synced',
            NOW()
        );
    ELSE
        -- Update existing construction element
        UPDATE construction_elements 
        SET 
            geometric_data = v_geometric_data,
            properties = v_properties,
            updated_at = NOW()
        WHERE id = v_element_id;
        
        -- Update speckle object mapping
        UPDATE speckle_objects 
        SET 
            speckle_commit_id = p_speckle_commit_id,
            object_data = p_object_data,
            sync_status = 'synced',
            last_sync_at = NOW(),
            updated_at = NOW()
        WHERE construction_element_id = v_element_id 
        AND speckle_object_id = p_speckle_object_id;
    END IF;
    
    RETURN v_element_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access Speckle project
CREATE OR REPLACE FUNCTION check_speckle_project_access(
    user_id_param UUID,
    speckle_project_id_param UUID,
    operation_param access_operation
) RETURNS BOOLEAN AS $$
DECLARE
    construction_project_id UUID;
    has_access BOOLEAN := FALSE;
BEGIN
    -- Get the construction project ID
    SELECT construction_project_id INTO construction_project_id
    FROM speckle_projects
    WHERE id = speckle_project_id_param;
    
    IF construction_project_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user has access to the construction project
    -- This leverages our existing project access control
    SELECT EXISTS(
        SELECT 1 FROM projects p
        WHERE p.id = construction_project_id
        AND (
            p.owner_id = user_id_param
            OR EXISTS(
                SELECT 1 FROM project_roles pr
                WHERE pr.project_id = p.id
                AND pr.user_id = user_id_param
                AND pr.is_active = true
            )
        )
    ) INTO has_access;
    
    RETURN has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically sync changes from construction_elements to Speckle
CREATE OR REPLACE FUNCTION trigger_speckle_sync() RETURNS TRIGGER AS $$
BEGIN
    -- Insert sync task for external processor
    INSERT INTO speckle_sync_log (
        speckle_project_id,
        sync_type,
        sync_direction,
        objects_processed,
        status
    )
    SELECT 
        sp.id,
        'export',
        'db_to_speckle',
        1,
        'pending'
    FROM speckle_projects sp
    JOIN speckle_objects so ON so.construction_element_id = NEW.id
    WHERE sp.construction_project_id = NEW.project_id
    AND sp.sync_enabled = true;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on construction_elements updates
DROP TRIGGER IF EXISTS trigger_construction_element_speckle_sync ON construction_elements;
CREATE TRIGGER trigger_construction_element_speckle_sync
    AFTER UPDATE ON construction_elements
    FOR EACH ROW
    EXECUTE FUNCTION trigger_speckle_sync();

-- Sample Speckle project setup for our test data
INSERT INTO speckle_projects (
    construction_project_id,
    speckle_project_id,
    speckle_stream_id,
    speckle_branch_name
) 
SELECT 
    id,
    'sp_' || substr(id::text, 1, 8),
    'stream_' || substr(id::text, 1, 8),
    'main'
FROM projects 
WHERE name = 'Modern Office Complex'
ON CONFLICT (speckle_stream_id) DO NOTHING;

-- Verification queries
SELECT 'Speckle integration setup complete!' as status;
SELECT COUNT(*) as speckle_projects_count FROM speckle_projects;
SELECT COUNT(*) as speckle_objects_count FROM speckle_objects;
SELECT COUNT(*) as construction_elements_count FROM construction_elements;
