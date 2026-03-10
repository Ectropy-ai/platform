-- =============================================================================
-- M2: User Management & Self-Service Onboarding - Schema Migration
-- =============================================================================
-- Milestone: User Management M2 (Backend Services Layer)
-- Target: March 2026 Canadian pilot customer onboarding
-- Purpose: Enables self-service registration, team invitations, marketing-controlled emails
-- =============================================================================

-- Create enums for lifecycle management
CREATE TYPE "LifecycleStage" AS ENUM (
  'WAITLIST',
  'EMAIL_SENT',
  'EMAIL_VERIFIED',
  'TRIAL',
  'TRIAL_EXPIRED',
  'PAID',
  'CHURNED',
  'REACTIVATED'
);

CREATE TYPE "InvitationStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED',
  'BOUNCED'
);

CREATE TYPE "EmailTemplateType" AS ENUM (
  'VERIFICATION_EMAIL',
  'WELCOME_TRIAL',
  'TRIAL_REMINDER',
  'TRIAL_EXPIRED',
  'INVITATION',
  'PAYMENT_SUCCESS',
  'PAYMENT_FAILED',
  'TEAM_MEMBER_ADDED',
  'PROJECT_MILESTONE',
  'SYSTEM_NOTIFICATION'
);

CREATE TYPE "EmailTemplateStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
  'A_B_TEST'
);

-- =============================================================================
-- Table: email_templates
-- Marketing-controlled email content (replaces hardcoded templates)
-- =============================================================================
CREATE TABLE "email_templates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "template_type" "EmailTemplateType" NOT NULL,
  "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',

  -- Content (handlebars-style variables)
  "subject" VARCHAR(255) NOT NULL,
  "body_text" TEXT NOT NULL,
  "body_html" TEXT NOT NULL,
  "preview_text" VARCHAR(255),

  -- Versioning (for A/B testing and rollback)
  "version" INTEGER NOT NULL DEFAULT 1,
  "parent_id" UUID,
  "variant_name" VARCHAR(50),

  -- Variables expected (for validation)
  "required_variables" TEXT[] NOT NULL DEFAULT '{}',

  -- Metadata
  "created_by" UUID,
  "updated_by" UUID,
  "notes" TEXT,

  -- Timestamps
  "active_from" TIMESTAMPTZ(6),
  "active_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT "fk_email_templates_parent" FOREIGN KEY ("parent_id")
    REFERENCES "email_templates"("id") ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT "uq_email_templates_type_version" UNIQUE ("template_type", "version")
);

-- Indexes for email_templates
CREATE INDEX "idx_email_templates_type_status" ON "email_templates"("template_type", "status");
CREATE INDEX "idx_email_templates_status_active_dates" ON "email_templates"("status", "active_from", "active_until");

-- =============================================================================
-- Table: user_registrations
-- Tracks user signup flow from waitlist to paid customer
-- =============================================================================
CREATE TABLE "user_registrations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "full_name" VARCHAR(255),

  -- Lifecycle tracking
  "lifecycle_stage" "LifecycleStage" NOT NULL DEFAULT 'WAITLIST',

  -- Email verification
  "verification_token" VARCHAR(128) UNIQUE,
  "verification_sent_at" TIMESTAMPTZ(6),
  "verified_at" TIMESTAMPTZ(6),

  -- Trial tracking
  "trial_started_at" TIMESTAMPTZ(6),
  "trial_ends_at" TIMESTAMPTZ(6),

  -- Conversion tracking
  "converted_at" TIMESTAMPTZ(6),
  "subscription_tier" "SubscriptionTier",

  -- CRM integration (Twenty CRM)
  "crm_lead_id" VARCHAR(100),
  "crm_contact_id" VARCHAR(100),
  "crm_company_id" VARCHAR(100),

  -- Tenant/User linkage
  "tenant_id" UUID,
  "user_id" UUID,

  -- Signup metadata
  "registration_source" VARCHAR(50) NOT NULL DEFAULT 'landing_page',
  "utm_source" VARCHAR(100),
  "utm_medium" VARCHAR(100),
  "utm_campaign" VARCHAR(100),
  "referrer" VARCHAR(500),
  "ip_address" VARCHAR(45),
  "user_agent" TEXT,

  -- Metadata
  "metadata" JSONB,

  -- Timestamps
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT "fk_user_registrations_tenant" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE SET NULL,
  CONSTRAINT "fk_user_registrations_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE SET NULL
);

-- Indexes for user_registrations
CREATE INDEX "idx_user_registrations_email" ON "user_registrations"("email");
CREATE INDEX "idx_user_registrations_lifecycle" ON "user_registrations"("lifecycle_stage");
CREATE INDEX "idx_user_registrations_verification_token" ON "user_registrations"("verification_token");
CREATE INDEX "idx_user_registrations_tenant_id" ON "user_registrations"("tenant_id");
CREATE INDEX "idx_user_registrations_crm_lead_id" ON "user_registrations"("crm_lead_id");
CREATE INDEX "idx_user_registrations_created_at" ON "user_registrations"("created_at" DESC);

