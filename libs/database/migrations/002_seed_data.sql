-- Migration 002: Seed data for production deployment
-- Create initial users with hashed passwords and sample project data

-- Insert users with properly hashed passwords
-- Note: In production, these should be generated with a proper password hashing library
INSERT INTO users (email, password_hash, role, username, created_at) VALUES
  ('architect@ectropy.com', '$2a$10$rZNMuuZvILEGEKxPT6QCMe1GMxK6vQHY.FHKmIVs6E5IjI9SgqPJO', 'architect', 'Demo Architect', NOW()),
  ('engineer@ectropy.com', '$2a$10$rZNMuuZvILEGEKxPT6QCMe1GMxK6vQHY.FHKmIVs6E5IjI9SgqPJO', 'engineer', 'Demo Engineer', NOW()),
  ('contractor@ectropy.com', '$2a$10$rZNMuuZvILEGEKxPT6QCMe1GMxK6vQHY.FHKmIVs6E5IjI9SgqPJO', 'contractor', 'Demo Contractor', NOW()),
  ('owner@ectropy.com', '$2a$10$rZNMuuZvILEGEKxPT6QCMe1GMxK6vQHY.FHKmIVs6E5IjI9SgqPJO', 'owner', 'Demo Owner', NOW())
ON CONFLICT (email) DO NOTHING;

-- Create sample project
INSERT INTO projects (id, name, description, budget, status, created_at) VALUES
  ('proj-001', 'Demo Construction Project', 'Modern office building with sustainable features', 950000, 'active', NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  budget = EXCLUDED.budget,
  status = EXCLUDED.status;

-- Add project stakeholder relationships
INSERT INTO project_stakeholders (project_id, user_id, role) 
SELECT 'proj-001', u.id, u.role::stakeholder_role
FROM users u 
WHERE u.email IN ('architect@ectropy.com', 'engineer@ectropy.com', 'contractor@ectropy.com', 'owner@ectropy.com')
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Add BIM elements to the project
INSERT INTO project_elements (id, project_id, element_type, name, properties, geometry, status, created_at) VALUES
  (
    'elem-001',
    'proj-001', 
    'IFCWALL',
    'Exterior Wall - North',
    '{
      "material": "Concrete Block",
      "thickness": 200,
      "height": 3000,
      "length": 8000,
      "fireRating": "2-hour",
      "thermalResistance": "R-15"
    }'::jsonb,
    '{
      "position": {"x": 0, "y": 0, "z": 0},
      "rotation": {"x": 0, "y": 0, "z": 0},
      "scale": {"x": 1, "y": 1, "z": 1},
      "dimensions": {"width": 8000, "height": 3000, "depth": 200}
    }'::jsonb,
    'approved',
    NOW()
  ),
  (
    'elem-002',
    'proj-001',
    'IFCBEAM',
    'Structural Beam - B1',
    '{
      "material": "Steel",
      "profile": "H-300x200",
      "length": 6000,
      "loadCapacity": 15000,
      "grade": "Grade 50",
      "coating": "Fire-resistant"
    }'::jsonb,
    '{
      "position": {"x": 4000, "y": 0, "z": 3000},
      "rotation": {"x": 0, "y": 0, "z": 90},
      "scale": {"x": 1, "y": 1, "z": 1},
      "dimensions": {"width": 300, "height": 200, "length": 6000}
    }'::jsonb,
    'in-review',
    NOW()
  ),
  (
    'elem-003',
    'proj-001',
    'IFCCOLUMN',
    'Concrete Column - C1',
    '{
      "material": "Reinforced Concrete",
      "height": 3500,
      "crossSection": "400x400",
      "reinforcement": "8#25M",
      "concreteGrade": "C30/37"
    }'::jsonb,
    '{
      "position": {"x": 2000, "y": 2000, "z": 0},
      "rotation": {"x": 0, "y": 0, "z": 0},
      "scale": {"x": 1, "y": 1, "z": 1},
      "dimensions": {"width": 400, "height": 3500, "depth": 400}
    }'::jsonb,
    'approved',
    NOW()
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  properties = EXCLUDED.properties,
  geometry = EXCLUDED.geometry,
  status = EXCLUDED.status;

