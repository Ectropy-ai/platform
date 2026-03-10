-- Comprehensive Database Schema for Federated Construction Platform
-- Based on Technical Implementation Plan

-- Enable additional extensions for advanced features
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create application role for RLS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'construction_app') THEN
        CREATE ROLE construction_app;
    END IF;
END
$$;

-- Projects table with enhanced spatial and governance features
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    project_code VARCHAR(100) UNIQUE NOT NULL,
    status project_status DEFAULT 'planning',
    location GEOMETRY(POINT, 4326),
    bounding_box GEOMETRY(POLYGON, 4326),
    governance_address VARCHAR(42), -- Ethereum address for DAO
    governance_token_contract VARCHAR(42),
    total_budget DECIMAL(20,2),
    currency VARCHAR(3) DEFAULT 'USD',
    start_date DATE,
    expected_completion DATE,
    actual_completion DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Users table with enhanced authentication and role management
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    role VARCHAR(100),
    skills JSONB DEFAULT '[]'::jsonb,
    certifications JSONB DEFAULT '[]'::jsonb,
    wallet_address VARCHAR(42), -- Ethereum wallet
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret TEXT,
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    profile_data JSONB DEFAULT '{}'::jsonb
);

-- Project roles table for stakeholder management
CREATE TABLE IF NOT EXISTS project_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role stakeholder_type NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    voting_power INTEGER DEFAULT 0,
    contribution_value DECIMAL(20,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    UNIQUE(project_id, user_id, role)
);

-- Construction elements table with optimized JSONB for element-level access control
CREATE TABLE IF NOT EXISTS construction_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    element_type VARCHAR(100) NOT NULL,
    ifc_id VARCHAR(255),
    speckle_id VARCHAR(255),
    element_name VARCHAR(255),
    element_description TEXT,
    geometric_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    material_properties JSONB DEFAULT '{}'::jsonb,
    performance_data JSONB DEFAULT '{}'::jsonb,
    relationships JSONB DEFAULT '{}'::jsonb,
    access_control JSONB NOT NULL DEFAULT '{"read_roles": [], "write_roles": [], "admin_roles": []}'::jsonb,
    validation_status JSONB DEFAULT '{}'::jsonb,
    compliance_status JSONB DEFAULT '{}'::jsonb,
    manufacturer_data JSONB DEFAULT '{}'::jsonb,
    installation_data JSONB DEFAULT '{}'::jsonb,
    status element_status DEFAULT 'planned',
    version INTEGER DEFAULT 1,
    parent_element_id UUID REFERENCES construction_elements(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Uploaded IFC files for tracking model imports
CREATE TABLE IF NOT EXISTS uploaded_ifc_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    speckle_stream_id VARCHAR(255),
    upload_time TIMESTAMP DEFAULT NOW()
);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uploaded_ifc_files_project ON uploaded_ifc_files(project_id);

-- Element relationships table for complex building hierarchies
CREATE TABLE IF NOT EXISTS element_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_element_id UUID NOT NULL REFERENCES construction_elements(id) ON DELETE CASCADE,
    child_element_id UUID NOT NULL REFERENCES construction_elements(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL,
    relationship_properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(parent_element_id, child_element_id, relationship_type)
);

-- Element documents table for file attachments and documentation
CREATE TABLE IF NOT EXISTS element_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    element_id UUID NOT NULL REFERENCES construction_elements(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_path TEXT,
    document_url TEXT,
    file_size BIGINT,
    mime_type VARCHAR(100),
    checksum VARCHAR(64),
    upload_date TIMESTAMP DEFAULT NOW(),
    uploaded_by UUID REFERENCES users(id),
    access_level VARCHAR(50) DEFAULT 'project',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- KPI tracking table for performance monitoring
CREATE TABLE IF NOT EXISTS project_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kpi_name VARCHAR(255) NOT NULL,
    kpi_type VARCHAR(100) NOT NULL,
    target_value DECIMAL(20,4),
    actual_value DECIMAL(20,4),
    unit VARCHAR(50),
    tolerance_percentage DECIMAL(5,2),
    measurement_date TIMESTAMP DEFAULT NOW(),
    validation_status BOOLEAN,
    smart_contract_tx_hash VARCHAR(66),
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Milestones table for project progress tracking
CREATE TABLE IF NOT EXISTS project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    milestone_name VARCHAR(255) NOT NULL,
    milestone_description TEXT,
    due_date DATE,
    completion_date DATE,
    required_kpis UUID[] DEFAULT '{}',
    approval_threshold INTEGER DEFAULT 50, -- Percentage of stakeholders needed
    current_approvals INTEGER DEFAULT 0,
    payment_amount DECIMAL(20,2),
    smart_contract_address VARCHAR(42),
    blockchain_status VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Milestone approvals table
CREATE TABLE IF NOT EXISTS milestone_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approval_status BOOLEAN NOT NULL,
    approval_date TIMESTAMP DEFAULT NOW(),
    comments TEXT,
    UNIQUE(milestone_id, user_id)
);

-- Audit log table for comprehensive tracking
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    additional_context JSONB DEFAULT '{}'::jsonb
);

-- API integrations table for external data sources
CREATE TABLE IF NOT EXISTS api_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    integration_name VARCHAR(255) NOT NULL,
    integration_type VARCHAR(100) NOT NULL, -- 'manufacturer', 'speckle', 'iot', 'ai_agent'
    endpoint_url TEXT NOT NULL,
    api_key_hash TEXT,
    configuration JSONB DEFAULT '{}'::jsonb,
    last_sync TIMESTAMP,
    sync_status VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- AI agent tasks table