-- =============================================================================
-- Table: user_invitations
-- Team invitations for adding users to existing tenants
-- =============================================================================
CREATE TABLE "user_invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "token" VARCHAR(128) NOT NULL UNIQUE,

  -- Role assignment
  "role" "StakeholderRole" NOT NULL DEFAULT 'contractor',
  "permissions" JSONB,

  -- Status tracking
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',

  -- Invitation metadata
  "invited_by" UUID NOT NULL,
  "accepted_by" UUID,
  "message" TEXT,

  -- Email tracking
  "email_sent_at" TIMESTAMPTZ(6),
  "last_reminder_at" TIMESTAMPTZ(6),
  "reminder_count" INTEGER NOT NULL DEFAULT 0,

  -- Expiration (default 7 days)
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,

  -- Timestamps
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT "fk_user_invitations_tenant" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_user_invitations_inviter" FOREIGN KEY ("invited_by")
    REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_user_invitations_acceptor" FOREIGN KEY ("accepted_by")
    REFERENCES "users"("id") ON DELETE SET NULL,

  -- Constraints (prevent duplicate pending invitations)
  CONSTRAINT "uq_user_invitations_tenant_email_status" UNIQUE ("tenant_id", "email", "status")
);

-- Indexes for user_invitations
CREATE INDEX "idx_user_invitations_token" ON "user_invitations"("token");
CREATE INDEX "idx_user_invitations_email" ON "user_invitations"("email");
CREATE INDEX "idx_user_invitations_tenant_status" ON "user_invitations"("tenant_id", "status");
CREATE INDEX "idx_user_invitations_status_expires" ON "user_invitations"("status", "expires_at");
CREATE INDEX "idx_user_invitations_created_at" ON "user_invitations"("created_at" DESC);

-- =============================================================================
-- Table: tenant_members
-- Team membership tracking (enables multi-tenant user relationships)
-- =============================================================================
CREATE TABLE "tenant_members" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,

  -- Role within this tenant
  "role" "StakeholderRole" NOT NULL DEFAULT 'contractor',
  "permissions" JSONB,

  -- Status
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_owner" BOOLEAN NOT NULL DEFAULT false,

  -- Activity tracking
  "last_active_at" TIMESTAMPTZ(6),

  -- Timestamps
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "removed_at" TIMESTAMPTZ(6),
  "removed_by" UUID,

  -- Foreign keys
  CONSTRAINT "fk_tenant_members_tenant" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_tenant_members_user" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE,

  -- Constraints (one membership per user per tenant)
  CONSTRAINT "uq_tenant_members_tenant_user" UNIQUE ("tenant_id", "user_id")
);

-- Indexes for tenant_members
CREATE INDEX "idx_tenant_members_user_id" ON "tenant_members"("user_id");
CREATE INDEX "idx_tenant_members_tenant_active" ON "tenant_members"("tenant_id", "is_active");
CREATE INDEX "idx_tenant_members_active_last_active" ON "tenant_members"("is_active", "last_active_at" DESC);

-- =============================================================================
-- Table: subscription_history
-- Tracks lifecycle transitions for analytics and compliance
-- =============================================================================
CREATE TABLE "subscription_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,

  -- Lifecycle transition
  "from_stage" "LifecycleStage",
  "to_stage" "LifecycleStage" NOT NULL,

  -- Subscription details
  "from_tier" "SubscriptionTier",
  "to_tier" "SubscriptionTier",

  -- Financial tracking
  "mrr_change" DECIMAL(10, 2),
  "arr_change" DECIMAL(10, 2),

  -- Transition metadata
  "trigger" VARCHAR(100) NOT NULL,
  "trigger_user_id" UUID,
  "notes" TEXT,

  -- CRM sync
  "synced_to_crm" BOOLEAN NOT NULL DEFAULT false,
  "crm_synced_at" TIMESTAMPTZ(6),

  -- Timestamp
  "transitioned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- Foreign keys
  CONSTRAINT "fk_subscription_history_tenant" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_subscription_history_trigger_user" FOREIGN KEY ("trigger_user_id")
    REFERENCES "users"("id") ON DELETE SET NULL
);

-- Indexes for subscription_history
CREATE INDEX "idx_subscription_history_tenant_transitioned" ON "subscription_history"("tenant_id", "transitioned_at" DESC);
CREATE INDEX "idx_subscription_history_to_stage_transitioned" ON "subscription_history"("to_stage", "transitioned_at" DESC);
CREATE INDEX "idx_subscription_history_trigger_transitioned" ON "subscription_history"("trigger", "transitioned_at" DESC);

