-- =============================================================================
-- UPDATE ERIK USER ROLES FOR DEMO
-- =============================================================================
-- Purpose: Grant all roles to erik@luhtechnology.com for demo/testing
-- Usage: Run this against staging database to enable full role switcher functionality
--
-- This updates the user to have all available roles (matching application dashboards):
-- - owner, architect, contractor, engineer, admin
-- =============================================================================

-- Update erik@luhtechnology.com to have all dashboard roles
UPDATE users
SET
    roles = ARRAY['owner', 'architect', 'contractor', 'engineer', 'admin']::"StakeholderRole"[],
    role = 'owner'::"StakeholderRole",  -- Set primary role to owner
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'erik@luhtechnology.com';

-- Verify the update
SELECT
    email,
    full_name,
    role,
    roles,
    updated_at
FROM users
WHERE email = 'erik@luhtechnology.com';

-- Output confirmation
DO $$
DECLARE
    user_exists boolean;
    user_roles text;
BEGIN
    SELECT EXISTS (SELECT 1 FROM users WHERE email = 'erik@luhtechnology.com') INTO user_exists;

    IF user_exists THEN
        SELECT array_to_string(roles, ', ') INTO user_roles
        FROM users
        WHERE email = 'erik@luhtechnology.com';

        RAISE NOTICE '=============================================================================';
        RAISE NOTICE 'USER ROLES UPDATED SUCCESSFULLY';
        RAISE NOTICE '=============================================================================';
        RAISE NOTICE 'User: erik@luhtechnology.com';
        RAISE NOTICE 'Roles: %', user_roles;
        RAISE NOTICE '';
        RAISE NOTICE 'The role switcher should now allow switching between all roles.';
        RAISE NOTICE 'Refresh your browser at https://staging.ectropy.ai/ to see the changes.';
        RAISE NOTICE '=============================================================================';
    ELSE
        RAISE NOTICE 'WARNING: User erik@luhtechnology.com not found!';
        RAISE NOTICE 'Please log in via OAuth first to create the user account.';
    END IF;
END
$$;
