/*
 * =============================================================================
 * PHASE 3 DATABASE SCHEMA - DAO GOVERNANCE & MANUFACTURER INTEGRATION
 * =============================================================================
 * 
 * PURPOSE:
 * Extended database schema to support DAO-governed data sharing templates
 * and manufacturer API integration with template-based access control.
 * 
 * CAPABILITIES:
 * - DAO template proposal and voting tables
 * - Manufacturer API integration tracking
 * - Enhanced audit logging with governance context
 * - Collaborative webhook configuration
 * =============================================================================
 */

-- DAO Template Governance Tables
-- =============================================

-- Data sharing template proposals
CREATE TABLE IF NOT EXISTS dao_template_proposals (
    proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id VARCHAR(255) NOT NULL,
    template_data JSONB NOT NULL,
    proposer_id UUID NOT NULL REFERENCES users(id),
    proposer_role stakeholder_role NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'voting', 'approved', 'rejected', 'expired')),
    validation_result JSONB,
    
    -- Voting configuration
    voting_starts TIMESTAMP,
    voting_ends TIMESTAMP,
    minimum_quorum INTEGER DEFAULT 50,
    passing_threshold DECIMAL(3,2) DEFAULT 0.67,
    
    -- Vote tallies
    votes_for INTEGER DEFAULT 0,
    votes_against INTEGER DEFAULT 0,
    abstentions INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    finalized_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_dao_proposals_status (status),
    INDEX idx_dao_proposals_template (template_id),
    INDEX idx_dao_proposals_voting_period (voting_starts, voting_ends)
);

-- Individual votes on template proposals
CREATE TABLE IF NOT EXISTS dao_template_votes (
    vote_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES dao_template_proposals(proposal_id),
    voter_id UUID NOT NULL REFERENCES users(id),
    voter_role stakeholder_role NOT NULL,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('for', 'against', 'abstain')),
    voting_power INTEGER NOT NULL DEFAULT 1,
    comment TEXT,
    voted_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure one vote per user per proposal
    UNIQUE(proposal_id, voter_id),
    
    -- Indexes
    INDEX idx_dao_votes_proposal (proposal_id),
    INDEX idx_dao_votes_voter (voter_id)
);

-- Active templates per project
CREATE TABLE IF NOT EXISTS dao_active_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    proposal_id UUID NOT NULL REFERENCES dao_template_proposals(proposal_id),
    template_data JSONB NOT NULL,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
    activated_at TIMESTAMP DEFAULT NOW(),
    superseded_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_active_templates_project (project_id),
    INDEX idx_active_templates_status (status)
);

-- User DAO permissions and stakes
CREATE TABLE IF NOT EXISTS user_dao_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    role stakeholder_role NOT NULL,
    can_propose_templates BOOLEAN DEFAULT false,
    can_vote BOOLEAN DEFAULT true,
    can_veto BOOLEAN DEFAULT false,
    granted_at TIMESTAMP DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    
    UNIQUE(user_id, role),
    INDEX idx_dao_permissions_user (user_id)
);

-- User stakes for voting weight calculation
CREATE TABLE IF NOT EXISTS user_dao_stakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    stake_type VARCHAR(50) NOT NULL, -- 'platform_usage', 'project_investment', 'reputation'
    stake_value DECIMAL(15,2) NOT NULL,
    stake_weight DECIMAL(5,2) DEFAULT 1.0,
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_dao_stakes_user (user_id),
    INDEX idx_dao_stakes_type (stake_type)
);

-- Emergency access records
CREATE TABLE IF NOT EXISTS dao_emergency_access (
    emergency_access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    requester_id UUID NOT NULL REFERENCES users(id),
    requester_role stakeholder_role NOT NULL,
    justification TEXT NOT NULL,
    activated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    revoked_by UUID REFERENCES users(id),
    revoked_at TIMESTAMP,
    
    INDEX idx_emergency_access_project (project_id),
    INDEX idx_emergency_access_status (status, expires_at)
);

-- Manufacturer API Integration Tables
-- =============================================

-- Manufacturer API configurations
CREATE TABLE IF NOT EXISTS manufacturer_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    manufacturer_config JSONB NOT NULL, -- Full API configuration
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'error')),
    
    -- Sync tracking
    last_sync TIMESTAMP,
    sync_frequency INTEGER DEFAULT 60, -- minutes
    product_count INTEGER DEFAULT 0,
    error_messages TEXT[],
    
    -- API health metrics
    api_response_time INTEGER, -- milliseconds
    api_success_rate DECIMAL(5,2) DEFAULT 100.0,
    last_health_check TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_manufacturer_status (status),
    INDEX idx_manufacturer_sync (last_sync)
);

