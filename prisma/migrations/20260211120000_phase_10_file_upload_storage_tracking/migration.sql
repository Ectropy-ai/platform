-- ==============================================================================
-- Phase 10.2 - File Upload Storage Tracking Migration
-- Purpose: Enable storage usage tracking for trial limits enforcement
-- Features: File metadata, multi-tenant scoping, project association
-- Use Case: Track storage consumption per tenant for 1GB FREE tier limit
-- ==============================================================================

-- CreateTable
CREATE TABLE "file_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "project_id" UUID,
    "uploaded_by" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_path" VARCHAR(1000) NOT NULL,
    "public_url" VARCHAR(1000),
    "file_category" VARCHAR(50),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_uploads_tenant_id_idx" ON "file_uploads"("tenant_id");

-- CreateIndex
CREATE INDEX "file_uploads_project_id_idx" ON "file_uploads"("project_id");

-- CreateIndex
CREATE INDEX "file_uploads_uploaded_by_idx" ON "file_uploads"("uploaded_by");

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================================================
-- Performance Notes:
-- - Indexes on tenant_id, project_id, uploaded_by for efficient queries
-- - size_bytes aggregation query: SELECT SUM(size_bytes) FROM file_uploads WHERE tenant_id = ?
-- - Expected performance: <100ms for storage calculation per tenant
-- ==============================================================================

-- ==============================================================================
-- Security Notes:
-- - Multi-tenant scoping via tenant_id (enforced by RLS in future)
-- - CASCADE on tenant/project deletion (cleanup orphaned files)
-- - RESTRICT on user deletion (preserve uploader audit trail)
-- ==============================================================================
