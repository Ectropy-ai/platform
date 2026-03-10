-- Test Data Setup for Database Tests
-- Creates test users, projects, and elements for validation

-- Create test users
INSERT INTO users (id, email, username, full_name, password_hash, role, is_active) VALUES
('00000000-0000-0000-0000-000000000101', 'admin@example.com', 'admin', 'Admin User', '$2b$12$dummyhash', 'admin', true),
('00000000-0000-0000-0000-000000000102', 'viewer@example.com', 'viewer', 'Viewer User', '$2b$12$dummyhash', 'viewer', true),
('00000000-0000-0000-0000-000000000103', 'contractor@example.com', 'contractor', 'Contractor User', '$2b$12$dummyhash', 'contractor', true)
ON CONFLICT (id) DO NOTHING;

-- Create test project
INSERT INTO projects (id, name, description, project_code, status, created_by) VALUES
('00000000-0000-0000-0000-000000001001', 'Demo Construction Project', 'Test project for validation', 'DEMO-001', 'planning', '00000000-0000-0000-0000-000000000101')
ON CONFLICT (id) DO NOTHING;

-- Create project roles
INSERT INTO project_roles (project_id, user_id, role, permissions, is_active) VALUES
('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000101', 'OWNER', '["read", "write", "admin"]', true),
('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000102', 'ARCHITECT', '["read"]', true),
('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000103', 'CONTRACTOR', '["read", "write"]', true)
ON CONFLICT (project_id, user_id, role) DO NOTHING;

-- Create test construction elements
INSERT INTO construction_elements (
    id, 
    project_id, 
    element_type, 
    element_name, 
    element_description, 
    geometric_data, 
    properties, 
    access_control,
    status,
    created_by
) VALUES
(
    '00000000-0000-0000-0000-000000010001',
    '00000000-0000-0000-0000-000000001001',
    'Wall',
    'Demo Wall',
    'Test wall element for access control validation',
    '{"type": "wall", "height": 3.0, "width": 5.0, "thickness": 0.2}',
    '{"material": "concrete", "fire_rating": "2hr", "thermal_resistance": "R-20"}',
    '{"read_roles": ["OWNER", "ARCHITECT", "CONTRACTOR"], "write_roles": ["OWNER", "CONTRACTOR"], "admin_roles": ["OWNER"]}',
    'designed',
    '00000000-0000-0000-0000-000000000101'
),
(
    '00000000-0000-0000-0000-000000010002',
    '00000000-0000-0000-0000-000000001001',
    'Column',
    'Demo Column',
    'Test column element for access control validation',
    '{"type": "column", "height": 3.5, "width": 0.4, "depth": 0.4}',
    '{"material": "steel", "load_capacity": "100kN", "grade": "S355"}',
    '{"read_roles": ["OWNER", "CONTRACTOR"], "write_roles": ["OWNER"], "admin_roles": ["OWNER"]}',
    'designed',
    '00000000-0000-0000-0000-000000000101'
)
ON CONFLICT (id) DO NOTHING;

-- Create test KPIs
INSERT INTO project_kpis (project_id, kpi_name, kpi_type, target_value, actual_value, unit, created_by) VALUES
('00000000-0000-0000-0000-000000001001', 'Cost Performance Index', 'financial', 1.0, 0.95, 'ratio', '00000000-0000-0000-0000-000000000101'),
('00000000-0000-0000-0000-000000001001', 'Schedule Performance Index', 'schedule', 1.0, 1.05, 'ratio', '00000000-0000-0000-0000-000000000101')
ON CONFLICT DO NOTHING;

-- Create test milestone
INSERT INTO project_milestones (project_id, milestone_name, milestone_description, due_date, created_by) VALUES
('00000000-0000-0000-0000-000000001001', 'Foundation Complete', 'Foundation work completion milestone', '2025-08-01', '00000000-0000-0000-0000-000000000101')
ON CONFLICT DO NOTHING;

COMMIT;
