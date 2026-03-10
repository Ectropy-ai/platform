-- Shared Trials Database Foundation Migration with RLS
-- Database: ectropy_shared_trials
-- Purpose: Multi-tenant trial database with row-level security for data isolation
-- Date: 2026-02-11
-- Phase: 2 - Shared Trials Database with RLS
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE tenant_status AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED');
CREATE TYPE subscription_tier AS ENUM ('FREE', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'GUEST');
CREATE TYPE project_status AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- ============================================================================
-- TENANT TABLE (No RLS - this is the tenant)
-- ============================================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status tenant_status NOT NULL DEFAULT 'TRIAL',
  subscription_tier subscription_tier NOT NULL DEFAULT 'FREE',

  -- Contact
  primary_email VARCHAR(255),
  billing_email VARCHAR(255),
  phone VARCHAR(50),

  -- Limits
  max_projects INTEGER NOT NULL DEFAULT 1,
  max_users INTEGER NOT NULL DEFAULT 5,
  max_storage_gb INTEGER NOT NULL DEFAULT 1,

  -- Billing
  stripe_customer_id VARCHAR(100),

  -- Trial management
  trial_ends_at TIMESTAMPTZ(6),
  expired_at TIMESTAMPTZ(6),

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

COMMENT ON TABLE tenants IS 'Trial tenant organizations in shared database';

-- ============================================================================
-- USERS TABLE (Trial users with RLS)
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),

  -- OAuth identity (references platform.users)
  platform_user_id UUID NOT NULL,

  -- Tenant-specific role
  role user_role NOT NULL DEFAULT 'MEMBER',

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW(),

  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_platform_user_id ON users(platform_user_id);

COMMENT ON TABLE users IS 'Trial users with tenant-level isolation';
COMMENT ON COLUMN users.tenant_id IS 'FK to tenants(id) - enables RLS isolation';
COMMENT ON COLUMN users.platform_user_id IS 'FK to platform.users(id) - OAuth identity';

-- ============================================================================
-- PROJECTS TABLE (Trial projects with RLS)
-- ============================================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  status project_status NOT NULL DEFAULT 'DRAFT',

  -- Model catalog reference
  catalog_building_type VARCHAR(100),

  -- Speckle integration
  speckle_stream_id VARCHAR(255),
  speckle_commit_id VARCHAR(255),

  -- Project details
  description TEXT,
  location VARCHAR(500),
  estimated_budget DECIMAL(15, 2),
  target_completion TIMESTAMPTZ(6),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_catalog_building_type ON projects(catalog_building_type);

COMMENT ON TABLE projects IS 'Trial projects with tenant isolation';

-- ============================================================================
-- USER PORTFOLIOS TABLE (Persistent "My Projects" with RLS)
-- ============================================================================

CREATE TABLE user_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- Portfolio metadata
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  added_at TIMESTAMPTZ(6) DEFAULT NOW(),

  UNIQUE(user_id, project_id)
);

CREATE INDEX idx_user_portfolios_tenant_id ON user_portfolios(tenant_id);
CREATE INDEX idx_user_portfolios_user_id ON user_portfolios(user_id);
CREATE INDEX idx_user_portfolios_project_id ON user_portfolios(project_id);

COMMENT ON TABLE user_portfolios IS 'User project portfolios that persist between logins';

-- ============================================================================
-- PROJECT ROLES TABLE (Project permissions with RLS)
-- ============================================================================

CREATE TABLE project_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role user_role NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),

  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_roles_tenant_id ON project_roles(tenant_id);
CREATE INDEX idx_project_roles_project_id ON project_roles(project_id);
CREATE INDEX idx_project_roles_user_id ON project_roles(user_id);

COMMENT ON TABLE project_roles IS 'User permissions on specific projects';

-- ============================================================================
-- SPECKLE STREAMS TABLE (BIM integration with RLS)
-- ============================================================================

CREATE TABLE speckle_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- Speckle server details
  stream_id VARCHAR(255) NOT NULL,
  stream_name VARCHAR(255) NOT NULL,
  commit_id VARCHAR(255),
  branch_name VARCHAR(100) NOT NULL DEFAULT 'main',
  server_url VARCHAR(500) NOT NULL,

  -- Metadata
  object_count INTEGER,
  last_sync TIMESTAMPTZ(6),

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),

  UNIQUE(project_id, stream_id)
);

CREATE INDEX idx_speckle_streams_tenant_id ON speckle_streams(tenant_id);
CREATE INDEX idx_speckle_streams_project_id ON speckle_streams(project_id);

COMMENT ON TABLE speckle_streams IS 'Speckle BIM streams for projects';

-- ============================================================================
-- CONSTRUCTION ELEMENTS TABLE (BIM elements with RLS)
-- ============================================================================

