-- DP-M1 Dual-Process Decision Foundation Migration
-- Generated: 2026-01-23
-- Feature: Dual-Process Decision Models (Kahneman System 1/System 2)
-- Source: prisma/schema.prisma - Dual-Process Decision Models section

-- ==============================================================================
-- Enums for Dual-Process Decision System
-- ==============================================================================

-- Decision process type (System 1 fast vs System 2 deliberate)
CREATE TYPE "DecisionProcessType" AS ENUM (
    'SYSTEM_1',       -- Fast, intuitive, pattern-matched
    'SYSTEM_2',       -- Slow, deliberate, analytical
    'HYBRID',         -- Started as System 1, escalated to System 2
    'AUTO_APPROVED'   -- Pre-approved pattern match
);

-- Decision event lifecycle types
CREATE TYPE "DecisionEventType" AS ENUM (
    'INITIATED',       -- Decision request created
    'PATTERN_MATCHED', -- System 1 pattern recognition
    'ESCALATED',       -- Moved to System 2 processing
    'ANALYZED',        -- System 2 analysis complete
    'APPROVED',        -- Final approval
    'REJECTED',        -- Final rejection
    'DEFERRED',        -- Postponed for more info
    'SUPERSEDED',      -- Replaced by another decision
    'ACKNOWLEDGED'     -- Worker acknowledged
);

-- Pattern confidence levels for System 1 matching
CREATE TYPE "PatternConfidenceLevel" AS ENUM (
    'LOW',       -- <60% confidence
    'MEDIUM',    -- 60-80% confidence
    'HIGH',      -- 80-95% confidence
    'VERIFIED'   -- >95% with validation
);

-- SDI (Spatial Decision Intelligence) snapshot trigger types
CREATE TYPE "SDISnapshotType" AS ENUM (
    'PERIODIC',         -- Scheduled snapshot
    'EVENT_TRIGGERED',  -- Triggered by significant event
    'PRE_INSPECTION',   -- Before inspection
    'POST_INSPECTION',  -- After inspection
    'MILESTONE',        -- Project milestone
    'ANOMALY'           -- Detected anomaly
);

-- ==============================================================================
-- Table 17: decision_events
-- Tracks the dual-process decision lifecycle events
-- ==============================================================================

CREATE TABLE "decision_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "event_id" VARCHAR(30) NOT NULL,
    "decision_urn" VARCHAR(200) NOT NULL,
    "event_type" "DecisionEventType" NOT NULL,
    "process_type" "DecisionProcessType" NOT NULL,

    -- Timing metrics (critical for System 1 vs 2 classification)
    "processing_time_ms" INTEGER,
    "time_to_decision_ms" INTEGER,
    "queue_wait_ms" INTEGER,

    -- Pattern matching (System 1)
    "pattern_id" VARCHAR(200),
    "pattern_confidence" DECIMAL(4,3),
    "pattern_match_score" DECIMAL(4,3),

    -- Authority context
    "authority_level" INTEGER,
    "actor_urn" VARCHAR(200),
    "delegated_from" VARCHAR(200),

    -- Voxel context
    "voxel_urn" VARCHAR(200),
    "location_verified" BOOLEAN NOT NULL DEFAULT false,

    -- Cognitive load indicators
    "concurrent_decisions" INTEGER,
    "actor_fatigue_score" DECIMAL(4,3),
    "time_of_day" VARCHAR(20),

    -- AI analysis
    "ai_recommendation" VARCHAR(50),
    "ai_confidence" DECIMAL(4,3),
    "ai_reasoning" JSONB,

    -- Outcome (for completed events)
    "outcome" VARCHAR(50),
    "outcome_value" DECIMAL(15,2),
    "quality_score" DECIMAL(4,3),

    -- Evidence
    "evidence" JSONB,
    "notes" TEXT,

    -- Graph metadata
    "graph_metadata" JSONB,
    "meta" JSONB,

    -- Timestamps
    "event_timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_events_pkey" PRIMARY KEY ("id")
);

-- Indexes for decision_events
CREATE UNIQUE INDEX "decision_events_urn_key" ON "decision_events"("urn");
CREATE UNIQUE INDEX "decision_events_project_id_event_id_key" ON "decision_events"("project_id", "event_id");
CREATE INDEX "idx_decision_events_urn" ON "decision_events"("urn");
CREATE INDEX "idx_decision_events_decision_urn" ON "decision_events"("decision_urn");
CREATE INDEX "idx_decision_events_project_event_type" ON "decision_events"("project_id", "event_type");
CREATE INDEX "idx_decision_events_process_type" ON "decision_events"("process_type");
CREATE INDEX "idx_decision_events_pattern_id" ON "decision_events"("pattern_id");
CREATE INDEX "idx_decision_events_event_timestamp" ON "decision_events"("event_timestamp" DESC);

