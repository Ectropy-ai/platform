-- Migration 001b: Complete production schema for BIM collaboration and DAO governance
-- Creates all necessary tables for projects, elements, proposals, and user management

-- Create users table with role-based access control
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    role stakeholder_role NOT NULL DEFAULT 'contractor',
    active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create projects table for construction projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    budget DECIMAL(15,2),
    status project_status NOT NULL DEFAULT 'planning',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project stakeholders junction table
CREATE TABLE IF NOT EXISTS project_stakeholders (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role stakeholder_role NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Create project elements table for BIM elements
CREATE TABLE IF NOT EXISTS project_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    element_type VARCHAR(50) NOT NULL, -- IFC element types (IFCWALL, IFCBEAM, etc.)
    name VARCHAR(200) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}', -- Material properties, dimensions, etc.
    geometry JSONB NOT NULL DEFAULT '{}', -- Position, rotation, scale, dimensions
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in-review', 'approved', 'rejected')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create proposals table for DAO governance
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('budget_allocation', 'material_access', 'governance', 'technical', 'schedule')),
    status VARCHAR(20) NOT NULL DEFAULT 'voting' CHECK (status IN ('draft', 'voting', 'passed', 'rejected', 'expired')),
    proposer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    votes_for INTEGER DEFAULT 0,
    votes_against INTEGER DEFAULT 0,
    votes_abstain INTEGER DEFAULT 0,
    voting_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    voting_end TIMESTAMP WITH TIME ZONE NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create proposal votes table for voting records
CREATE TABLE IF NOT EXISTS proposal_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('for', 'against', 'abstain')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(proposal_id, user_id)
);

-- Create user sessions table for authentication
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create audit log table for tracking changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'project', 'element', 'proposal', 'user'
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'create', 'update', 'delete', 'vote'
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_stakeholders_project ON project_stakeholders(project_id);
CREATE INDEX IF NOT EXISTS idx_project_stakeholders_user ON project_stakeholders(user_id);

CREATE INDEX IF NOT EXISTS idx_project_elements_project ON project_elements(project_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_project_elements_type ON project_elements(element_type) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_project_elements_status ON project_elements(status) WHERE active = true;

-- JSONB indexes for efficient property queries
CREATE INDEX IF NOT EXISTS idx_project_elements_properties_gin ON project_elements USING gin(properties);
CREATE INDEX IF NOT EXISTS idx_project_elements_geometry_gin ON project_elements USING gin(geometry);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_proposals_type ON proposals(type) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_proposals_voting_period ON proposals(voting_start, voting_end);
CREATE INDEX IF NOT EXISTS idx_proposals_proposer ON proposals(proposer_id);

CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal ON proposal_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_user ON proposal_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables that need updated_at maintenance
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_elements_updated_at BEFORE UPDATE ON project_elements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON proposals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposal_votes_updated_at BEFORE UPDATE ON proposal_votes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments for maintenance
COMMENT ON TABLE users IS 'Application users with role-based access control for construction stakeholders';
COMMENT ON TABLE projects IS 'Construction projects with BIM integration and stakeholder management';
COMMENT ON TABLE project_elements IS 'IFC-compliant building elements with JSONB properties for BIM data';
COMMENT ON TABLE proposals IS 'DAO governance proposals with voting mechanism for project decisions';
COMMENT ON TABLE proposal_votes IS 'Individual votes cast on governance proposals';
COMMENT ON TABLE user_sessions IS 'User authentication sessions with JWT token management';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all system changes';

COMMENT ON COLUMN project_elements.properties IS 'Material and technical properties stored as JSONB (e.g., material, dimensions, load capacity)';
COMMENT ON COLUMN project_elements.geometry IS 'Spatial positioning and dimensions stored as JSONB (position, rotation, scale)';
COMMENT ON COLUMN proposals.type IS 'Proposal category determining required approvals and voting thresholds';
COMMENT ON COLUMN audit_logs.entity_type IS 'Type of entity being tracked (project, element, proposal, user)';
COMMENT ON COLUMN audit_logs.action IS 'Action performed (create, update, delete, vote, login, etc.)';