-- Create sample DAO proposals
INSERT INTO proposals (id, title, description, type, status, proposer_id, votes_for, votes_against, votes_abstain, voting_start, voting_end, created_at) VALUES
  (
    'prop-001',
    'Enhanced Material Access Template',
    'Proposal to expand material specification access for engineers to include advanced composite materials and sustainability metrics.',
    'material_access',
    'voting',
    (SELECT id FROM users WHERE email = 'engineer@ectropy.com' LIMIT 1),
    12,
    3,
    1,
    NOW() - INTERVAL '5 days',
    NOW() + INTERVAL '10 days',
    NOW() - INTERVAL '5 days'
  ),
  (
    'prop-002',
    'Budget Allocation for Phase 2',
    'Authorize additional $250k budget for foundation work including deep foundation analysis and soil stabilization measures.',
    'budget_allocation',
    'passed',
    (SELECT id FROM users WHERE email = 'contractor@ectropy.com' LIMIT 1),
    18,
    2,
    0,
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '20 days'
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  status = EXCLUDED.status;

-- Add proposal votes for transparency
INSERT INTO proposal_votes (proposal_id, user_id, vote_type, created_at) VALUES
  -- Votes for prop-001 (Enhanced Material Access)
  ('prop-001', (SELECT id FROM users WHERE email = 'architect@ectropy.com'), 'for', NOW() - INTERVAL '4 days'),
  ('prop-001', (SELECT id FROM users WHERE email = 'engineer@ectropy.com'), 'for', NOW() - INTERVAL '3 days'),
  ('prop-001', (SELECT id FROM users WHERE email = 'contractor@ectropy.com'), 'against', NOW() - INTERVAL '2 days'),
  ('prop-001', (SELECT id FROM users WHERE email = 'owner@ectropy.com'), 'for', NOW() - INTERVAL '1 day'),
  
  -- Votes for prop-002 (Budget Allocation)
  ('prop-002', (SELECT id FROM users WHERE email = 'architect@ectropy.com'), 'for', NOW() - INTERVAL '15 days'),
  ('prop-002', (SELECT id FROM users WHERE email = 'engineer@ectropy.com'), 'for', NOW() - INTERVAL '12 days'),
  ('prop-002', (SELECT id FROM users WHERE email = 'contractor@ectropy.com'), 'for', NOW() - INTERVAL '10 days'),
  ('prop-002', (SELECT id FROM users WHERE email = 'owner@ectropy.com'), 'for', NOW() - INTERVAL '8 days')
ON CONFLICT (proposal_id, user_id) DO NOTHING;

-- Create performance optimization indexes
CREATE INDEX IF NOT EXISTS idx_users_email_active ON users(email) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_elements_project_id ON project_elements(project_id);
CREATE INDEX IF NOT EXISTS idx_project_elements_type ON project_elements(element_type);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_voting_period ON proposals(voting_start, voting_end);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal_id ON proposal_votes(proposal_id);

-- Add JSONB indexes for efficient property queries
CREATE INDEX IF NOT EXISTS idx_project_elements_properties_gin ON project_elements USING gin(properties);
CREATE INDEX IF NOT EXISTS idx_project_elements_geometry_gin ON project_elements USING gin(geometry);

-- Update table statistics for query optimization
ANALYZE users;
ANALYZE projects;
ANALYZE project_elements;
ANALYZE proposals;
ANALYZE proposal_votes;

-- Add helpful comments for maintenance
COMMENT ON TABLE users IS 'Application users with role-based access control';
COMMENT ON TABLE projects IS 'Construction projects with BIM integration';
COMMENT ON TABLE project_elements IS 'IFC-compliant building elements with JSONB properties';
COMMENT ON TABLE proposals IS 'DAO governance proposals with voting mechanism';
COMMENT ON COLUMN project_elements.properties IS 'Material and technical properties in JSONB format';
COMMENT ON COLUMN project_elements.geometry IS 'Spatial positioning and dimensions in JSONB format';