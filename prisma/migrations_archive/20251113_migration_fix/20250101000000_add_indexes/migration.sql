-- Add indexes for performance optimization
-- Production Readiness: Phase 3 - Database Schema Improvements

-- User table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Project table indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- UserSession table indexes  
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);

-- ProjectRole table indexes
CREATE INDEX IF NOT EXISTS idx_project_roles_user_id ON project_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_project_roles_project_id ON project_roles(project_id);
CREATE INDEX IF NOT EXISTS idx_project_roles_is_active ON project_roles(is_active);

-- ConstructionElement table indexes
CREATE INDEX IF NOT EXISTS idx_construction_elements_project_id ON construction_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_construction_elements_created_by ON construction_elements(created_by);
CREATE INDEX IF NOT EXISTS idx_construction_elements_status ON construction_elements(status);
CREATE INDEX IF NOT EXISTS idx_construction_elements_element_type ON construction_elements(element_type);

-- UploadedIfcFile table indexes
CREATE INDEX IF NOT EXISTS idx_uploaded_ifc_files_project_id ON uploaded_ifc_files(project_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_ifc_files_user_id ON uploaded_ifc_files(user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_ifc_files_upload_status ON uploaded_ifc_files(upload_status);
CREATE INDEX IF NOT EXISTS idx_uploaded_ifc_files_uploaded_at ON uploaded_ifc_files(uploaded_at);
