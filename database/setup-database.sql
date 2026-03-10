-- Create database
CREATE DATABASE IF NOT EXISTS construction_platform;

-- Connect to database
\c construction_platform;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE stakeholder_role AS ENUM ('owner', 'architect', 'contractor', 'engineer', 'consultant', 'inspector', 'site_manager', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE element_status AS ENUM ('planned', 'design_approved', 'procurement', 'in_progress', 'completed', 'on_hold', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role stakeholder_role NOT NULL DEFAULT 'contractor',
    company VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for JWT management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(512) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id),
    status project_status DEFAULT 'planning',
    total_budget DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'USD',
    start_date DATE,
    expected_completion DATE,
    dao_address VARCHAR(42),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project roles table
CREATE TABLE IF NOT EXISTS project_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    role stakeholder_role NOT NULL,
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    voting_power INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, project_id, role)
);

-- Construction elements table
CREATE TABLE IF NOT EXISTS construction_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    element_type VARCHAR(100) NOT NULL,
    element_name VARCHAR(255) NOT NULL,
    ifc_id VARCHAR(255),
    properties JSONB DEFAULT '{}',
    status element_status DEFAULT 'planned',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Uploaded IFC files table for tracking model imports
CREATE TABLE IF NOT EXISTS uploaded_ifc_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    speckle_stream_id VARCHAR(255),
    upload_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploaded_ifc_files_project ON uploaded_ifc_files(project_id);

-- DAO templates table
CREATE TABLE IF NOT EXISTS dao_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    template_data JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Manufacturer products table
CREATE TABLE IF NOT EXISTS manufacturer_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturer_name VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    specifications JSONB DEFAULT '{}',
    base_price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    availability_status VARCHAR(50) DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_roles_user ON project_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_project_roles_project ON project_roles(project_id);
CREATE INDEX IF NOT EXISTS idx_construction_elements_project ON construction_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_construction_elements_type ON construction_elements(element_type);
CREATE INDEX IF NOT EXISTS idx_dao_templates_category ON dao_templates(category);
CREATE INDEX IF NOT EXISTS idx_manufacturer_products_category ON manufacturer_products(category);

-- Insert demo users
INSERT INTO users (email, full_name, password_hash, role, company) VALUES
('owner@demo.com', 'John Thompson', '$2a$10$rQ8kzKk5zJ5k5k5k5k5k5uX5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5', 'owner', 'Thompson Development Group'),
('architect@demo.com', 'Sarah Johnson', '$2a$10$rQ8kzKk5zJ5k5k5k5k5k5uX5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5', 'architect', 'Johnson Architecture'),
('contractor@demo.com', 'Mike Rodriguez', '$2a$10$rQ8kzKk5zJ5k5k5k5k5k5uX5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5', 'contractor', 'Rodriguez Construction'),
('engineer@demo.com', 'Emily Chen', '$2a$10$rQ8kzKk5zJ5k5k5k5k5k5uX5k5k5k5k5k5k5k5k5k5k5k5k5k5k5k5', 'engineer', 'Chen Structural Engineering')
ON CONFLICT (email) DO NOTHING;

-- Insert demo project
INSERT INTO projects (name, description, owner_id, status, total_budget, start_date, expected_completion) VALUES
('Downtown Office Complex', 'Modern 20-story office building with sustainable design', 
 (SELECT id FROM users WHERE email = 'owner@demo.com'), 
 'active', 15000000.00, '2025-01-01', '2026-06-30')
ON CONFLICT DO NOTHING;

-- Insert demo construction elements
INSERT INTO construction_elements (project_id, element_type, element_name, ifc_id, properties) VALUES
((SELECT id FROM projects WHERE name = 'Downtown Office Complex'), 'IfcWall', 'Exterior Wall - North', 'WALL_001', '{"material": "Concrete", "thickness": 300, "height": 3000}'),
((SELECT id FROM projects WHERE name = 'Downtown Office Complex'), 'IfcSlab', 'Ground Floor Slab', 'SLAB_001', '{"material": "Reinforced Concrete", "thickness": 200, "area": 1200}'),
((SELECT id FROM projects WHERE name = 'Downtown Office Complex'), 'IfcBeam', 'Main Support Beam', 'BEAM_001', '{"material": "Steel", "section": "IPE300", "length": 8000}'),
((SELECT id FROM projects WHERE name = 'Downtown Office Complex'), 'IfcColumn', 'Structural Column', 'COL_001', '{"material": "Steel", "section": "HEB400", "height": 3000}');

-- Insert demo DAO templates
INSERT INTO dao_templates (template_name, category, version, template_data) VALUES
('Sustainability Assessment Template', 'Environmental', '2.1', '{"governance": {"voting_threshold": 0.67, "quorum": 0.5}, "access_control": {"read_roles": ["owner", "architect"], "write_roles": ["owner"]}}'),
('Safety Compliance Template', 'Safety', '1.5', '{"governance": {"voting_threshold": 0.75, "quorum": 0.6}, "access_control": {"read_roles": ["all"], "write_roles": ["contractor", "engineer"]}}'),
('Quality Control Template', 'Quality', '3.0', '{"governance": {"voting_threshold": 0.6, "quorum": 0.4}, "access_control": {"read_roles": ["all"], "write_roles": ["architect", "engineer"]}}');

-- Insert demo manufacturer products
INSERT INTO manufacturer_products (manufacturer_name, product_name, category, specifications, base_price) VALUES
('SteelTech Industries', 'Steel I-Beam 200mm', 'Structural Steel', '{"material": "S355", "yield_strength": 355, "length": 6000}', 125.50),
('ConcreteMax', 'High-Performance Concrete Mix', 'Concrete', '{"strength": "C30/37", "cement_type": "CEM I", "admixtures": ["plasticizer"]}', 85.00),
('GlassTech Solutions', 'Double-Glazed Window Unit', 'Windows', '{"glazing": "Low-E", "frame": "Aluminum", "thermal_rating": 1.2}', 285.75),
('InsulPro Materials', 'Thermal Insulation Board', 'Insulation', '{"material": "XPS", "thickness": 100, "thermal_conductivity": 0.034}', 45.25);

-- Create waitlist table for landing page
CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'landing_page'
);

-- Create index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at);

COMMIT;
