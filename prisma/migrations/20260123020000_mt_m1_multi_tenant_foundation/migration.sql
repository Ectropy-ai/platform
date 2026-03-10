-- MT-M1 Multi-Tenant Foundation Migration
-- Generated: 2026-01-23
-- Feature: Multi-Tenant Data Isolation for PIPEDA Compliance
-- Source: prisma/schema.prisma - Multi-Tenant Foundation section

-- ==============================================================================
-- Enums for Multi-Tenant System
-- ==============================================================================

-- Tenant status lifecycle
CREATE TYPE "TenantStatus" AS ENUM (
    'TRIAL',        -- Initial trial period
    'ACTIVE',       -- Active subscription
    'SUSPENDED',    -- Payment issues or violations
    'CANCELLED',    -- Subscription cancelled
    'ARCHIVED'      -- Retained for compliance, read-only
);

-- Subscription tier levels
CREATE TYPE "SubscriptionTier" AS ENUM (
    'FREE',          -- Limited features, 1 project
    'BASIC',         -- Small teams, 5 projects
    'PROFESSIONAL',  -- Growing teams, 25 projects
    'ENTERPRISE'     -- Unlimited, custom features
);

-- ==============================================================================
-- Table: tenants
-- Organization/customer isolation for multi-tenant SaaS
-- ==============================================================================

CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',

    -- Contact
    "primary_email" VARCHAR(255),
    "billing_email" VARCHAR(255),
    "phone" VARCHAR(50),

    -- Branding
    "logo_url" VARCHAR(500),
    "primary_color" VARCHAR(7),

    -- Domain
    "custom_domain" VARCHAR(255),

    -- Limits
    "max_projects" INTEGER NOT NULL DEFAULT 1,
    "max_users" INTEGER NOT NULL DEFAULT 5,
    "max_storage_gb" INTEGER NOT NULL DEFAULT 5,

    -- Compliance
    "data_region" VARCHAR(50) NOT NULL DEFAULT 'us-west-2',
    "compliance_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retention_days" INTEGER NOT NULL DEFAULT 2555,

    -- Settings
    "settings" JSONB,
    "features" JSONB,

    -- Billing
    "stripe_customer_id" VARCHAR(100),
    "billing_cycle_day" INTEGER NOT NULL DEFAULT 1,

    -- Timestamps
    "trial_ends_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_custom_domain_key" ON "tenants"("custom_domain") WHERE "custom_domain" IS NOT NULL;

-- Performance indexes
CREATE INDEX "idx_tenants_slug" ON "tenants"("slug");
CREATE INDEX "idx_tenants_status" ON "tenants"("status");
CREATE INDEX "idx_tenants_subscription_tier" ON "tenants"("subscription_tier");
CREATE INDEX "idx_tenants_created_at" ON "tenants"("created_at" DESC);

-- ==============================================================================
-- Add tenant_id to existing tables
-- ==============================================================================

-- Add tenant_id to users table
ALTER TABLE "users"
ADD COLUMN "tenant_id" UUID,
ADD COLUMN "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- Add foreign key constraint for users
ALTER TABLE "users"
ADD CONSTRAINT "users_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index for tenant filtering on users
CREATE INDEX "idx_users_tenant_id" ON "users"("tenant_id");

-- Add tenant_id to projects table
ALTER TABLE "projects"
ADD COLUMN "tenant_id" UUID;

-- Backfill: Projects need a tenant - this will be handled by application during migration
-- For now, we make it nullable and require application to assign tenants

-- Add foreign key constraint for projects
ALTER TABLE "projects"
ADD CONSTRAINT "projects_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for tenant filtering on projects
CREATE INDEX "idx_projects_tenant_id" ON "projects"("tenant_id");
CREATE INDEX "idx_projects_tenant_status" ON "projects"("tenant_id", "status");

-- Add tenant_id to audit_log table
ALTER TABLE "audit_log"
ADD COLUMN "tenant_id" UUID;

-- Add foreign key constraint for audit_log
ALTER TABLE "audit_log"
ADD CONSTRAINT "audit_log_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create indexes for tenant filtering on audit_log
CREATE INDEX "idx_audit_tenant" ON "audit_log"("tenant_id");
CREATE INDEX "idx_audit_tenant_time" ON "audit_log"("tenant_id", "created_at");

-- ==============================================================================
-- Row-Level Security (RLS) Preparation
-- ==============================================================================
-- Note: RLS policies will be enabled in a separate migration after application
-- is updated to set tenant context. This migration provides the structure.

-- Example RLS policy (commented out - enable when ready):
-- ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "tenant_isolation_policy" ON "projects"
--     USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- ==============================================================================
-- Trigger for updated_at on tenants
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenants_updated_at
    BEFORE UPDATE ON "tenants"
    FOR EACH ROW
    EXECUTE FUNCTION update_tenants_updated_at();

-- ==============================================================================
-- Comments for documentation
-- ==============================================================================

COMMENT ON TABLE "tenants" IS 'Multi-tenant organization isolation for PIPEDA compliance. Each tenant represents a customer organization.';
COMMENT ON COLUMN "tenants"."slug" IS 'URL-safe unique identifier for the tenant (e.g., acme-construction)';
COMMENT ON COLUMN "tenants"."compliance_flags" IS 'Array of compliance standards this tenant requires (e.g., PIPEDA, SOC2)';
COMMENT ON COLUMN "tenants"."retention_days" IS 'Data retention period in days (default 7 years = 2555 days)';
COMMENT ON COLUMN "users"."tenant_id" IS 'Tenant this user belongs to. NULL for platform administrators.';
COMMENT ON COLUMN "users"."is_platform_admin" IS 'Platform-level admin with cross-tenant access';
COMMENT ON COLUMN "projects"."tenant_id" IS 'Tenant this project belongs to. Required for all projects.';
COMMENT ON COLUMN "audit_log"."tenant_id" IS 'Tenant context for audit entry. NULL for platform-level events.';
