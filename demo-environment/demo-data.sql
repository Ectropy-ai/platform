-- Demo Data for Enterprise Demonstration
-- Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

-- Demo users (passwords should be hashed in production)
INSERT INTO users (email, password_hash, role, name, company, created_at) VALUES
('architect@demo.com', '$2b$10$demo.hash.placeholder.architect', 'architect', 'Alex Architect', 'Design Partners LLC', NOW()),
('engineer@demo.com', '$2b$10$demo.hash.placeholder.engineer', 'engineer', 'Emma Engineer', 'Structural Solutions Inc', NOW()),
('contractor@demo.com', '$2b$10$demo.hash.placeholder.contractor', 'contractor', 'Carlos Contractor', 'BuildRight Construction', NOW()),
('owner@demo.com', '$2b$10$demo.hash.placeholder.owner', 'owner', 'Olivia Owner', 'Property Ventures', NOW())
ON CONFLICT (email) DO NOTHING;

-- Demo projects
INSERT INTO projects (name, description, status, created_by, created_at) VALUES
('Enterprise Office Complex', 'Modern 20-story office building with sustainable design', 'active', 1, NOW()),
('Residential Tower', '45-story luxury residential development', 'planning', 2, NOW()),
('Mixed-Use Development', 'Commercial and residential mixed-use complex', 'design', 1, NOW())
ON CONFLICT DO NOTHING;

-- Demo BIM models
INSERT INTO bim_models (project_id, name, file_path, speckle_url, uploaded_by, created_at) VALUES
(1, 'Structural Frame Model', '/demo/models/structure.ifc', 'https://speckle.xyz/streams/3073b96e86/commits/604bea8cc6', 2, NOW()),
(1, 'Architectural Model', '/demo/models/architecture.ifc', 'https://speckle.xyz/streams/sample/commits/arch', 1, NOW()),
(2, 'MEP Systems Model', '/demo/models/mep.ifc', 'https://speckle.xyz/streams/sample/commits/mep', 2, NOW())
ON CONFLICT DO NOTHING;

-- Demo analysis results
INSERT INTO analysis_results (model_id, analysis_type, results, performed_by, created_at) VALUES
(1, 'structural_analysis', '{"load_capacity": "95%", "safety_factor": 2.1, "compliance": "passed"}', 2, NOW()),
(1, 'energy_efficiency', '{"rating": "A+", "annual_consumption": "125 kWh/m²", "savings": "23%"}', 1, NOW()),
(2, 'cost_estimation', '{"total_cost": "$2.3M", "labor": "$1.1M", "materials": "$1.2M"}', 3, NOW())
ON CONFLICT DO NOTHING;