-- Manufacturer product cache
CREATE TABLE IF NOT EXISTS manufacturer_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(255) NOT NULL,
    manufacturer_id VARCHAR(255) NOT NULL REFERENCES manufacturer_integrations(manufacturer_id),
    category VARCHAR(100) NOT NULL,
    product_data JSONB NOT NULL, -- Full product information
    
    -- Data tier flags for quick filtering
    has_public_data BOOLEAN DEFAULT true,
    has_technical_data BOOLEAN DEFAULT false,
    has_commercial_data BOOLEAN DEFAULT false,
    has_restricted_data BOOLEAN DEFAULT false,
    
    -- Cache management
    last_updated TIMESTAMP DEFAULT NOW(),
    cache_ttl INTEGER DEFAULT 3600, -- seconds
    
    UNIQUE(manufacturer_id, product_id),
    INDEX idx_manufacturer_products_category (category),
    INDEX idx_manufacturer_products_updated (last_updated)
);

-- Product access logging for audit
CREATE TABLE IF NOT EXISTS manufacturer_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    user_role stakeholder_role NOT NULL,
    project_id UUID REFERENCES projects(id),
    
    -- Access details
    search_query JSONB,
    product_ids TEXT[],
    result_count INTEGER,
    data_tiers_accessed TEXT[], -- Which data tiers were included
    
    -- Template governance
    template_id VARCHAR(255),
    access_granted_by_template BOOLEAN DEFAULT true,
    
    accessed_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_manufacturer_access_user (user_id),
    INDEX idx_manufacturer_access_project (project_id),
    INDEX idx_manufacturer_access_time (accessed_at)
);

-- API performance metrics
CREATE TABLE IF NOT EXISTS manufacturer_api_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_id VARCHAR(255) NOT NULL REFERENCES manufacturer_integrations(manufacturer_id),
    response_time INTEGER NOT NULL, -- milliseconds
    success BOOLEAN NOT NULL,
    error_message TEXT,
    recorded_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_api_metrics_manufacturer (manufacturer_id),
    INDEX idx_api_metrics_time (recorded_at)
);

-- Enhanced Speckle Integration Tables
-- =============================================

-- Speckle webhook configuration with role filtering
CREATE TABLE IF NOT EXISTS speckle_webhook_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    construction_project_id UUID NOT NULL REFERENCES projects(id),
    stream_id VARCHAR(255) NOT NULL,
    allowed_roles stakeholder_role[] NOT NULL,
    webhook_url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(stream_id),
    INDEX idx_webhook_config_project (construction_project_id)
);

-- Enhanced sync logging with governance context
ALTER TABLE speckle_sync_log 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS user_role stakeholder_role,
ADD COLUMN IF NOT EXISTS governance_template_applied BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS objects_filtered INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS template_id VARCHAR(255);

-- Speckle object tracking with access control
CREATE TABLE IF NOT EXISTS speckle_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    speckle_object_id VARCHAR(255) NOT NULL,
    speckle_stream_id VARCHAR(255) NOT NULL,
    speckle_commit_id VARCHAR(255) NOT NULL,
    element_id UUID REFERENCES construction_elements(id),
    
    -- Access control
    visibility_rules JSONB, -- Role-based visibility rules
    data_categories TEXT[], -- Which data categories this object contains
    
    -- Sync tracking
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(speckle_object_id, speckle_commit_id),
    INDEX idx_speckle_objects_stream (speckle_stream_id),
    INDEX idx_speckle_objects_element (element_id)
);

-- User notifications for collaborative updates
CREATE TABLE IF NOT EXISTS user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL, -- 'speckle_update', 'template_vote', 'emergency_access'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Additional notification data
    
    -- Status tracking
    read_at TIMESTAMP,
    dismissed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_notifications_user (user_id),
    INDEX idx_notifications_type (type),
    INDEX idx_notifications_unread (user_id, read_at) WHERE read_at IS NULL
);

-- Functions and Triggers
-- =============================================

-- Function to automatically update template vote tallies
CREATE OR REPLACE FUNCTION update_vote_tally()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE dao_template_proposals 
    SET 
        votes_for = (
            SELECT COALESCE(SUM(voting_power), 0) 
            FROM dao_template_votes 
            WHERE proposal_id = NEW.proposal_id AND decision = 'for'
        ),
        votes_against = (
            SELECT COALESCE(SUM(voting_power), 0) 
            FROM dao_template_votes 
            WHERE proposal_id = NEW.proposal_id AND decision = 'against'
        ),
        abstentions = (
            SELECT COALESCE(SUM(voting_power), 0) 
            FROM dao_template_votes 
            WHERE proposal_id = NEW.proposal_id AND decision = 'abstain'
        )
    WHERE proposal_id = NEW.proposal_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update vote tallies automatically
DROP TRIGGER IF EXISTS trigger_update_vote_tally ON dao_template_votes;
CREATE TRIGGER trigger_update_vote_tally
    AFTER INSERT OR UPDATE OR DELETE ON dao_template_votes
    FOR EACH ROW EXECUTE FUNCTION update_vote_tally();