-- ==============================================================================
-- Table 18: success_patterns
-- Captures patterns from successful decisions for System 1 matching
-- ==============================================================================

CREATE TABLE "success_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID,  -- Null for global patterns
    "pattern_id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,

    -- Pattern classification
    "category" VARCHAR(100) NOT NULL,
    "subcategory" VARCHAR(100),
    "trade" VARCHAR(100),
    "work_type" VARCHAR(100),

    -- Pattern definition
    "trigger_conditions" JSONB NOT NULL,
    "context_requirements" JSONB,
    "decision_template" JSONB NOT NULL,

    -- Confidence metrics
    "confidence_level" "PatternConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "confidence_score" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
    "min_confidence_threshold" DECIMAL(4,3) NOT NULL DEFAULT 0.7,

    -- Authority scope
    "max_authority_level" INTEGER NOT NULL DEFAULT 1,
    "auto_approve_enabled" BOOLEAN NOT NULL DEFAULT false,
    "requires_location" BOOLEAN NOT NULL DEFAULT true,

    -- Limits and constraints
    "budget_limit" DECIMAL(15,2),
    "schedule_limit_hours" INTEGER,
    "variance_limit" DECIMAL(6,4),

    -- Learning metrics
    "times_matched" INTEGER NOT NULL DEFAULT 0,
    "times_succeeded" INTEGER NOT NULL DEFAULT 0,
    "times_failed" INTEGER NOT NULL DEFAULT 0,
    "times_overridden" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DECIMAL(4,3),
    "avg_processing_time_ms" INTEGER,
    "total_value_saved" DECIMAL(15,2),

    -- Source decisions (training data)
    "source_decisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "last_match_urn" VARCHAR(200),

    -- Validity
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "deprecated_by" VARCHAR(200),

    -- Version control
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_pattern_urn" VARCHAR(200),

    -- Graph metadata
    "graph_metadata" JSONB,
    "meta" JSONB,

    -- Timestamps
    "last_matched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "success_patterns_pkey" PRIMARY KEY ("id")
);

-- Indexes for success_patterns
CREATE UNIQUE INDEX "success_patterns_urn_key" ON "success_patterns"("urn");
CREATE UNIQUE INDEX "success_patterns_project_id_pattern_id_key" ON "success_patterns"("project_id", "pattern_id");
CREATE INDEX "idx_success_patterns_urn" ON "success_patterns"("urn");
CREATE INDEX "idx_success_patterns_category" ON "success_patterns"("category");
CREATE INDEX "idx_success_patterns_trade" ON "success_patterns"("trade");
CREATE INDEX "idx_success_patterns_confidence_level" ON "success_patterns"("confidence_level");
CREATE INDEX "idx_success_patterns_active_confidence" ON "success_patterns"("is_active", "confidence_score" DESC);
CREATE INDEX "idx_success_patterns_created_at" ON "success_patterns"("created_at" DESC);

-- ==============================================================================
-- Table 19: sdi_snapshots
-- Spatial Decision Intelligence snapshot for voxel decision state
-- ==============================================================================

