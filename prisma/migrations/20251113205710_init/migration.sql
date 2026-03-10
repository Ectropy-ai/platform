-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "StakeholderRole" AS ENUM ('owner', 'architect', 'contractor', 'engineer', 'consultant', 'inspector', 'site_manager', 'admin');

-- CreateEnum
CREATE TYPE "ElementStatus" AS ENUM ('planned', 'design_approved', 'procurement', 'in_progress', 'completed', 'on_hold', 'rejected');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('design_change', 'budget_allocation', 'timeline_adjustment', 'contractor_selection', 'material_change', 'governance');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'active', 'passed', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "VoteDecision" AS ENUM ('approve', 'reject', 'abstain');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "picture" VARCHAR(500),
    "provider" VARCHAR(50),
    "provider_id" VARCHAR(255),
    "role" "StakeholderRole" NOT NULL DEFAULT 'contractor',
    "roles" "StakeholderRole"[] DEFAULT ARRAY['contractor']::"StakeholderRole"[],
    "company" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token" VARCHAR(512) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "owner_id" UUID NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planning',
    "total_budget" DECIMAL(15,2),
    "currency" VARCHAR(3) DEFAULT 'USD',
    "start_date" DATE,
    "expected_completion" DATE,
    "dao_address" VARCHAR(42),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "role" "StakeholderRole" NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voting_power" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_elements" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "element_type" VARCHAR(100) NOT NULL,
    "element_name" VARCHAR(255) NOT NULL,
    "ifc_id" VARCHAR(255),
    "properties" JSONB NOT NULL DEFAULT '{}',
    "status" "ElementStatus" NOT NULL DEFAULT 'planned',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_elements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_ifc_files" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" VARCHAR(500) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "upload_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_ifc_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "proposer_id" UUID NOT NULL,
    "proposal_type" "ProposalType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
    "required_votes" INTEGER NOT NULL DEFAULT 1,
    "voting_deadline" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,
    "decision" "VoteDecision" NOT NULL,
    "comment" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "voted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "event_hash" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "resource_id" VARCHAR(255) NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "actor_id" VARCHAR(255) NOT NULL,
    "event_data" JSONB NOT NULL,
    "previous_hash" VARCHAR(64),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_ip" VARCHAR(45),
    "user_agent" TEXT,
    "session_id" VARCHAR(255),
    "request_id" VARCHAR(255),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_provider_provider_id_key" ON "users"("provider", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_key" ON "user_sessions"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "project_roles_user_id_project_id_role_key" ON "project_roles"("user_id", "project_id", "role");

-- CreateIndex
CREATE INDEX "proposals_project_id_idx" ON "proposals"("project_id");

-- CreateIndex
CREATE INDEX "proposals_status_idx" ON "proposals"("status");

-- CreateIndex
CREATE INDEX "votes_proposal_id_idx" ON "votes"("proposal_id");

-- CreateIndex
CREATE INDEX "votes_voter_id_idx" ON "votes"("voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_proposal_id_voter_id_key" ON "votes"("proposal_id", "voter_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_event_hash_key" ON "audit_log"("event_hash");

-- CreateIndex
CREATE INDEX "idx_audit_chain" ON "audit_log"("resource_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_hash" ON "audit_log"("event_hash");

-- CreateIndex
CREATE INDEX "idx_audit_type" ON "audit_log"("event_type");

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_created" ON "audit_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_audit_prev_hash" ON "audit_log"("previous_hash");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_roles" ADD CONSTRAINT "project_roles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_elements" ADD CONSTRAINT "construction_elements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_elements" ADD CONSTRAINT "construction_elements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_ifc_files" ADD CONSTRAINT "uploaded_ifc_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_ifc_files" ADD CONSTRAINT "uploaded_ifc_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