CREATE TABLE construction_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- Element identification
  element_id VARCHAR(255) NOT NULL,
  element_type VARCHAR(100) NOT NULL,
  name VARCHAR(255),

  -- Properties
  properties JSONB,
  geometry JSONB,

  -- Cost data
  unit_cost DECIMAL(12, 2),
  quantity DECIMAL(12, 4),
  total_cost DECIMAL(15, 2),

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),

  UNIQUE(project_id, element_id)
);

CREATE INDEX idx_construction_elements_tenant_id ON construction_elements(tenant_id);
CREATE INDEX idx_construction_elements_project_id ON construction_elements(project_id);
CREATE INDEX idx_construction_elements_element_type ON construction_elements(element_type);

COMMENT ON TABLE construction_elements IS 'BIM elements extracted from Speckle';

-- ============================================================================
-- BUDGET ITEMS TABLE (Cost tracking with RLS)
-- ============================================================================

CREATE TABLE budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- Item details
  category VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  estimated_cost DECIMAL(15, 2) NOT NULL,
  actual_cost DECIMAL(15, 2),

  -- Tracking
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ(6),

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_budget_items_tenant_id ON budget_items(tenant_id);
CREATE INDEX idx_budget_items_project_id ON budget_items(project_id);
CREATE INDEX idx_budget_items_category ON budget_items(category);

COMMENT ON TABLE budget_items IS 'Project budget and cost tracking';

-- ============================================================================
-- RFIS TABLE (Requests for Information with RLS)
-- ============================================================================

CREATE TABLE rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- RFI details
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL,

  -- Assignment
  assigned_to UUID,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',

  -- Tracking
  due_date TIMESTAMPTZ(6),
  resolved_at TIMESTAMPTZ(6),

  -- Timestamps
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_rfis_tenant_id ON rfis(tenant_id);
CREATE INDEX idx_rfis_project_id ON rfis(project_id);
CREATE INDEX idx_rfis_status ON rfis(status);

COMMENT ON TABLE rfis IS 'Requests for Information for project collaboration';

-- ============================================================================
-- AUDIT LOGS TABLE (Compliance tracking with RLS)
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,

  -- Event details
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',

  -- Request context
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

COMMENT ON TABLE audit_logs IS 'Security and compliance audit trail';

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE speckle_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - Tenant Isolation
-- ============================================================================
-- Pattern: All queries must SET app.current_tenant_id before accessing data
-- USING clause: Controls which rows are visible in SELECT
-- WITH CHECK clause: Controls which rows can be inserted/updated
-- ============================================================================

-- Users table policies
CREATE POLICY tenant_isolation ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Projects table policies
CREATE POLICY tenant_isolation ON projects
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- User portfolios table policies
CREATE POLICY tenant_isolation ON user_portfolios
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Project roles table policies
CREATE POLICY tenant_isolation ON project_roles
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Speckle streams table policies
CREATE POLICY tenant_isolation ON speckle_streams
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Construction elements table policies
CREATE POLICY tenant_isolation ON construction_elements
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Budget items table policies
CREATE POLICY tenant_isolation ON budget_items
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- RFIs table policies
CREATE POLICY tenant_isolation ON rfis
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Audit logs table policies
CREATE POLICY tenant_isolation ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to set current tenant context
CREATE OR REPLACE FUNCTION set_current_tenant(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_uuid::text, false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_current_tenant IS 'Set tenant context for RLS: SELECT set_current_tenant(''tenant-uuid-here'')';

-- Function to get current tenant context
CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true)::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_current_tenant IS 'Get current tenant context: SELECT get_current_tenant()';

-- Function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budget_items_updated_at BEFORE UPDATE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rfis_updated_at BEFORE UPDATE ON rfis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VALIDATION QUERIES
-- ============================================================================

-- Check RLS is enabled on all tenant-scoped tables
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'projects', 'user_portfolios', 'project_roles',
                    'speckle_streams', 'construction_elements', 'budget_items',
                    'rfis', 'audit_logs')
ORDER BY tablename;

-- Expected: All tables should have rls_enabled = true

-- Check RLS policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  cmd as policy_type
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Expected: tenant_isolation policy on all RLS-enabled tables

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Migration Version: 001
-- Tables Created: 10 (tenants, users, projects, user_portfolios, project_roles, speckle_streams, construction_elements, budget_items, rfis, audit_logs)
-- Enums Created: 4 (tenant_status, subscription_tier, user_role, project_status)
-- Indexes Created: 28 (including tenant_id indexes on all tenant-scoped tables)
-- RLS Enabled: 9 tables (all except tenants)
-- RLS Policies: 9 (tenant_isolation on all RLS-enabled tables)
-- Functions: 3 (set_current_tenant, get_current_tenant, update_updated_at_column)
-- Triggers: 5 (auto-update timestamps)
