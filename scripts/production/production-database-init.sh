#!/bin/bash

# Production Database Initialization Script
# Sets up the production database with required extensions and schemas

set -euo pipefail

echo "🗄️ Initializing Ectropy Production Database"
echo "============================================"

# Enable required PostgreSQL extensions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create required extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "postgis";
    CREATE EXTENSION IF NOT EXISTS "postgis_topology";
    CREATE EXTENSION IF NOT EXISTS "postgis_sfcgal";
    CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";
    CREATE EXTENSION IF NOT EXISTS "postgis_tiger_geocoder";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    -- Create application schemas
    CREATE SCHEMA IF NOT EXISTS "ectropy";
    CREATE SCHEMA IF NOT EXISTS "speckle";
    CREATE SCHEMA IF NOT EXISTS "analytics";

    -- Set up permissions
    GRANT ALL PRIVILEGES ON SCHEMA ectropy TO "$POSTGRES_USER";
    GRANT ALL PRIVILEGES ON SCHEMA speckle TO "$POSTGRES_USER";
    GRANT ALL PRIVILEGES ON SCHEMA analytics TO "$POSTGRES_USER";

    -- Create readonly user for monitoring
    CREATE USER ectropy_readonly WITH PASSWORD 'readonly_monitor_pass';
    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO ectropy_readonly;
    GRANT USAGE ON SCHEMA ectropy TO ectropy_readonly;
    GRANT USAGE ON SCHEMA speckle TO ectropy_readonly;
    GRANT USAGE ON SCHEMA analytics TO ectropy_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA ectropy TO ectropy_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA speckle TO ectropy_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO ectropy_readonly;

    -- Configure performance settings
    ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
    ALTER SYSTEM SET track_activities = on;
    ALTER SYSTEM SET track_counts = on;
    ALTER SYSTEM SET track_io_timing = on;
    ALTER SYSTEM SET log_statement = 'mod';
    ALTER SYSTEM SET log_min_duration_statement = 1000;

    -- Spatial reference systems for construction projects
    INSERT INTO spatial_ref_sys (srid, auth_name, auth_srid, proj4text, srtext)
    VALUES (
        99999,
        'ECTROPY',
        99999,
        '+proj=tmerc +lat_0=0 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
        'PROJCS["Ectropy Local Grid",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1]]'
    ) ON CONFLICT (srid) DO NOTHING;

    -- Create monitoring views
    CREATE OR REPLACE VIEW monitor.database_size AS
    SELECT 
        pg_database.datname,
        pg_size_pretty(pg_database_size(pg_database.datname)) AS size
    FROM pg_database;

    CREATE OR REPLACE VIEW monitor.connection_stats AS
    SELECT 
        datname,
        state,
        count(*) as connections
    FROM pg_stat_activity
    GROUP BY datname, state;

    -- Log successful initialization
    INSERT INTO ectropy.system_log (event, details, created_at)
    VALUES ('database_initialized', 'Production database setup complete', NOW())
    ON CONFLICT DO NOTHING;

EOSQL

echo "✅ Production database initialization complete"
echo "   - PostGIS extensions enabled"
echo "   - Application schemas created"
echo "   - Monitoring user configured"
echo "   - Performance settings applied"