CREATE TABLE IF NOT EXISTS ai_agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    agent_type VARCHAR(100) NOT NULL, -- 'compliance', 'performance', 'procurement'
    task_name VARCHAR(255) NOT NULL,
    task_description TEXT,
    input_data JSONB,
    output_data JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    priority INTEGER DEFAULT 5,
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Session management table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create optimized indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_location ON projects USING GIST(location);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_governance ON projects(governance_address) WHERE governance_address IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_wallet ON users(wallet_address) WHERE wallet_address IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_roles_active ON project_roles(project_id, user_id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_roles_type ON project_roles(project_id, role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_project_type ON construction_elements(project_id, element_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_ifc_id ON construction_elements(ifc_id) WHERE ifc_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_speckle_id ON construction_elements(speckle_id) WHERE speckle_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_properties_gin ON construction_elements USING GIN(properties);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_access_control_gin ON construction_elements USING GIN(access_control);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_material_gin ON construction_elements USING GIN(material_properties);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_performance_gin ON construction_elements USING GIN(performance_data);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_elements_status ON construction_elements(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_element_relationships_parent ON element_relationships(parent_element_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_element_relationships_child ON element_relationships(child_element_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_element_relationships_type ON element_relationships(relationship_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_element_documents_element ON element_documents(element_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_element_documents_type ON element_documents(document_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_kpis_project ON project_kpis(project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_kpis_type ON project_kpis(kpi_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_kpis_date ON project_kpis(measurement_date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_milestones_due_date ON project_milestones(due_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_milestones_blockchain ON project_milestones(smart_contract_address) WHERE smart_contract_address IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user ON audit_log(changed_by);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_timestamp ON audit_log(changed_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_integrations_project ON api_integrations(project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_integrations_type ON api_integrations(integration_type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_integrations_active ON api_integrations(is_active) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_agent_tasks_project ON ai_agent_tasks(project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_agent_tasks_status ON ai_agent_tasks(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_agent_tasks_scheduled ON ai_agent_tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = true;

-- Create advanced functions for element-level access control
CREATE OR REPLACE FUNCTION check_element_access(
    user_roles TEXT[], 
    element_id UUID, 
    operation VARCHAR(10),
    field_path TEXT[] DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    element_access JSONB;
    required_roles TEXT[];
    field_config JSONB;
    operation_key TEXT;
BEGIN
    -- Get element access control configuration
    SELECT access_control INTO element_access 
    FROM construction_elements 
    WHERE id = element_id;
    
    IF element_access IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check field-level permissions if specified
    IF field_path IS NOT NULL THEN
        field_config := element_access;
        FOR i IN 1..array_length(field_path, 1) LOOP
            field_config := field_config -> field_path[i];
        END LOOP;
        
        IF field_config IS NOT NULL THEN
            operation_key := operation || '_roles';
            IF field_config ? operation_key THEN
                required_roles := ARRAY(SELECT jsonb_array_elements_text(field_config -> operation_key));
                RETURN user_roles && required_roles;
            END IF;
        END IF;
    END IF;
    
    -- Check element-level permissions
    operation_key := operation || '_roles';
    IF element_access ? operation_key THEN
        required_roles := ARRAY(SELECT jsonb_array_elements_text(element_access -> operation_key));
        RETURN user_roles && required_roles;
    END IF;
    
    -- Default to deny if no specific permissions found
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for audit logging
CREATE OR REPLACE FUNCTION log_data_changes() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, record_id, operation, old_values, changed_at)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), NOW());
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, record_id, operation, old_values, new_values, changed_at)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), NOW());
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, record_id, operation, new_values, changed_at)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW), NOW());
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for audit logging on key tables
CREATE TRIGGER audit_projects_trigger
    AFTER INSERT OR UPDATE OR DELETE ON projects
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER audit_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER audit_construction_elements_trigger
    AFTER INSERT OR UPDATE OR DELETE ON construction_elements
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

CREATE TRIGGER audit_project_kpis_trigger
    AFTER INSERT OR UPDATE OR DELETE ON project_kpis
    FOR EACH ROW EXECUTE FUNCTION log_data_changes();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updating timestamps
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_construction_elements_updated_at BEFORE UPDATE ON construction_elements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security on sensitive tables
ALTER TABLE construction_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE element_documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for construction elements
CREATE POLICY construction_elements_select_policy ON construction_elements
    FOR SELECT
    USING (
        check_element_access(
            ARRAY(SELECT role FROM project_roles WHERE user_id = current_setting('app.current_user_id')::UUID AND project_id = construction_elements.project_id),
            id,
            'read'
        )
    );

CREATE POLICY construction_elements_insert_policy ON construction_elements
    FOR INSERT
    WITH CHECK (
        check_element_access(
            ARRAY(SELECT role FROM project_roles WHERE user_id = current_setting('app.current_user_id')::UUID AND project_id = construction_elements.project_id),
            id,
            'write'
        )
    );

CREATE POLICY construction_elements_update_policy ON construction_elements
    FOR UPDATE
    USING (
        check_element_access(
            ARRAY(SELECT role FROM project_roles WHERE user_id = current_setting('app.current_user_id')::UUID AND project_id = construction_elements.project_id),
            id,
            'write'
        )
    );

CREATE POLICY construction_elements_delete_policy ON construction_elements
    FOR DELETE
    USING (
        check_element_access(
            ARRAY(SELECT role FROM project_roles WHERE user_id = current_setting('app.current_user_id')::UUID AND project_id = construction_elements.project_id),
            id,
            'admin'
        )
    );
