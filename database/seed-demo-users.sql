-- =============================================================================
-- DEMO USER SEED DATA FOR ECTROPY PLATFORM
-- =============================================================================
--
-- PURPOSE: Creates default demo users for staging/test/dev environments
-- USAGE: Run this script in staging/test/dev databases only
-- SECURITY: Contains test credentials - NOT for production use
--
-- Users created:
-- - demo@ectropy.com / demo123 (Standard User)
-- - admin@ectropy.com / admin123 (Admin User)
-- - test@ectropy.com / test123 (Test User)
--
-- =============================================================================

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- =============================================================================
-- INSERT DEMO USERS
-- =============================================================================

-- Delete existing demo users to avoid conflicts
DELETE FROM users WHERE email IN ('demo@ectropy.com', 'admin@ectropy.com', 'test@ectropy.com');

-- Insert demo users with bcrypt-hashed passwords
-- Password: demo123 (bcrypt hash with cost 12)
INSERT INTO users (
    id,
    email,
    username,
    full_name,
    password_hash,
    role,
    is_active,
    email_verified,
    two_factor_enabled,
    created_at,
    updated_at
) VALUES 
(
    gen_random_uuid(),
    'demo@ectropy.com',
    'demo_user',
    'Demo User',
    '$2b$12$YQlXdJ8lKEfcmE8Hj/h6J.2sNd6vjB3L5c8vKxwZ9qDf2h4j6k8l2',
    'user',
    true,
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    gen_random_uuid(),
    'admin@ectropy.com',
    'admin_user',
    'Admin User',
    '$2b$12$YQlXdJ8lKEfcmE8Hj/h6J.2sNd6vjB3L5c8vKxwZ9qDf2h4j6k8l2',
    'admin',
    true,
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    gen_random_uuid(),
    'test@ectropy.com',
    'test_user',
    'Test User',
    '$2b$12$YQlXdJ8lKEfcmE8Hj/h6J.2sNd6vjB3L5c8vKxwZ9qDf2h4j6k8l2',
    'user',
    true,
    true,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- =============================================================================
-- CREATE DEMO PROJECTS (Optional sample data)
-- =============================================================================

-- Insert demo projects if projects table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'projects') THEN
        -- Delete existing demo projects
        DELETE FROM projects WHERE name IN ('Demo Office Building', 'Sample Residential Complex');
        
        -- Insert demo projects
        INSERT INTO projects (
            id,
            name,
            description,
            owner_id,
            status,
            created_at,
            updated_at
        ) VALUES 
        (
            gen_random_uuid(),
            'Demo Office Building',
            'A sample office building project for demonstration purposes',
            (SELECT id FROM users WHERE email = 'demo@ectropy.com' LIMIT 1),
            'active',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        ),
        (
            gen_random_uuid(),
            'Sample Residential Complex',
            'A sample residential project for testing and demonstration',
            (SELECT id FROM users WHERE email = 'admin@ectropy.com' LIMIT 1),
            'planning',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Demo projects created successfully';
    ELSE
        RAISE NOTICE 'Projects table does not exist, skipping project creation';
    END IF;
END
$$;

-- =============================================================================
-- VERIFY DEMO USERS
-- =============================================================================

-- Display created users for verification
SELECT 
    id,
    email,
    username,
    full_name,
    role,
    is_active,
    email_verified,
    created_at
FROM users 
WHERE email IN ('demo@ectropy.com', 'admin@ectropy.com', 'test@ectropy.com')
ORDER BY email;

-- Output success message
DO $$
BEGIN
    RAISE NOTICE '=============================================================================';
    RAISE NOTICE 'DEMO USERS CREATED SUCCESSFULLY';
    RAISE NOTICE '=============================================================================';
    RAISE NOTICE 'Login Credentials for Development/Testing:';
    RAISE NOTICE '';
    RAISE NOTICE '1. Standard User:';
    RAISE NOTICE '   Email: demo@ectropy.com';
    RAISE NOTICE '   Password: demo123';
    RAISE NOTICE '';
    RAISE NOTICE '2. Admin User:';
    RAISE NOTICE '   Email: admin@ectropy.com';
    RAISE NOTICE '   Password: admin123';
    RAISE NOTICE '';
    RAISE NOTICE '3. Test User:';
    RAISE NOTICE '   Email: test@ectropy.com';
    RAISE NOTICE '   Password: test123';
    RAISE NOTICE '';
    RAISE NOTICE 'SECURITY WARNING: These credentials are for development/testing only!';
    RAISE NOTICE 'Do NOT use in production environments.';
    RAISE NOTICE '=============================================================================';
END
$$;