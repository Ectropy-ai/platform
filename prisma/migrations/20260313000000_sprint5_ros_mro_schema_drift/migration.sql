-- Sprint 5 ROS MRO Schema Drift Resolution
-- Date: 2026-03-13
-- Root Cause: RC-2 — Sprint 5 fields added to schema.prisma (2026-01-24)
-- but no migration was generated. Prisma client generated queries for
-- columns that did not exist in the database.
--
-- Drifted items resolved:
-- 1. VoxelHealthStatus enum (new type)
-- 2. VoxelStatus.ON_HOLD enum value (missing value)
-- 3. voxels.health_status column (missing column → P0 42703 errors)
-- 4. voxel_status_history table (entire table missing → audit trail broken)
-- 5. Sprint 5 aggregation index on voxels(level, system)
-- ==============================================================================

-- ==============================================================================
-- 1. Create VoxelHealthStatus enum
-- Used by: voxels.health_status, voxel_status_history.previous_health,
--          voxel_status_history.new_health
-- ==============================================================================
CREATE TYPE "VoxelHealthStatus" AS ENUM ('HEALTHY', 'AT_RISK', 'CRITICAL');

-- ==============================================================================
-- 2. Add ON_HOLD to VoxelStatus enum
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction in PostgreSQL.
-- Prisma handles this by running it outside the transaction block.
-- ==============================================================================
ALTER TYPE "VoxelStatus" ADD VALUE 'ON_HOLD';

-- ==============================================================================
-- 3. Add health_status column to voxels table
-- Default HEALTHY ensures existing rows get a valid value.
-- ==============================================================================
ALTER TABLE "voxels" ADD COLUMN "health_status" "VoxelHealthStatus" NOT NULL DEFAULT 'HEALTHY';

-- ==============================================================================
-- 4. Create voxel_status_history table
-- Sprint 5 ROS MRO audit trail for voxel status changes.
-- ==============================================================================
CREATE TABLE "voxel_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "voxel_id" UUID NOT NULL,
    "previous_status" "VoxelStatus",
    "new_status" "VoxelStatus" NOT NULL,
    "previous_health" "VoxelHealthStatus",
    "new_health" "VoxelHealthStatus",
    "percent_complete" DOUBLE PRECISION,
    "note" TEXT,
    "changed_by_id" UUID,
    "changed_by_name" VARCHAR(200),
    "source" VARCHAR(50),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voxel_status_history_pkey" PRIMARY KEY ("id")
);

-- Indexes for voxel_status_history
CREATE INDEX "voxel_status_history_voxel_id_created_at_idx" ON "voxel_status_history"("voxel_id", "created_at" DESC);
CREATE INDEX "voxel_status_history_changed_by_id_idx" ON "voxel_status_history"("changed_by_id");
CREATE INDEX "voxel_status_history_new_status_idx" ON "voxel_status_history"("new_status");
CREATE INDEX "voxel_status_history_created_at_idx" ON "voxel_status_history"("created_at" DESC);

-- Foreign keys for voxel_status_history
ALTER TABLE "voxel_status_history" ADD CONSTRAINT "voxel_status_history_voxel_id_fkey"
    FOREIGN KEY ("voxel_id") REFERENCES "voxels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voxel_status_history" ADD CONSTRAINT "voxel_status_history_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- 5. Sprint 5 aggregation index
-- Optimizes: GET /api/v1/projects/:projectId/voxels/aggregation
-- ==============================================================================
CREATE INDEX "voxels_level_system_idx" ON "voxels"("level", "system");
