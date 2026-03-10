-- Core schema for Federated Construction Platform
-- Includes projects, users, project_roles, construction_elements, element_relationships, element_documents, audit_log
-- Add RLS policies and extensions as needed

-- Example table (expand as needed):
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_code VARCHAR(100) UNIQUE NOT NULL,
    status project_status DEFAULT 'planning',
    location GEOMETRY(POINT, 4326),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_location ON projects USING GIST(location);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    username VARCHAR(100) UNIQUE,
    role VARCHAR(100),
    skills JSONB DEFAULT '[]',
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;

-- Project roles table (user membership and role in projects)
CREATE TABLE IF NOT EXISTS project_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    role_name VARCHAR(100) NOT NULL,
    role_weight INTEGER DEFAULT 1,
    permissions JSONB NOT NULL DEFAULT '{}',
    element_types JSONB DEFAULT '[]',
    zones JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    granted_at TIMESTAMP DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    UNIQUE(project_id, user_id, role_name)
);
CREATE INDEX IF NOT EXISTS idx_project_roles_active ON project_roles(project_id, user_id) WHERE is_active = true;

-- Construction elements table
CREATE TABLE IF NOT EXISTS construction_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES construction_elements(id),
    name VARCHAR(255) NOT NULL,
    element_type VARCHAR(100) NOT NULL,
    ifc_id VARCHAR(255),
    ifc_class VARCHAR(100),
    element_name VARCHAR(255),
    element_code VARCHAR(100),
    location GEOMETRY(POINT, 4326),
    bounding_box GEOMETRY(POLYGON, 4326),
    geometric_data JSONB,
    properties JSONB NOT NULL DEFAULT '{}',
    specifications JSONB DEFAULT '{}',
    relationships JSONB DEFAULT '{}',
    kpi_values JSONB DEFAULT '{}',
    compliance_status JSONB DEFAULT '{}',
    installation_status element_status DEFAULT 'planned',
    installation_data JSONB DEFAULT '{}',
    verification_data JSONB DEFAULT '{}',
    access_control JSONB NOT NULL DEFAULT '{ "field_permissions": {} }',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_elements_project_type ON construction_elements(project_id, element_type);
CREATE INDEX IF NOT EXISTS idx_elements_properties_gin ON construction_elements USING GIN(properties);
CREATE INDEX IF NOT EXISTS idx_elements_access_control_gin ON construction_elements USING GIN(access_control);

-- Element relationships table (for complex dependencies)
CREATE TABLE IF NOT EXISTS element_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_element_id UUID REFERENCES construction_elements(id) ON DELETE CASCADE,
    to_element_id UUID REFERENCES construction_elements(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL,
    properties JSONB DEFAULT '{}',
    strength DECIMAL(3,2) DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    UNIQUE(parent_element_id, child_element_id, relationship_type)
);

-- Element documents table (attachments, drawings, etc.)
CREATE TABLE IF NOT EXISTS element_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    element_id UUID REFERENCES construction_elements(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50),
    file_hash VARCHAR(64),
    document_type VARCHAR(100),
    title VARCHAR(255),
    description TEXT,
    version VARCHAR(20),
    access_level VARCHAR(50) DEFAULT 'project',
    uploaded_at TIMESTAMP DEFAULT NOW(),
    uploaded_by UUID REFERENCES users(id)
);

