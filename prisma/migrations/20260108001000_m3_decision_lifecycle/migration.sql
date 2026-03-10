-- M3 Decision Lifecycle Migration
-- Generated: 2026-01-08
-- Feature: Decision Lifecycle & Voxel Decision Surface
-- Source: V3 JSON Schemas in .roadmap/schemas/

-- ==============================================================================
-- Enums for Decision Lifecycle
-- ==============================================================================

CREATE TYPE "PMDecisionType" AS ENUM ('APPROVAL', 'REJECTION', 'DEFERRAL', 'ESCALATION', 'PROPOSAL', 'CONSEQUENCE');
CREATE TYPE "PMDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'EXPIRED');
CREATE TYPE "VoxelStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED', 'INSPECTION_REQUIRED');
CREATE TYPE "ConsequenceCategory" AS ENUM ('SCHEDULE_DELAY', 'COST_INCREASE', 'SAFETY_RISK', 'QUALITY_IMPACT', 'SCOPE_CHANGE', 'REWORK_REQUIRED', 'RESOURCE_CONFLICT', 'PERMIT_REQUIRED', 'DESIGN_CHANGE', 'WARRANTY_IMPACT', 'COORDINATION_CONFLICT', 'TOLERANCE_VARIANCE', 'MATERIAL_MISMATCH', 'ACCESS_ISSUE', 'REGULATORY_CONCERN');
CREATE TYPE "ConsequenceSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ConsequenceStatus" AS ENUM ('IDENTIFIED', 'ASSESSED', 'MITIGATED', 'ACCEPTED', 'CLOSED');
CREATE TYPE "InspectionType" AS ENUM ('ROUGH_IN', 'COVER_UP', 'FINAL', 'SAFETY', 'QUALITY', 'SPECIAL', 'REGULATORY');
CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CONDITIONAL', 'CANCELLED');
CREATE TYPE "ScheduleProposalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "AuthorityLevelName" AS ENUM ('FIELD', 'FOREMAN', 'SUPERINTENDENT', 'PM', 'ARCHITECT', 'OWNER', 'REGULATORY');
CREATE TYPE "VoxelAttachmentType" AS ENUM ('PRIMARY', 'AFFECTED', 'ADJACENT', 'DOWNSTREAM');
CREATE TYPE "AlertPriority" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AcknowledgmentMethod" AS ENUM ('APP_TAP', 'SMS_REPLY', 'VOICE', 'AR_GESTURE');
CREATE TYPE "ToleranceType" AS ENUM ('WALL_FLATNESS', 'CEILING_HEIGHT', 'FLOOR_LEVEL', 'PROTRUSION', 'GAP', 'ALIGNMENT', 'FINISH_QUALITY', 'EQUIPMENT_CLEARANCE', 'PIPE_SLOPE', 'DUCT_SIZE');

-- ==============================================================================
-- Table 1: authority_levels
-- From: authority-level.schema.json
-- ==============================================================================

