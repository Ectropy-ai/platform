-- =============================================================================
-- ENTERPRISE POSTGRES INITIALIZATION - DEVELOPMENT ENVIRONMENT
-- =============================================================================
-- This script creates all required databases for the Ectropy platform
-- Optimized for Docker postgres:15-alpine with locale=C
-- Idempotent: Safe to run multiple times
-- =============================================================================

-- Disable error stop to handle "database already exists" gracefully
\set ON_ERROR_STOP off

-- Create ectropy_dev database (main application database)
-- Note: POSTGRES_DB creates this automatically, but we include it for completeness
CREATE DATABASE ectropy_dev WITH
    ENCODING 'UTF8'
    LC_COLLATE='C'
    LC_CTYPE='C';

-- Create speckle database (BIM integration - required by Speckle Server)
CREATE DATABASE speckle WITH
    ENCODING 'UTF8'
    LC_COLLATE='C'
    LC_CTYPE='C';

-- Re-enable error stop for remaining statements
\set ON_ERROR_STOP on

-- Connect to ectropy_dev and set up extensions
\c ectropy_dev;

-- Enable required extensions for Ectropy application
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create health check table
CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial health check entry
INSERT INTO health_check (service_name, status)
VALUES ('database', 'healthy')
ON CONFLICT DO NOTHING;

-- Connect to speckle database and set up extensions
\c speckle;

-- Enable required extensions for Speckle Server
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Grant all privileges to postgres user (superuser in development)
GRANT ALL PRIVILEGES ON DATABASE speckle TO postgres;
GRANT ALL ON SCHEMA public TO postgres;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;

-- Performance optimizations for BIM data (development settings)
ALTER DATABASE speckle SET default_statistics_target = 100;
ALTER DATABASE speckle SET work_mem = '8MB';
ALTER DATABASE speckle SET maintenance_work_mem = '32MB';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '=== ENTERPRISE DATABASE INITIALIZATION COMPLETE ===';
    RAISE NOTICE 'Created databases: ectropy_dev, speckle';
    RAISE NOTICE 'Speckle extensions: uuid-ossp, pg_trgm, btree_gin';
    RAISE NOTICE 'Environment: DEVELOPMENT';
END $$;