-- Function to check template-governed access
CREATE OR REPLACE FUNCTION check_template_access(
    project_id UUID,
    user_id UUID,
    user_role stakeholder_role,
    data_category TEXT,
    operation TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    template_data JSONB;
    role_access JSONB;
BEGIN
    -- Get active template for project
    SELECT dat.template_data INTO template_data
    FROM dao_active_templates dat
    WHERE dat.project_id = $1 AND dat.status = 'active'
    ORDER BY dat.activated_at DESC
    LIMIT 1;
    
    -- If no template, deny access
    IF template_data IS NULL THEN
        RETURN false;
    END IF;
    
    -- Get role access rules
    role_access := template_data->'stakeholderAccess'->user_role::text;
    
    -- Check if role has access to data category and operation
    IF role_access IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check data category access
    IF NOT (role_access->'dataCategories' ? data_category) THEN
        RETURN false;
    END IF;
    
    -- Check operation permission
    IF NOT (role_access->'operations' ? operation) THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to sync Speckle objects to construction elements with governance
CREATE OR REPLACE FUNCTION sync_speckle_to_construction_element(
    speckle_object_id TEXT,
    commit_id TEXT,
    project_id UUID,
    object_data JSONB
) RETURNS UUID AS $$
DECLARE
    element_id UUID;
    object_properties JSONB;
BEGIN
    -- Extract and filter properties based on governance
    object_properties := object_data->'properties';
    
    -- Insert or update construction element
    INSERT INTO construction_elements (
        project_id,
        ifc_id,
        element_type,
        properties,
        geometric_data,
        created_at,
        updated_at
    ) VALUES (
        project_id,
        speckle_object_id,
        object_data->>'speckle_type',
        object_properties,
        object_data->'geometry',
        NOW(),
        NOW()
    )
    ON CONFLICT (project_id, ifc_id) 
    DO UPDATE SET
        properties = EXCLUDED.properties,
        geometric_data = EXCLUDED.geometric_data,
        updated_at = NOW()
    RETURNING id INTO element_id;
    
    -- Track Speckle object mapping
    INSERT INTO speckle_objects (
        speckle_object_id,
        speckle_commit_id,
        element_id,
        data_categories,
        created_at
    ) VALUES (
        speckle_object_id,
        commit_id,
        element_id,
        ARRAY['geometric', 'specifications'], -- Default categories
        NOW()
    )
    ON CONFLICT (speckle_object_id, speckle_commit_id)
    DO UPDATE SET
        last_updated = NOW();
    
    RETURN element_id;
END;
$$ LANGUAGE plpgsql;

-- Sample Data for Testing
-- =============================================

-- Insert sample DAO permissions for existing users
INSERT INTO user_dao_permissions (user_id, role, can_propose_templates, can_vote, can_veto)
SELECT 
    id,
    role,
    CASE WHEN role IN ('owner', 'architect') THEN true ELSE false END,
    true,
    CASE WHEN role = 'owner' THEN true ELSE false END
FROM users
ON CONFLICT (user_id, role) DO NOTHING;

-- Insert sample voting stakes
INSERT INTO user_dao_stakes (user_id, stake_type, stake_value, stake_weight)
SELECT 
    id,
    'platform_usage',
    CASE role
        WHEN 'owner' THEN 100.0
        WHEN 'architect' THEN 75.0
        WHEN 'engineer' THEN 75.0
        WHEN 'contractor' THEN 50.0
        ELSE 25.0
    END,
    CASE role
        WHEN 'owner' THEN 3.0
        WHEN 'architect' THEN 2.0
        WHEN 'engineer' THEN 2.0
        WHEN 'contractor' THEN 2.0
        ELSE 1.0
    END
FROM users
ON CONFLICT DO NOTHING;

-- Insert sample manufacturer integrations
INSERT INTO manufacturer_integrations (manufacturer_id, name, manufacturer_config, status)
VALUES 
    ('kingspan', 'Kingspan Insulation', '{"baseUrl": "https://api.kingspan.com", "authType": "apikey", "credentials": {"apiKey": "demo_key"}}', 'active'),
    ('guardian_glass', 'Guardian Glass', '{"baseUrl": "https://api.guardian.com", "authType": "oauth2", "credentials": {"clientId": "demo_client"}}', 'active'),
    ('cemex', 'CEMEX', '{"baseUrl": "https://api.cemex.com", "authType": "basic", "credentials": {"username": "demo", "password": "demo"}}', 'active')
ON CONFLICT (manufacturer_id) DO NOTHING;

-- Add notification preferences to existing users
UPDATE users 
SET notification_preferences = COALESCE(notification_preferences, '{}'::jsonb) || 
    '{"speckle_updates": true, "template_votes": true, "emergency_access": true}'::jsonb
WHERE notification_preferences IS NULL OR NOT notification_preferences ? 'speckle_updates';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_construction_elements_project_type ON construction_elements(project_id, element_type);
CREATE INDEX IF NOT EXISTS idx_speckle_sync_log_governance ON speckle_sync_log(governance_template_applied, user_role);
CREATE INDEX IF NOT EXISTS idx_manufacturer_products_search ON manufacturer_products USING GIN (product_data);

COMMENT ON TABLE dao_template_proposals IS 'Stores data sharing template proposals for DAO governance';
COMMENT ON TABLE manufacturer_integrations IS 'Manages manufacturer API integrations and health status';
COMMENT ON TABLE speckle_webhook_config IS 'Configures role-based webhook filtering for collaborative BIM updates';
COMMENT ON FUNCTION check_template_access IS 'Validates access permissions based on active DAO template rules';