-- =============================================================================
-- Seed Default Email Templates (Marketing Control)
-- =============================================================================
-- These serve as starting points for marketing team to customize
-- =============================================================================

INSERT INTO "email_templates" (
  "template_type",
  "status",
  "subject",
  "body_text",
  "body_html",
  "preview_text",
  "required_variables",
  "active_from"
) VALUES
  (
    'VERIFICATION_EMAIL',
    'ACTIVE',
    'Verify your email address - Ectropy',
    E'Hello {{user_name}},\n\nThank you for signing up for Ectropy!\n\nPlease verify your email address by clicking this link:\n{{verification_link}}\n\nThis link will expire in 24 hours.\n\nIf you did not sign up for Ectropy, please ignore this email.\n\nBest regards,\nThe Ectropy Team',
    E'<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;"><h2>Welcome to Ectropy!</h2><p>Hello {{user_name}},</p><p>Thank you for signing up for Ectropy!</p><p><a href="{{verification_link}}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email Address</a></p><p>This link will expire in 24 hours.</p><p>If you did not sign up for Ectropy, please ignore this email.</p><p>Best regards,<br>The Ectropy Team</p></body></html>',
    'Verify your email to get started with Ectropy',
    ARRAY['user_name', 'verification_link'],
    NOW()
  ),
  (
    'WELCOME_TRIAL',
    'ACTIVE',
    'Welcome to your Ectropy trial',
    E'Hello {{user_name}},\n\nYour Ectropy trial is now active!\n\nYou have {{trial_days}} days to explore all our features.\n\nGet started: {{dashboard_link}}\n\nNeed help? Check out our documentation: {{docs_link}}\n\nBest regards,\nThe Ectropy Team',
    E'<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;"><h2>Your trial is active!</h2><p>Hello {{user_name}},</p><p>Your Ectropy trial is now active! You have <strong>{{trial_days}} days</strong> to explore all our features.</p><p><a href="{{dashboard_link}}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Go to Dashboard</a></p><p>Need help? <a href="{{docs_link}}">Check out our documentation</a></p><p>Best regards,<br>The Ectropy Team</p></body></html>',
    'Your trial is active - Start building now!',
    ARRAY['user_name', 'trial_days', 'dashboard_link', 'docs_link'],
    NOW()
  ),
  (
    'INVITATION',
    'ACTIVE',
    '{{inviter_name}} invited you to join {{tenant_name}} on Ectropy',
    E'Hello,\n\n{{inviter_name}} has invited you to join {{tenant_name}} on Ectropy as a {{role}}.\n\nAccept invitation: {{invitation_link}}\n\nThis invitation will expire in 7 days.\n\nBest regards,\nThe Ectropy Team',
    E'<!DOCTYPE html><html><body style="font-family: Arial, sans-serif;"><h2>You''ve been invited!</h2><p>{{inviter_name}} has invited you to join <strong>{{tenant_name}}</strong> on Ectropy as a <strong>{{role}}</strong>.</p><p><a href="{{invitation_link}}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Accept Invitation</a></p><p>This invitation will expire in 7 days.</p><p>Best regards,<br>The Ectropy Team</p></body></html>',
    'You''ve been invited to join a team on Ectropy',
    ARRAY['inviter_name', 'tenant_name', 'role', 'invitation_link'],
    NOW()
  );

-- =============================================================================
-- Migration Comments (for rollback instructions)
-- =============================================================================
COMMENT ON TABLE "email_templates" IS 'M2: Marketing-controlled email templates - enables marketing team to edit email content without code deployments';
COMMENT ON TABLE "user_registrations" IS 'M2: User registration lifecycle tracking - from waitlist to paid customer';
COMMENT ON TABLE "user_invitations" IS 'M2: Team invitation flow - secure token-based user invitations';
COMMENT ON TABLE "tenant_members" IS 'M2: Multi-tenant team membership - enables users to belong to multiple tenants';
COMMENT ON TABLE "subscription_history" IS 'M2: Lifecycle transition tracking - conversion funnel analytics and compliance';

-- =============================================================================
-- Rollback Instructions
-- =============================================================================
-- To rollback this migration:
-- DROP TABLE IF EXISTS "subscription_history" CASCADE;
-- DROP TABLE IF EXISTS "tenant_members" CASCADE;
-- DROP TABLE IF EXISTS "user_invitations" CASCADE;
-- DROP TABLE IF EXISTS "user_registrations" CASCADE;
-- DROP TABLE IF EXISTS "email_templates" CASCADE;
-- DROP TYPE IF EXISTS "EmailTemplateStatus";
-- DROP TYPE IF EXISTS "EmailTemplateType";
-- DROP TYPE IF EXISTS "InvitationStatus";
-- DROP TYPE IF EXISTS "LifecycleStage";
