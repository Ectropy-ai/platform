-- CreateTable: speckle_streams
-- Links construction projects to Speckle BIM streams for the 3D viewer
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
-- Tracks Speckle sync operations (import/export) per project
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

-- CreateIndex: unique stream_id
CREATE UNIQUE INDEX IF NOT EXISTS "speckle_streams_stream_id_key" ON "speckle_streams"("stream_id");

-- CreateIndex: unique construction_project_id (one stream per project)
CREATE UNIQUE INDEX IF NOT EXISTS "speckle_streams_construction_project_id_key" ON "speckle_streams"("construction_project_id");

-- CreateIndex: stream lookup
CREATE INDEX IF NOT EXISTS "speckle_streams_construction_project_id_idx" ON "speckle_streams"("construction_project_id");

-- CreateIndex: stream_id lookup
CREATE INDEX IF NOT EXISTS "speckle_streams_stream_id_idx" ON "speckle_streams"("stream_id");

-- CreateIndex: sync log indexes
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_construction_project_id_idx" ON "speckle_sync_logs"("construction_project_id");
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_status_idx" ON "speckle_sync_logs"("status");
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_operation_idx" ON "speckle_sync_logs"("operation");
CREATE INDEX IF NOT EXISTS "speckle_sync_logs_started_at_idx" ON "speckle_sync_logs"("started_at" DESC);

-- AddForeignKey: speckle_streams -> projects (idempotent — P3009 safe)
DO $$ BEGIN
    ALTER TABLE "speckle_streams" ADD CONSTRAINT "speckle_streams_construction_project_id_fkey"
        FOREIGN KEY ("construction_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey: speckle_sync_logs -> projects (idempotent — P3009 safe)
DO $$ BEGIN
    ALTER TABLE "speckle_sync_logs" ADD CONSTRAINT "speckle_sync_logs_construction_project_id_fkey"
        FOREIGN KEY ("construction_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- EnableRLS: match existing tenant isolation pattern
-- (ENABLE/FORCE RLS are inherently idempotent)
ALTER TABLE "speckle_streams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "speckle_streams" FORCE ROW LEVEL SECURITY;
ALTER TABLE "speckle_sync_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "speckle_sync_logs" FORCE ROW LEVEL SECURITY;

-- RLS policies: tenant isolation (idempotent — drop-if-exists + create)
DROP POLICY IF EXISTS "tenant_isolation_speckle_streams" ON "speckle_streams";
CREATE POLICY "tenant_isolation_speckle_streams" ON "speckle_streams" FOR ALL USING (rls_check_project_tenant_access(construction_project_id));
DROP POLICY IF EXISTS "tenant_isolation_speckle_sync_logs" ON "speckle_sync_logs";
CREATE POLICY "tenant_isolation_speckle_sync_logs" ON "speckle_sync_logs" FOR ALL USING (rls_check_project_tenant_access(construction_project_id));

-- RLS policies: app-level access for ectropy user (idempotent — drop-if-exists + create)
DROP POLICY IF EXISTS "speckle_streams_app_access" ON "speckle_streams";
CREATE POLICY "speckle_streams_app_access" ON "speckle_streams" FOR ALL TO ectropy USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "speckle_sync_logs_app_access" ON "speckle_sync_logs";
CREATE POLICY "speckle_sync_logs_app_access" ON "speckle_sync_logs" FOR ALL TO ectropy USING (true) WITH CHECK (true);