CREATE TABLE "authority_levels" (
    "id" SERIAL NOT NULL,
    "urn" VARCHAR(200) NOT NULL,
    "level" INTEGER NOT NULL,
    "name" "AuthorityLevelName" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "budget_limit" DECIMAL(15,2),
    "budget_limit_scope" VARCHAR(50),
    "variance_tolerance" VARCHAR(50),
    "schedule_authority" VARCHAR(50),
    "schedule_authority_hours" INTEGER,
    "auto_approve" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "graph_metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authority_levels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "authority_levels_urn_key" ON "authority_levels"("urn");
CREATE UNIQUE INDEX "authority_levels_level_key" ON "authority_levels"("level");
CREATE INDEX "idx_authority_levels_urn" ON "authority_levels"("urn");
CREATE INDEX "idx_authority_levels_level" ON "authority_levels"("level");

-- ==============================================================================
-- Table 2: participants
-- From: graph-architecture.json nodeType "participant"
-- ==============================================================================

CREATE TABLE "participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "participant_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "company" VARCHAR(255),
    "trade" VARCHAR(100),
    "authority_level_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "graph_metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "participants_urn_key" ON "participants"("urn");
CREATE UNIQUE INDEX "participants_project_id_participant_id_key" ON "participants"("project_id", "participant_id");
CREATE INDEX "idx_participants_urn" ON "participants"("urn");
CREATE INDEX "idx_participants_project_id" ON "participants"("project_id");
CREATE INDEX "idx_participants_authority_level_id" ON "participants"("authority_level_id");

ALTER TABLE "participants" ADD CONSTRAINT "participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "participants" ADD CONSTRAINT "participants_authority_level_id_fkey" FOREIGN KEY ("authority_level_id") REFERENCES "authority_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- Table 3: voxels
-- From: voxel-v3.schema.json
-- ==============================================================================

CREATE TABLE "voxels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "voxel_id" VARCHAR(50) NOT NULL,
    "status" "VoxelStatus" NOT NULL DEFAULT 'PLANNED',
    "coord_x" DOUBLE PRECISION NOT NULL,
    "coord_y" DOUBLE PRECISION NOT NULL,
    "coord_z" DOUBLE PRECISION NOT NULL,
    "resolution" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "min_x" DOUBLE PRECISION NOT NULL,
    "max_x" DOUBLE PRECISION NOT NULL,
    "min_y" DOUBLE PRECISION NOT NULL,
    "max_y" DOUBLE PRECISION NOT NULL,
    "min_z" DOUBLE PRECISION NOT NULL,
    "max_z" DOUBLE PRECISION NOT NULL,
    "building" VARCHAR(100),
    "level" VARCHAR(50),
    "zone" VARCHAR(100),
    "room" VARCHAR(100),
    "grid_reference" VARCHAR(50),
    "system" VARCHAR(50),
    "ifc_elements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decision_count" INTEGER NOT NULL DEFAULT 0,
    "unacknowledged_count" INTEGER NOT NULL DEFAULT 0,
    "current_phase" VARCHAR(50),
    "percent_complete" DOUBLE PRECISION,
    "planned_start" TIMESTAMPTZ(6),
    "planned_end" TIMESTAMPTZ(6),
    "actual_start" TIMESTAMPTZ(6),
    "actual_end" TIMESTAMPTZ(6),
    "is_critical_path" BOOLEAN NOT NULL DEFAULT false,
    "estimated_cost" DECIMAL(15,2),
    "actual_cost" DECIMAL(15,2),
    "estimated_hours" DOUBLE PRECISION,
    "actual_hours" DOUBLE PRECISION,
    "graph_metadata" JSONB,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voxels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voxels_urn_key" ON "voxels"("urn");
CREATE UNIQUE INDEX "voxels_project_id_voxel_id_key" ON "voxels"("project_id", "voxel_id");
CREATE INDEX "idx_voxels_urn" ON "voxels"("urn");
CREATE INDEX "idx_voxels_project_id_status" ON "voxels"("project_id", "status");
CREATE INDEX "idx_voxels_coordinates" ON "voxels"("coord_x", "coord_y", "coord_z");
CREATE INDEX "idx_voxels_location" ON "voxels"("building", "level", "zone");

ALTER TABLE "voxels" ADD CONSTRAINT "voxels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Table 4: pm_decisions
-- From: pm-decision.schema.json
-- ==============================================================================

CREATE TABLE "pm_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "decision_id" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "PMDecisionType" NOT NULL,
    "status" "PMDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "authority_required" INTEGER NOT NULL,
    "authority_current" INTEGER NOT NULL,
    "authority_level_id" INTEGER,
    "escalation_required" BOOLEAN NOT NULL DEFAULT false,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "primary_voxel_urn" VARCHAR(200),
    "question" TEXT,
    "rationale" TEXT,
    "options" JSONB,
    "selected_option" VARCHAR(50),
    "ai_analysis" JSONB,
    "budget_estimated" DECIMAL(15,2),
    "budget_actual" DECIMAL(15,2),
    "budget_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "budget_line" VARCHAR(100),
    "delay_days" INTEGER,
    "delay_hours" DOUBLE PRECISION,
    "critical_path" BOOLEAN NOT NULL DEFAULT false,
    "look_ahead_week" INTEGER,
    "requested_by_id" UUID,
    "approved_by_id" UUID,
    "evidence" JSONB,
    "escalation_source_urn" VARCHAR(200),
    "escalation_target_urn" VARCHAR(200),
    "supersedes_urn" VARCHAR(200),
    "superseded_by_urn" VARCHAR(200),
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "escalated_at" TIMESTAMPTZ(6),
    "expired_at" TIMESTAMPTZ(6),
    "superseded_at" TIMESTAMPTZ(6),
    "graph_metadata" JSONB,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pm_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pm_decisions_urn_key" ON "pm_decisions"("urn");
CREATE UNIQUE INDEX "pm_decisions_project_id_decision_id_key" ON "pm_decisions"("project_id", "decision_id");
CREATE INDEX "idx_pm_decisions_urn" ON "pm_decisions"("urn");
CREATE INDEX "idx_pm_decisions_project_id_status" ON "pm_decisions"("project_id", "status");
CREATE INDEX "idx_pm_decisions_project_id_type" ON "pm_decisions"("project_id", "type");
CREATE INDEX "idx_pm_decisions_authority_required" ON "pm_decisions"("authority_required");
CREATE INDEX "idx_pm_decisions_primary_voxel_urn" ON "pm_decisions"("primary_voxel_urn");
CREATE INDEX "idx_pm_decisions_created_at" ON "pm_decisions"("created_at" DESC);

ALTER TABLE "pm_decisions" ADD CONSTRAINT "pm_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pm_decisions" ADD CONSTRAINT "pm_decisions_authority_level_id_fkey" FOREIGN KEY ("authority_level_id") REFERENCES "authority_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pm_decisions" ADD CONSTRAINT "pm_decisions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pm_decisions" ADD CONSTRAINT "pm_decisions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- Table 5: voxel_decision_attachments
-- From: voxel-v3.schema.json attachedDecision
-- ==============================================================================

CREATE TABLE "voxel_decision_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voxel_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "attachment_type" "VoxelAttachmentType" NOT NULL,
    "label" VARCHAR(200),
    "affected_trades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "requires_acknowledgment" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "attached_by" VARCHAR(20) NOT NULL DEFAULT 'USER',
    "attached_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voxel_decision_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voxel_decision_attachments_voxel_id_decision_id_key" ON "voxel_decision_attachments"("voxel_id", "decision_id");
CREATE INDEX "idx_voxel_decision_attachments_voxel_id" ON "voxel_decision_attachments"("voxel_id");
CREATE INDEX "idx_voxel_decision_attachments_decision_id" ON "voxel_decision_attachments"("decision_id");
CREATE INDEX "idx_voxel_decision_attachments_attachment_type" ON "voxel_decision_attachments"("attachment_type");

ALTER TABLE "voxel_decision_attachments" ADD CONSTRAINT "voxel_decision_attachments_voxel_id_fkey" FOREIGN KEY ("voxel_id") REFERENCES "voxels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voxel_decision_attachments" ADD CONSTRAINT "voxel_decision_attachments_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "pm_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Table 6: tolerance_overrides
-- From: voxel-v3.schema.json toleranceOverride
-- ==============================================================================

CREATE TABLE "tolerance_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "voxel_id" UUID NOT NULL,
    "tolerance_type" "ToleranceType" NOT NULL,
    "standard_value" DOUBLE PRECISION,
    "standard_unit" VARCHAR(20),
    "standard_direction" VARCHAR(5),
    "approved_value" DOUBLE PRECISION NOT NULL,
    "approved_unit" VARCHAR(20) NOT NULL,
    "approved_direction" VARCHAR(5),
    "source_decision_urn" VARCHAR(200) NOT NULL,
    "approved_by_urn" VARCHAR(200),
    "rationale" TEXT,
    "applicable_trades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approval_date" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tolerance_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tolerance_overrides_urn_key" ON "tolerance_overrides"("urn");
CREATE INDEX "idx_tolerance_overrides_urn" ON "tolerance_overrides"("urn");
CREATE INDEX "idx_tolerance_overrides_voxel_id" ON "tolerance_overrides"("voxel_id");
CREATE INDEX "idx_tolerance_overrides_tolerance_type" ON "tolerance_overrides"("tolerance_type");
CREATE INDEX "idx_tolerance_overrides_source_decision_urn" ON "tolerance_overrides"("source_decision_urn");

ALTER TABLE "tolerance_overrides" ADD CONSTRAINT "tolerance_overrides_voxel_id_fkey" FOREIGN KEY ("voxel_id") REFERENCES "voxels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Table 7: pre_approvals
-- From: voxel-v3.schema.json preApproval
-- ==============================================================================

CREATE TABLE "pre_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voxel_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authority_level" "AuthorityLevelName" NOT NULL,
    "source_decision_urn" VARCHAR(200) NOT NULL,
    "applicable_trades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_pre_approvals_voxel_id" ON "pre_approvals"("voxel_id");
CREATE INDEX "idx_pre_approvals_authority_level" ON "pre_approvals"("authority_level");
CREATE INDEX "idx_pre_approvals_source_decision_urn" ON "pre_approvals"("source_decision_urn");

ALTER TABLE "pre_approvals" ADD CONSTRAINT "pre_approvals_voxel_id_fkey" FOREIGN KEY ("voxel_id") REFERENCES "voxels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Table 8: voxel_alerts
-- From: voxel-v3.schema.json voxelAlert
-- ==============================================================================

CREATE TABLE "voxel_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voxel_id" UUID NOT NULL,
    "priority" "AlertPriority" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "source_decision_urn" VARCHAR(200),
    "target_trades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requires_acknowledgment" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_by" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voxel_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_voxel_alerts_voxel_id" ON "voxel_alerts"("voxel_id");
CREATE INDEX "idx_voxel_alerts_priority" ON "voxel_alerts"("priority");
CREATE INDEX "idx_voxel_alerts_created_at" ON "voxel_alerts"("created_at" DESC);

ALTER TABLE "voxel_alerts" ADD CONSTRAINT "voxel_alerts_voxel_id_fkey" FOREIGN KEY ("voxel_id") REFERENCES "voxels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Table 9: acknowledgments
-- From: voxel-v3.schema.json acknowledgment
-- ==============================================================================

CREATE TABLE "acknowledgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "decision_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "worker_name" VARCHAR(255),
    "worker_trade" VARCHAR(100),
    "method" "AcknowledgmentMethod" NOT NULL,
    "notes" TEXT,
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,
    "gps_accuracy" DOUBLE PRECISION,
    "uwb_x" DOUBLE PRECISION,
    "uwb_y" DOUBLE PRECISION,
    "uwb_z" DOUBLE PRECISION,
    "uwb_accuracy" DOUBLE PRECISION,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acknowledgments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "acknowledgments_decision_id_participant_id_key" ON "acknowledgments"("decision_id", "participant_id");
CREATE INDEX "idx_acknowledgments_decision_id" ON "acknowledgments"("decision_id");
CREATE INDEX "idx_acknowledgments_participant_id" ON "acknowledgments"("participant_id");
CREATE INDEX "idx_acknowledgments_timestamp" ON "acknowledgments"("timestamp" DESC);

ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "pm_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Table 10: consequences
-- From: consequence-v3.schema.json
-- ==============================================================================

CREATE TABLE "consequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "consequence_id" VARCHAR(20) NOT NULL,
    "source_decision_id" UUID NOT NULL,
    "title" VARCHAR(200),
    "description" TEXT,
    "category" "ConsequenceCategory" NOT NULL,
    "severity" "ConsequenceSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ConsequenceStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "discovered_by_urn" VARCHAR(200),
    "discovered_at" TIMESTAMPTZ(6),
    "primary_voxel_id" UUID,
    "spatial_reference" JSONB,
    "budget_estimated" DECIMAL(15,2),
    "budget_actual" DECIMAL(15,2),
    "budget_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "delay_days" INTEGER,
    "critical_path" BOOLEAN NOT NULL DEFAULT false,
    "mitigation_plan" TEXT,
    "resolution_path" JSONB,
    "resolution_decision_urn" VARCHAR(200),
    "ai_trace_analysis" JSONB,
    "evidence" JSONB,
    "graph_metadata" JSONB,
    "meta" JSONB,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consequences_urn_key" ON "consequences"("urn");
CREATE UNIQUE INDEX "consequences_project_id_consequence_id_key" ON "consequences"("project_id", "consequence_id");
CREATE INDEX "idx_consequences_urn" ON "consequences"("urn");
CREATE INDEX "idx_consequences_project_id_status" ON "consequences"("project_id", "status");
CREATE INDEX "idx_consequences_category" ON "consequences"("category");
CREATE INDEX "idx_consequences_severity" ON "consequences"("severity");
CREATE INDEX "idx_consequences_source_decision_id" ON "consequences"("source_decision_id");
CREATE INDEX "idx_consequences_created_at" ON "consequences"("created_at" DESC);

ALTER TABLE "consequences" ADD CONSTRAINT "consequences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_source_decision_id_fkey" FOREIGN KEY ("source_decision_id") REFERENCES "pm_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consequences" ADD CONSTRAINT "consequences_primary_voxel_id_fkey" FOREIGN KEY ("primary_voxel_id") REFERENCES "voxels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- Table 11: schedule_proposals
-- From: schedule-proposal-v3.schema.json
-- ==============================================================================

CREATE TABLE "schedule_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "proposal_id" VARCHAR(20) NOT NULL,
    "proposer_urn" VARCHAR(200) NOT NULL,
    "source_decision_id" UUID,
    "title" VARCHAR(200),
    "status" "ScheduleProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "proposed_changes" JSONB NOT NULL,
    "justification_summary" TEXT NOT NULL,
    "justification_benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "justification_risks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coordination_needed" JSONB,
    "ai_analysis" JSONB,
    "required_approvers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvals" JSONB,
    "all_approved" BOOLEAN NOT NULL DEFAULT false,
    "resulting_decision_urn" VARCHAR(200),
    "look_ahead_week" INTEGER,
    "graph_metadata" JSONB,
    "meta" JSONB,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_proposals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedule_proposals_urn_key" ON "schedule_proposals"("urn");
CREATE UNIQUE INDEX "schedule_proposals_project_id_proposal_id_key" ON "schedule_proposals"("project_id", "proposal_id");
CREATE INDEX "idx_schedule_proposals_urn" ON "schedule_proposals"("urn");
CREATE INDEX "idx_schedule_proposals_project_id_status" ON "schedule_proposals"("project_id", "status");
CREATE INDEX "idx_schedule_proposals_proposer_urn" ON "schedule_proposals"("proposer_urn");
CREATE INDEX "idx_schedule_proposals_created_at" ON "schedule_proposals"("created_at" DESC);

ALTER TABLE "schedule_proposals" ADD CONSTRAINT "schedule_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "schedule_proposals" ADD CONSTRAINT "schedule_proposals_source_decision_id_fkey" FOREIGN KEY ("source_decision_id") REFERENCES "pm_decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- Table 12: inspections
-- From: inspection.schema.json
-- ==============================================================================

CREATE TABLE "inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "inspection_id" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200),
    "description" TEXT,
    "inspection_type" "InspectionType" NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "inspector_id" UUID,
    "inspector_info" JSONB,
    "regulatory_body" VARCHAR(200),
    "permit_number" VARCHAR(100),
    "code_reference" VARCHAR(200),
    "jurisdiction_code" VARCHAR(50),
    "scheduled_date" TIMESTAMPTZ(6),
    "actual_date" TIMESTAMPTZ(6),
    "duration_minutes" INTEGER,
    "decisions_reviewed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decisions_validated" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decisions_failed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "findings" JSONB,
    "punch_list" JSONB,
    "result_outcome" VARCHAR(20),
    "result_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reinspection_required" BOOLEAN NOT NULL DEFAULT false,
    "reinspection_date" DATE,
    "result_notes" TEXT,
    "evidence" JSONB,
    "consequences_created" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "decisions_triggered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "graph_metadata" JSONB,
    "meta" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inspections_urn_key" ON "inspections"("urn");
CREATE UNIQUE INDEX "inspections_project_id_inspection_id_key" ON "inspections"("project_id", "inspection_id");
CREATE INDEX "idx_inspections_urn" ON "inspections"("urn");
CREATE INDEX "idx_inspections_project_id_status" ON "inspections"("project_id", "status");
CREATE INDEX "idx_inspections_inspection_type" ON "inspections"("inspection_type");
CREATE INDEX "idx_inspections_inspector_id" ON "inspections"("inspector_id");
CREATE INDEX "idx_inspections_scheduled_date" ON "inspections"("scheduled_date");
CREATE INDEX "idx_inspections_created_at" ON "inspections"("created_at" DESC);

ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- Join table: inspections <-> voxels (many-to-many)
-- ==============================================================================

CREATE TABLE "_VoxelInspections" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

CREATE UNIQUE INDEX "_VoxelInspections_AB_unique" ON "_VoxelInspections"("A", "B");
CREATE INDEX "_VoxelInspections_B_index" ON "_VoxelInspections"("B");

ALTER TABLE "_VoxelInspections" ADD CONSTRAINT "_VoxelInspections_A_fkey" FOREIGN KEY ("A") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_VoxelInspections" ADD CONSTRAINT "_VoxelInspections_B_fkey" FOREIGN KEY ("B") REFERENCES "voxels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==============================================================================
-- Join table: inspections <-> pm_decisions (validated decisions)
-- ==============================================================================

CREATE TABLE "_InspectionDecisionsValidated" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

CREATE UNIQUE INDEX "_InspectionDecisionsValidated_AB_unique" ON "_InspectionDecisionsValidated"("A", "B");
CREATE INDEX "_InspectionDecisionsValidated_B_index" ON "_InspectionDecisionsValidated"("B");

ALTER TABLE "_InspectionDecisionsValidated" ADD CONSTRAINT "_InspectionDecisionsValidated_A_fkey" FOREIGN KEY ("A") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_InspectionDecisionsValidated" ADD CONSTRAINT "_InspectionDecisionsValidated_B_fkey" FOREIGN KEY ("B") REFERENCES "pm_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
