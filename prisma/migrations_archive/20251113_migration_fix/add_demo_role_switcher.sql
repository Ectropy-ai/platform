-- Migration: Add Demo Role Switcher Support
-- Description: Convert single role to roles array + add activeRole for demo switching

-- Step 1: Add new columns
ALTER TABLE users ADD COLUMN roles "StakeholderRole"[] DEFAULT ARRAY['contractor']::"StakeholderRole"[];
ALTER TABLE users ADD COLUMN active_role "StakeholderRole";

-- Step 2: Migrate existing role data to roles array
UPDATE users SET roles = ARRAY[role]::"StakeholderRole"[] WHERE role IS NOT NULL;
UPDATE users SET active_role = role WHERE role IS NOT NULL;

-- Step 3: Set default active_role for users without explicit role
UPDATE users SET active_role = 'contractor' WHERE active_role IS NULL;

-- Step 4: Drop old role column (optional - keep for backwards compat initially)
-- ALTER TABLE users DROP COLUMN role;

-- Step 5: Create index for role-based queries
CREATE INDEX idx_users_active_role ON users(active_role);
CREATE INDEX idx_users_roles ON users USING GIN(roles);
