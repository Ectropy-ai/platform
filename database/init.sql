-- Enterprise PostgreSQL Initialization for Ectropy Platform
-- This ensures proper database setup for production deployment

-- Create the main ectropy database with proper encoding
CREATE DATABASE ectropy_production WITH ENCODING 'UTF8' LC_COLLATE='en_US.utf8' LC_CTYPE='en_US.utf8';

-- Create the speckle database with proper encoding  
CREATE DATABASE speckle WITH ENCODING 'UTF8' LC_COLLATE='en_US.utf8' LC_CTYPE='en_US.utf8';

-- Create users with proper permissions
CREATE USER ectropy WITH ENCRYPTED PASSWORD '${ECTROPY_DB_PASSWORD}';
CREATE USER speckle WITH ENCRYPTED PASSWORD '${SPECKLE_POSTGRES_PASSWORD}';

-- Create root role if applications expect it (for compatibility) - Enhanced Version with Enterprise Error Handling
DO $$
DECLARE
    role_exists BOOLEAN;
    db_ectropy_exists BOOLEAN;
    db_speckle_exists BOOLEAN;
    db_postgres_exists BOOLEAN;
BEGIN
    -- Problem Statement Requirement: Explicit checks and verification before proceeding
    -- Check if role already exists
    SELECT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'root') INTO role_exists;
    
    -- Check if databases exist before granting permissions
    SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'ectropy_production') INTO db_ectropy_exists;
    SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'speckle') INTO db_speckle_exists;
    SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'postgres') INTO db_postgres_exists;
    
    -- Problem Statement Requirement: Idempotent role creation with proper sequencing
    IF NOT role_exists THEN
        -- Create the root role with LOGIN privilege and comprehensive permissions
        CREATE ROLE root WITH LOGIN ENCRYPTED PASSWORD '${ROOT_DB_PASSWORD}';
        RAISE NOTICE 'Root role created successfully';
        
        -- Problem Statement Requirement: Use correct PostgreSQL syntax (ALTER ROLE instead of GRANT)
        -- Grant database creation privileges (using correct PostgreSQL syntax)
        ALTER ROLE root CREATEDB;
        ALTER ROLE root CREATEROLE;
        
        -- Grant connect privileges to databases that exist
        IF db_postgres_exists THEN
            GRANT CONNECT ON DATABASE postgres TO root;
            GRANT ALL PRIVILEGES ON DATABASE postgres TO root;
        END IF;
        
        IF db_ectropy_exists THEN
            GRANT CONNECT ON DATABASE ectropy_production TO root;
            GRANT ALL PRIVILEGES ON DATABASE ectropy_production TO root;
        END IF;
        
        IF db_speckle_exists THEN
            GRANT CONNECT ON DATABASE speckle TO root;
            GRANT ALL PRIVILEGES ON DATABASE speckle TO root;
        END IF;
        
        -- Grant schema-level permissions
        GRANT USAGE ON SCHEMA public TO root;
        GRANT CREATE ON SCHEMA public TO root;
        
        RAISE NOTICE 'Root role created successfully with comprehensive privileges';
    ELSE
        RAISE NOTICE 'Root role already exists, updating permissions...';
        
        -- Problem Statement Requirement: Ensure idempotent updates
        -- Ensure existing role has correct permissions
        IF db_postgres_exists THEN
            GRANT CONNECT ON DATABASE postgres TO root;
            GRANT ALL PRIVILEGES ON DATABASE postgres TO root;
        END IF;
        
        IF db_ectropy_exists THEN
            GRANT CONNECT ON DATABASE ectropy_production TO root;
            GRANT ALL PRIVILEGES ON DATABASE ectropy_production TO root;
        END IF;
        
        IF db_speckle_exists THEN
            GRANT CONNECT ON DATABASE speckle TO root;
            GRANT ALL PRIVILEGES ON DATABASE speckle TO root;
        END IF;
        
        -- Ensure role attributes are correct using proper PostgreSQL syntax
        ALTER ROLE root CREATEDB;
        ALTER ROLE root CREATEROLE;
        
        RAISE NOTICE 'Root role permissions updated successfully';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Problem Statement Requirement: Detailed error logging with context
        RAISE WARNING 'Error in root role creation/update (File: database/init.sql, Location: root role creation block): %', SQLERRM;
        -- Continue execution but log the error for debugging
END
$$;


-- Create root database if applications expect it (for test compatibility) - Enhanced Version
-- Database creation must be done outside of transactions
\set ON_ERROR_STOP off
CREATE DATABASE root WITH OWNER root ENCODING 'UTF8' LC_COLLATE='en_US.utf8' LC_CTYPE='en_US.utf8';
\set ON_ERROR_STOP on

-- Grant permissions on root database to root user - Enhanced Version  
DO $$
DECLARE
    db_exists BOOLEAN;
    root_role_exists BOOLEAN;
BEGIN
    -- Check if database and role exist
    SELECT EXISTS (SELECT FROM pg_database WHERE datname = 'root') INTO db_exists;
    SELECT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'root') INTO root_role_exists;
    
    IF db_exists AND root_role_exists THEN
        -- Grant comprehensive permissions on root database
        GRANT ALL PRIVILEGES ON DATABASE root TO root;
        GRANT ALL PRIVILEGES ON DATABASE root TO postgres;
        
        -- Grant connect privilege specifically
        GRANT CONNECT ON DATABASE root TO root;
        
        RAISE NOTICE 'Root database permissions granted successfully';
    ELSIF NOT db_exists THEN
        RAISE NOTICE 'Root database does not exist, skipping root database permissions';
    ELSIF NOT root_role_exists THEN
        RAISE NOTICE 'Root role does not exist, skipping root database permissions';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to grant root database permissions: %', SQLERRM;
        -- Continue execution but log the error
END
$$;

-- Grant all privileges to users
GRANT ALL PRIVILEGES ON DATABASE ectropy_production TO ectropy;
GRANT ALL PRIVILEGES ON DATABASE ectropy_production TO postgres;
GRANT ALL PRIVILEGES ON DATABASE speckle TO speckle;

-- Connect to ectropy_production database and set up extensions
\c ectropy_production;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Connect to speckle database and set up extensions
\c speckle;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Grant schema permissions to speckle user
GRANT ALL ON SCHEMA public TO speckle;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO speckle;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO speckle;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO speckle;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO speckle;
