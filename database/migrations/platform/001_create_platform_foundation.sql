-- Platform Database Foundation Migration
-- Database: ectropy_platform
-- Purpose: Create model_catalog, tenant_registry, database_connections, users, billing_subscriptions, audit_logs
-- Date: 2026-02-10
-- Phase: 1 - Platform Database Foundation

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE tenant_tier AS ENUM ('trial', 'paid_shared', 'enterprise');
CREATE TYPE database_type AS ENUM ('shared_trials', 'shared_paid', 'dedicated');
CREATE TYPE tenant_status AS ENUM ('active', 'expired', 'suspended', 'migrating', 'archived');
CREATE TYPE connection_type AS ENUM ('shared', 'dedicated');

-- ============================================================================
-- MODEL CATALOG - Global shared library
-- ============================================================================

CREATE TABLE model_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_type VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  ifc_file_path VARCHAR(500) NOT NULL,
  speckle_stream_id VARCHAR(255),
  speckle_object_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  element_count INTEGER,
  estimated_budget_usd DECIMAL(12,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_model_catalog_building_type ON model_catalog(building_type);
CREATE INDEX idx_model_catalog_is_active ON model_catalog(is_active);

COMMENT ON TABLE model_catalog IS 'Global library of reusable demo models - accessible to all tenants via copy-on-write';
COMMENT ON COLUMN model_catalog.building_type IS 'Unique identifier for building type (residential-single-family, commercial-office, etc.)';
COMMENT ON COLUMN model_catalog.speckle_stream_id IS 'Master Speckle stream ID in shared Speckle account';

-- ============================================================================
-- DATABASE CONNECTIONS - Connection pool metadata
-- ============================================================================

CREATE TABLE database_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_name VARCHAR(100) NOT NULL UNIQUE,
  connection_type connection_type NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INTEGER NOT NULL DEFAULT 25060,
  username VARCHAR(100) NOT NULL,
  password_secret_name VARCHAR(255) NOT NULL,
  ssl_mode VARCHAR(50) NOT NULL DEFAULT 'require',
  pool_size INTEGER NOT NULL DEFAULT 10,
  max_connections INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_database_connections_name ON database_connections(database_name);
CREATE INDEX idx_database_connections_active ON database_connections(is_active);

COMMENT ON TABLE database_connections IS 'Dynamic connection pool metadata for runtime database resolution';
COMMENT ON COLUMN database_connections.password_secret_name IS 'Secret manager key (GitHub Secrets, Vault) - NOT plaintext password';

-- ============================================================================
-- TENANT REGISTRY - Single source of truth for all tenants
-- ============================================================================

CREATE TABLE tenant_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  tier tenant_tier NOT NULL,
  database_type database_type NOT NULL,
  database_name VARCHAR(100) NOT NULL,
  database_connection_id UUID REFERENCES database_connections(id),
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  trial_expires_at TIMESTAMPTZ(6),
  subscription_tier VARCHAR(50),
  max_projects INTEGER DEFAULT 3,
  max_users INTEGER DEFAULT 5,
  max_storage_gb INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_tenant_registry_slug ON tenant_registry(slug);
CREATE INDEX idx_tenant_registry_tier ON tenant_registry(tier);
CREATE INDEX idx_tenant_registry_status ON tenant_registry(status);
CREATE INDEX idx_tenant_registry_database_name ON tenant_registry(database_name);

COMMENT ON TABLE tenant_registry IS 'Global registry of all tenants across all databases';
COMMENT ON COLUMN tenant_registry.database_name IS 'Actual database name (ectropy_shared_trials, ectropy_acme_construction, etc.)';
COMMENT ON COLUMN tenant_registry.trial_expires_at IS 'Trial expiration timestamp (NULL for paid/enterprise)';

-- ============================================================================
-- USERS - OAuth identity (cross-tenant)
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  provider VARCHAR(50) DEFAULT 'google',
  provider_id VARCHAR(255),
  tenant_id UUID,
  default_tenant_id UUID,
  is_authorized BOOLEAN DEFAULT false,
  is_platform_admin BOOLEAN DEFAULT false,
  authorized_at TIMESTAMPTZ(6),
  last_login_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_is_authorized ON users(is_authorized);
CREATE INDEX idx_users_is_platform_admin ON users(is_platform_admin);

COMMENT ON TABLE users IS 'OAuth user identity - cross-tenant authentication';
COMMENT ON COLUMN users.is_authorized IS 'CRM-provisioned authorization flag';
COMMENT ON COLUMN users.is_platform_admin IS 'Auto-set to true for @luh.tech domain users';
COMMENT ON COLUMN users.tenant_id IS 'Current/primary tenant assignment';

-- ============================================================================
-- BILLING SUBSCRIPTIONS - Stripe integration
-- ============================================================================

CREATE TABLE billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) NOT NULL,
  plan VARCHAR(50) NOT NULL,
  interval VARCHAR(20) NOT NULL,
  current_period_start TIMESTAMPTZ(6) NOT NULL,
  current_period_end TIMESTAMPTZ(6) NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_billing_subscriptions_tenant_id ON billing_subscriptions(tenant_id);
CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status);

COMMENT ON TABLE billing_subscriptions IS 'Stripe subscription tracking per tenant';

-- ============================================================================
-- AUDIT LOGS - Platform-level events
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  tenant_id UUID,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

COMMENT ON TABLE audit_logs IS 'Platform-level audit trail for security and compliance';

-- ============================================================================
-- SEED DATA - Initial model catalog entries
-- ============================================================================

INSERT INTO model_catalog (building_type, display_name, description, ifc_file_path, metadata, estimated_budget_usd) VALUES
  (
    'residential-single-family',
    'Single Family Home',
    '2-story residential house with modern architecture',
    'test-data/AC20-FZK-Haus.ifc',
    '{"floors": 2, "bedrooms": 4, "bathrooms": 3, "square_feet": 2500}',
    850000.00
  ),
  (
    'residential-multi-family',
    'Multi-Family Housing',
    'Duplex or apartment building for multi-family living',
    'test-data/DupleXXX.ifc',
    '{"units": 4, "floors": 2, "parking_spaces": 8}',
    1800000.00
  ),
  (
    'commercial-office',
    'Office Building',
    'Multi-floor commercial office space',
    'test-data/AC20-Institute-Var-2.ifc',
    '{"floors": 3, "total_office_space_sqft": 15000, "parking_spaces": 50}',
    2500000.00
  ),
  (
    'commercial-large',
    'Large Commercial Facility',
    'Specialized large-scale facility (clinic, hospital, industrial)',
    'test-data/Clinic_Dental_IFC.ifc',
    '{"type": "healthcare", "exam_rooms": 12, "waiting_areas": 3}',
    8000000.00
  );

-- ============================================================================
-- FUNCTIONS - Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_model_catalog_updated_at BEFORE UPDATE ON model_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_subscriptions_updated_at BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VALIDATION QUERIES
-- ============================================================================

-- Verify model catalog seeded correctly
-- Expected: 4 rows
SELECT COUNT(*) as model_count FROM model_catalog;

-- List all building types
SELECT building_type, display_name, estimated_budget_usd
FROM model_catalog
ORDER BY estimated_budget_usd;

-- Verify all indexes created
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('model_catalog', 'tenant_registry', 'database_connections', 'users', 'billing_subscriptions', 'audit_logs')
ORDER BY tablename, indexname;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Migration Version: 001
-- Tables Created: 6 (model_catalog, database_connections, tenant_registry, users, billing_subscriptions, audit_logs)
-- Enums Created: 4 (tenant_tier, database_type, tenant_status, connection_type)
-- Indexes Created: 16
-- Seed Data: 4 building types in model_catalog
