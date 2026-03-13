-- =============================================================================
-- Fix Erik's Project Permissions — Staging
-- =============================================================================
-- Date:    2026-03-13
-- User:    erik@luh.tech (ID: 73cebffb-08e6-4608-9350-08f906131139)
-- Role:    OWNER (StakeholderRole enum — confirmed in schema.prisma)
-- Columns: id, user_id, project_id, role, permissions, voting_power, is_active, assigned_at
-- Unique constraint: (user_id, project_id, role)
-- =============================================================================
--
-- HOW TO RUN:
--   1. SSH into staging droplet
--   2. Find the api-gateway container:
--        CONTAINER=$(docker ps --format '{{.Names}}' | grep api | head -1)
--   3. Run this script:
--        docker exec -i $CONTAINER node -e "
--          const {Pool} = require('pg');
--          const pool = new Pool({connectionString: process.env.DATABASE_URL.replace(/sslmode=[^&]*/g,''), ssl:{rejectUnauthorized:false}});
--          const fs = require('fs');
--          const sql = fs.readFileSync('/dev/stdin','utf8');
--          pool.query(sql).then(r => { console.log('Rows affected:', r.rowCount); pool.end(); })
--            .catch(e => { console.log('ERR:', e.message); pool.end(); });
--        " < fix-erik-permissions.sql
--
--   OR run each INSERT directly via node one-liner (see bottom of file).
-- =============================================================================

BEGIN;

-- Project 1: My First Project (25 demo voxels seeded)
INSERT INTO project_roles (id, user_id, project_id, role, permissions, voting_power, is_active, assigned_at)
VALUES (
  gen_random_uuid(),
  '73cebffb-08e6-4608-9350-08f906131139',
  'ac601e7d-af1c-4533-8926-157dad523150',
  'OWNER',
  ARRAY['admin', 'read', 'write', 'delete', 'manage_members']::text[],
  100,
  true,
  NOW()
)
ON CONFLICT (user_id, project_id, role) DO UPDATE SET is_active = true;

-- Project 2: Demo Office Building
INSERT INTO project_roles (id, user_id, project_id, role, permissions, voting_power, is_active, assigned_at)
VALUES (
  gen_random_uuid(),
  '73cebffb-08e6-4608-9350-08f906131139',
  'dc1eaa5b-7553-46ec-92a5-e20762a60c71',
  'OWNER',
  ARRAY['admin', 'read', 'write', 'delete', 'manage_members']::text[],
  100,
  true,
  NOW()
)
ON CONFLICT (user_id, project_id, role) DO UPDATE SET is_active = true;

-- Project 3: Sample Residential Complex
INSERT INTO project_roles (id, user_id, project_id, role, permissions, voting_power, is_active, assigned_at)
VALUES (
  gen_random_uuid(),
  '73cebffb-08e6-4608-9350-08f906131139',
  '47fd3a1b-10ac-40b2-aeef-e58fdfe7c523',
  'OWNER',
  ARRAY['admin', 'read', 'write', 'delete', 'manage_members']::text[],
  100,
  true,
  NOW()
)
ON CONFLICT (user_id, project_id, role) DO UPDATE SET is_active = true;

COMMIT;

-- =============================================================================
-- Verify after running:
-- =============================================================================
-- SELECT pr.project_id, pr.role, pr.is_active, p.name
-- FROM project_roles pr
-- JOIN projects p ON p.id = pr.project_id
-- WHERE pr.user_id = '73cebffb-08e6-4608-9350-08f906131139';
-- =============================================================================

-- =============================================================================
-- ALTERNATIVE: One-liner for direct execution on droplet
-- =============================================================================
-- CONTAINER=$(docker ps --format '{{.Names}}' | grep api | head -1)
-- docker exec -w /app $CONTAINER node -e "
-- const {Pool} = require('pg');
-- const pool = new Pool({connectionString: process.env.DATABASE_URL.replace(/sslmode=[^&]*/g,''), ssl:{rejectUnauthorized:false}});
-- const projects = ['ac601e7d-af1c-4533-8926-157dad523150','dc1eaa5b-7553-46ec-92a5-e20762a60c71','47fd3a1b-10ac-40b2-aeef-e58fdfe7c523'];
-- (async () => {
--   for (const pid of projects) {
--     const r = await pool.query(\`INSERT INTO project_roles (id, user_id, project_id, role, permissions, voting_power, is_active, assigned_at) VALUES (gen_random_uuid(), '73cebffb-08e6-4608-9350-08f906131139', \\\$1, 'OWNER', ARRAY['admin','read','write','delete','manage_members']::text[], 100, true, NOW()) ON CONFLICT (user_id, project_id, role) DO UPDATE SET is_active = true\`, [pid]);
--     console.log(pid, '→', r.rowCount, 'row(s)');
--   }
--   const verify = await pool.query('SELECT pr.project_id, pr.role, pr.is_active, p.name FROM project_roles pr JOIN projects p ON p.id = pr.project_id WHERE pr.user_id = \\'73cebffb-08e6-4608-9350-08f906131139\\'');
--   verify.rows.forEach(r => console.log(r.name, '→', r.role, r.is_active ? '✓' : '✗'));
--   pool.end();
-- })().catch(e => { console.log('ERR:', e.message); pool.end(); });
-- "