-- Audit log table (for tracking changes and access)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(100),
    target_id UUID,
    details JSONB,
    operation VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ENUM types for project and element status, and access operations
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE project_status AS ENUM ('planning', 'design', 'construction', 'operations', 'completed', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'element_status') THEN
        CREATE TYPE element_status AS ENUM ('planned', 'designed', 'specified', 'procured', 'installed', 'verified', 'operational');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'access_operation') THEN
        CREATE TYPE access_operation AS ENUM ('read', 'write', 'delete', 'admin');
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_roles_user_project ON project_roles(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_elements_project ON construction_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_elements_parent ON construction_elements(parent_id);
CREATE INDEX IF NOT EXISTS idx_element_docs_element ON element_documents(element_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);

-- Row-Level Security (RLS) policies and access control functions
-- Enable RLS on all core tables with sensitive data
ALTER TABLE construction_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE element_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: Only allow users with project_roles to access elements in their projects
CREATE POLICY IF NOT EXISTS element_project_access ON construction_elements
    USING (EXISTS (
        SELECT 1 FROM project_roles
        WHERE project_roles.user_id = current_setting('app.user_id', true)::uuid
          AND project_roles.project_id = construction_elements.project_id
          AND project_roles.is_active = TRUE
    ));

-- RLS: Element-level access control (read/write/delete/admin)
-- This policy should be refined with a function for fine-grained checks
CREATE OR REPLACE FUNCTION check_element_access(
    user_id UUID,
    element_id UUID,
    op access_operation
) RETURNS BOOLEAN AS $$
DECLARE
    perms JSONB;
    role_names TEXT[];
    has_permission BOOLEAN := FALSE;
BEGIN
    SELECT access_control FROM construction_elements WHERE id = element_id INTO perms;
    IF perms IS NULL THEN RETURN FALSE; END IF;
    SELECT ARRAY_AGG(role_name) FROM project_roles WHERE user_id = user_id AND project_id = (SELECT project_id FROM construction_elements WHERE id = element_id) AND is_active = TRUE INTO role_names;
    IF role_names IS NULL THEN RETURN FALSE; END IF;
    -- Example: check if any of the user's roles are in the allowed roles for the operation
    has_permission := EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(perms->(op::text || '_roles')) AS allowed_role
        WHERE allowed_role = ANY(role_names)
    );
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: check field-level access for a specific element property
CREATE OR REPLACE FUNCTION check_element_field_access(
    user_id UUID,
    element_id UUID,
    op access_operation,
    field_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    perms JSONB;
    role_names TEXT[];
    allowed_roles TEXT[];
    has_permission BOOLEAN := FALSE;
BEGIN
    SELECT access_control FROM construction_elements WHERE id = element_id INTO perms;
    IF perms IS NULL THEN RETURN FALSE; END IF;
    SELECT ARRAY_AGG(role_name) FROM project_roles
        WHERE user_id = user_id AND project_id = (SELECT project_id FROM construction_elements WHERE id = element_id)
          AND is_active = TRUE INTO role_names;
    IF role_names IS NULL THEN RETURN FALSE; END IF;

    allowed_roles := ARRAY(SELECT jsonb_array_elements_text(perms->'field_permissions'->field_name->(op::text || '_roles')));
    IF allowed_roles IS NULL OR array_length(allowed_roles, 1) = 0 THEN
        allowed_roles := ARRAY(SELECT jsonb_array_elements_text(perms->(op::text || '_roles')));
    END IF;

    has_permission := EXISTS (
        SELECT 1 FROM unnest(allowed_roles) AS allowed_role
        WHERE allowed_role = ANY(role_names)
    );
    RETURN has_permission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: list element IDs accessible to a user for an operation
CREATE OR REPLACE FUNCTION get_accessible_elements(
    user_id UUID,
    project_id UUID,
    op access_operation
) RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
    SELECT id FROM construction_elements
    WHERE project_id = project_id
      AND check_element_access(user_id, id, op);
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper: verify if a user has the admin role
CREATE OR REPLACE FUNCTION user_is_admin(uid UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users WHERE id = uid AND role = 'admin' AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS: Use the function for element access
CREATE POLICY IF NOT EXISTS element_rls_policy ON construction_elements
    USING (check_element_access(current_setting('app.user_id', true)::uuid, id, 'read'));

-- Granular RLS policies for all element operations
CREATE POLICY IF NOT EXISTS element_select_policy ON construction_elements
    FOR SELECT
    USING (check_element_access(current_setting('app.user_id', true)::uuid, id, 'read'));

CREATE POLICY IF NOT EXISTS element_insert_policy ON construction_elements
    FOR INSERT
    WITH CHECK (check_element_access(current_setting('app.user_id', true)::uuid, id, 'write'));

CREATE POLICY IF NOT EXISTS element_update_policy ON construction_elements
    FOR UPDATE
    USING (check_element_access(current_setting('app.user_id', true)::uuid, id, 'write'));

CREATE POLICY IF NOT EXISTS element_delete_policy ON construction_elements
    FOR DELETE
    USING (check_element_access(current_setting('app.user_id', true)::uuid, id, 'delete'));

-- Element document access aligned with parent element permissions
CREATE POLICY IF NOT EXISTS element_documents_select ON element_documents
    FOR SELECT
    USING (check_element_access(current_setting('app.user_id', true)::uuid, element_id, 'read'));

CREATE POLICY IF NOT EXISTS element_documents_insert ON element_documents
    FOR INSERT
    WITH CHECK (check_element_access(current_setting('app.user_id', true)::uuid, element_id, 'write'));

CREATE POLICY IF NOT EXISTS element_documents_update ON element_documents
    FOR UPDATE
    USING (check_element_access(current_setting('app.user_id', true)::uuid, element_id, 'write'));

CREATE POLICY IF NOT EXISTS element_documents_delete ON element_documents
    FOR DELETE
    USING (check_element_access(current_setting('app.user_id', true)::uuid, element_id, 'delete'));

-- Allow audit log access only for admin users
CREATE POLICY IF NOT EXISTS audit_log_read_policy ON audit_log
    FOR SELECT
    USING (user_is_admin(current_setting('app.user_id', true)::uuid));

-- Document: To use RLS, set the user context at session start:
--   SELECT set_config('app.user_id', '<user-uuid>', true);
--   All queries will then be filtered by RLS policies.

