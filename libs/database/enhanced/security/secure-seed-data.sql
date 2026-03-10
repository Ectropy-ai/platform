-- Enhanced Seed Data with Security Best Practices
-- Phase 1.1: Secure Initial Data Setup
-- WARNING: Replace DEMO_PASSWORD with secure environment variable in production

-- Create secure test users with proper password hashing
-- Note: DEMO_PASSWORD should be set via environment variable, not hardcoded
INSERT INTO users (id, username, email, password_hash, salt, role, is_active, two_factor_enabled) VALUES
(
    uuid_generate_v4(),
    'alice_architect',
    'alice@construction.com',
    crypt(COALESCE(current_setting('app.demo_password', true), 'CHANGE_IN_PRODUCTION'), gen_salt('bf', 12)),
    gen_salt('bf', 12),
    'architect',
    true,
    false
),
(
    uuid_generate_v4(),
    'bob_engineer',
    'bob@engineering.com',
    crypt(COALESCE(current_setting('app.demo_password', true), 'CHANGE_IN_PRODUCTION'), gen_salt('bf', 12)),
    gen_salt('bf', 12),
    'engineer',
    true,
    false
),
(
    uuid_generate_v4(),
    'carol_contractor',
    'carol@contracting.com',
    crypt(COALESCE(current_setting('app.demo_password', true), 'CHANGE_IN_PRODUCTION'), gen_salt('bf', 12)),
    gen_salt('bf', 12),
    'contractor',
    true,
    false
),
(
    uuid_generate_v4(),
    'david_owner',
    'david@property.com',
    crypt(COALESCE(current_setting('app.demo_password', true), 'CHANGE_IN_PRODUCTION'), gen_salt('bf', 12)),
    gen_salt('bf', 12),
    'owner',
    true,
    false
),
(
    uuid_generate_v4(),
    'admin_user',
    'admin@ectropy.com',
    crypt(COALESCE(current_setting('app.admin_password', true), 'CHANGE_ADMIN_PASSWORD_IN_PRODUCTION'), gen_salt('bf', 12)),
    gen_salt('bf', 12),
    'admin',
    true,
    true
);

-- Create sample projects with enhanced metadata
INSERT INTO projects (id, name, description, owner_id, status, project_type, budget, start_date, end_date, location, metadata) VALUES
(
    uuid_generate_v4(),
    'Green Office Complex',
    'Sustainable office building with LEED certification',
    (SELECT id FROM users WHERE username = 'alice_architect'),
    'active',
    'Commercial Office',
    2500000.00,
    '2024-01-01',
    '2024-12-31',
    'Downtown District',
    '{"sustainability_rating": 5, "leed_target": "Gold", "square_footage": 50000, "floors": 8}'::jsonb
),
(
    uuid_generate_v4(),
    'Residential Tower',
    'Mixed-use residential and retail development',
    (SELECT id FROM users WHERE username = 'bob_engineer'),
    'active',
    'Residential',
    5000000.00,
    '2024-02-01',
    '2025-06-30',
    'Riverside Area',
    '{"units": 120, "retail_space": 5000, "parking_spaces": 150, "amenities": ["gym", "rooftop_garden", "concierge"]}'::jsonb
);

-- Create comprehensive materials catalog
INSERT INTO materials (id, name, description, category, unit, cost_per_unit, supplier_info, sustainability_rating, carbon_footprint) VALUES
(
    uuid_generate_v4(),
    'Steel I-Beam Grade 50',
    'High-strength structural steel beam',
    'Structural Steel',
    'linear_foot',
    125.50,
    '{"supplier": "Advanced Steel Corp", "lead_time_days": 14, "certifications": ["AISC", "ISO9001"]}'::jsonb,
    3,
    2.45
),
(
    uuid_generate_v4(),
    'Concrete 4000 PSI',
    'High-strength concrete mix',
    'Concrete',
    'cubic_yard',
    95.00,
    '{"supplier": "Metro Concrete", "lead_time_days": 7, "additives": ["fly_ash", "plasticizer"]}'::jsonb,
    4,
    0.89
),
(
    uuid_generate_v4(),
    'Insulation R-30 Fiberglass',
    'Energy-efficient building insulation',
    'Insulation',
    'square_foot',
    2.75,
    '{"supplier": "EcoInsulation Inc", "lead_time_days": 10, "certifications": ["GREENGUARD", "ENERGY_STAR"]}'::jsonb,
    5,
    0.15
),
(
    uuid_generate_v4(),
    'Low-E Glass Panels',
    'Energy-efficient window glass',
    'Glass',
    'square_foot',
    25.00,
    '{"supplier": "Crystal Clear Glass", "lead_time_days": 21, "specifications": {"u_value": 0.25, "solar_heat_gain": 0.35}}'::jsonb,
    5,
    0.85
);

-- Link materials to projects
INSERT INTO project_materials (project_id, material_id, quantity, unit_cost, procurement_status, delivery_date) VALUES
(
    (SELECT id FROM projects WHERE name = 'Green Office Complex'),
    (SELECT id FROM materials WHERE name = 'Steel I-Beam Grade 50'),
    500.00,
    125.50,
    'ordered',
    '2024-02-15'
),
(
    (SELECT id FROM projects WHERE name = 'Green Office Complex'),
    (SELECT id FROM materials WHERE name = 'Concrete 4000 PSI'),
    2000.00,
    95.00,
    'planned',
    '2024-03-01'
),
(
    (SELECT id FROM projects WHERE name = 'Residential Tower'),
    (SELECT id FROM materials WHERE name = 'Insulation R-30 Fiberglass'),
    15000.00,
    2.75,
    'planned',
    '2024-04-01'
);

-- Create initial audit log entry
INSERT INTO audit_logs (user_id, table_name, operation, new_values, ip_address) VALUES
(
    (SELECT id FROM users WHERE username = 'admin_user'),
    'users',
    'INSERT',
    '{"action": "initial_seed_data", "timestamp": "' || CURRENT_TIMESTAMP || '"}'::jsonb,
    '127.0.0.1'::inet
);

COMMIT;
