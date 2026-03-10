-- CreateIndex
CREATE INDEX "construction_elements_project_id_status_idx" ON "construction_elements"("project_id", "status");

-- CreateIndex
CREATE INDEX "construction_elements_element_type_idx" ON "construction_elements"("element_type");

-- CreateIndex
CREATE INDEX "construction_elements_created_at_idx" ON "construction_elements"("created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at" DESC);

-- CreateIndex
CREATE INDEX "uploaded_ifc_files_project_id_upload_status_idx" ON "uploaded_ifc_files"("project_id", "upload_status");

-- CreateIndex
CREATE INDEX "uploaded_ifc_files_uploaded_at_idx" ON "uploaded_ifc_files"("uploaded_at" DESC);