CREATE TABLE "sdi_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "urn" VARCHAR(200) NOT NULL,
    "project_id" UUID NOT NULL,
    "snapshot_id" VARCHAR(30) NOT NULL,
    "snapshot_type" "SDISnapshotType" NOT NULL,
    "description" TEXT,

    -- Scope
    "voxel_urns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "building" VARCHAR(100),
    "level" VARCHAR(50),
    "zone" VARCHAR(100),

    -- Aggregate metrics - Decisions
    "total_decisions" INTEGER NOT NULL DEFAULT 0,
    "pending_decisions" INTEGER NOT NULL DEFAULT 0,
    "approved_decisions" INTEGER NOT NULL DEFAULT 0,
    "rejected_decisions" INTEGER NOT NULL DEFAULT 0,
    "escalated_decisions" INTEGER NOT NULL DEFAULT 0,

    -- Dual-Process metrics
    "system_1_decisions" INTEGER NOT NULL DEFAULT 0,
    "system_2_decisions" INTEGER NOT NULL DEFAULT 0,
    "auto_approved" INTEGER NOT NULL DEFAULT 0,
    "pattern_match_rate" DECIMAL(4,3),

    -- Time metrics
    "avg_decision_time_ms" INTEGER,
    "avg_system_1_time_ms" INTEGER,
    "avg_system_2_time_ms" INTEGER,
    "p95_decision_time_ms" INTEGER,

    -- Value metrics
    "total_value_at_risk" DECIMAL(15,2),
    "total_value_saved" DECIMAL(15,2),
    "avoided_delay_hours" DECIMAL(8,2),

    -- Acknowledgment metrics
    "total_acknowledgments" INTEGER NOT NULL DEFAULT 0,
    "pending_acknowledgments" INTEGER NOT NULL DEFAULT 0,
    "acknowledgment_rate" DECIMAL(4,3),
    "avg_ack_time_ms" INTEGER,

    -- Tolerance metrics
    "tolerance_overrides" INTEGER NOT NULL DEFAULT 0,
    "active_tolerances" INTEGER NOT NULL DEFAULT 0,
    "expired_tolerances" INTEGER NOT NULL DEFAULT 0,

    -- Alert metrics
    "active_alerts" INTEGER NOT NULL DEFAULT 0,
    "critical_alerts" INTEGER NOT NULL DEFAULT 0,
    "unacknowledged_alerts" INTEGER NOT NULL DEFAULT 0,

    -- Inspection metrics
    "pending_inspections" INTEGER NOT NULL DEFAULT 0,
    "passed_inspections" INTEGER NOT NULL DEFAULT 0,
    "failed_inspections" INTEGER NOT NULL DEFAULT 0,

    -- Consequence metrics
    "active_consequences" INTEGER NOT NULL DEFAULT 0,
    "mitigated_consequences" INTEGER NOT NULL DEFAULT 0,
    "total_consequence_cost" DECIMAL(15,2),

    -- Pattern learning metrics
    "patterns_matched" INTEGER NOT NULL DEFAULT 0,
    "patterns_created" INTEGER NOT NULL DEFAULT 0,
    "pattern_success_rate" DECIMAL(4,3),

    -- Health scores
    "decision_health_score" DECIMAL(4,3),
    "acknowledgment_health" DECIMAL(4,3),
    "overall_health_score" DECIMAL(4,3),

    -- Detailed breakdown
    "decision_breakdown" JSONB,
    "trade_breakdown" JSONB,
    "authority_breakdown" JSONB,
    "temporal_breakdown" JSONB,

    -- Trigger context
    "trigger_event_urn" VARCHAR(200),
    "trigger_reason" VARCHAR(200),

    -- Graph metadata
    "graph_metadata" JSONB,
    "meta" JSONB,

    -- Timestamps
    "snapshot_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sdi_snapshots_pkey" PRIMARY KEY ("id")
);

-- Indexes for sdi_snapshots
CREATE UNIQUE INDEX "sdi_snapshots_urn_key" ON "sdi_snapshots"("urn");
CREATE UNIQUE INDEX "sdi_snapshots_project_id_snapshot_id_key" ON "sdi_snapshots"("project_id", "snapshot_id");
CREATE INDEX "idx_sdi_snapshots_urn" ON "sdi_snapshots"("urn");
CREATE INDEX "idx_sdi_snapshots_project_snapshot_type" ON "sdi_snapshots"("project_id", "snapshot_type");
CREATE INDEX "idx_sdi_snapshots_snapshot_at" ON "sdi_snapshots"("snapshot_at" DESC);
CREATE INDEX "idx_sdi_snapshots_location" ON "sdi_snapshots"("building", "level", "zone");

-- ==============================================================================
-- Comments for documentation
-- ==============================================================================

COMMENT ON TABLE "decision_events" IS 'DP-M1: Tracks dual-process decision lifecycle events (System 1/System 2)';
COMMENT ON TABLE "success_patterns" IS 'DP-M1: Captures patterns from successful decisions for System 1 auto-matching';
COMMENT ON TABLE "sdi_snapshots" IS 'DP-M1: Spatial Decision Intelligence snapshots for voxel decision state aggregation';

COMMENT ON COLUMN "decision_events"."process_type" IS 'Kahneman dual-process: SYSTEM_1 (fast/intuitive) or SYSTEM_2 (slow/deliberate)';
COMMENT ON COLUMN "decision_events"."processing_time_ms" IS 'Critical metric for System 1 vs 2 classification - fast decisions are System 1';
COMMENT ON COLUMN "decision_events"."actor_fatigue_score" IS 'Cognitive load indicator - higher fatigue may require escalation to System 2';

COMMENT ON COLUMN "success_patterns"."trigger_conditions" IS 'JSON conditions that activate this pattern for System 1 auto-match';
COMMENT ON COLUMN "success_patterns"."decision_template" IS 'Template for generating auto-approved decisions when pattern matches';
COMMENT ON COLUMN "success_patterns"."auto_approve_enabled" IS 'When true, matching decisions skip human review (System 1)';

COMMENT ON COLUMN "sdi_snapshots"."system_1_decisions" IS 'Count of fast, pattern-matched decisions (target: maximize)';
COMMENT ON COLUMN "sdi_snapshots"."system_2_decisions" IS 'Count of deliberate, escalated decisions (target: minimize unnecessary)';
COMMENT ON COLUMN "sdi_snapshots"."pattern_match_rate" IS 'Ratio of System 1 to total decisions - higher is better';
