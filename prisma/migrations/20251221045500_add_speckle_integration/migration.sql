-- Migration: Add Speckle BIM Integration
-- Date: 2025-12-21
-- Purpose: Enable Speckle BIM platform integration for IFC upload and stream management

-- CreateTable: speckle_streams
CREATE TABLE IF NOT EXISTS "speckle_streams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "construction_project_id" UUID NOT NULL,
    "stream_id" VARCHAR(255) NOT NULL,
    "stream_name" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speckle_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: speckle_sync_logs
CREATE TABLE IF NOT EXISTS "speckle_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "construction_project_id" UUID NOT NULL,
    "operation" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "objects_processed" INTEGER NOT NULL DEFAULT 0,
    "objects_successful" INTEGER NOT NULL DEFAULT 0,
    "objects_failed" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,

    CONSTRAINT "speckle_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "speckle_streams_stream_id_key" ON "speckle_streams"("stream_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "speckle_streams_construction_project_id_key" ON "speckle_streams"("construction_project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "speckle_streams_construction_project_id_idx" ON "speckle_streams"("construction_project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "speckle_streams_stream_id_idx" ON "speckle_streams"("stream_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_construction_project_id_idx" ON "speckle_sync_logs"("construction_project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_status_idx" ON "speckle_sync_logs"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_operation_idx" ON "speckle_sync_logs"("operation");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_started_at_idx" ON "speckle_sync_logs"("started_at" DESC);

-- AddForeignKey (idempotent - check if constraint exists first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'speckle_streams_construction_project_id_fkey'
    ) THEN
        ALTER TABLE "speckle_streams" ADD CONSTRAINT "speckle_streams_construction_project_id_fkey"
        FOREIGN KEY ("construction_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (idempotent - check if constraint exists first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'speckle_sync_logs_construction_project_id_fkey'
    ) THEN
        ALTER TABLE "speckle_sync_logs" ADD CONSTRAINT "speckle_sync_logs_construction_project_id_fkey"
        FOREIGN KEY ("construction_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
