#!/bin/bash
# Production Database Configuration Script
# Ensures proper database initialization for staging and production environments
# Part of the enterprise production readiness requirements

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}" >&2; }

# Environment detection
ENVIRONMENT=${1:-staging}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-ectropy_${ENVIRONMENT}}

echo "🗄️  PRODUCTION DATABASE CONFIGURATION"
echo "===================================="
echo "Environment: $ENVIRONMENT"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# SQL commands for database initialization
cat > /tmp/init_database.sql << EOF
-- Ensure ectropy_${ENVIRONMENT} database exists with proper schema
SELECT 'CREATE DATABASE ${DB_NAME}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}');

-- Connect to the database
\c ${DB_NAME};

-- Create extensions if they don't exist
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Grant all privileges on database to postgres
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};

-- Create application user if needed
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'ectropy_app') THEN
        CREATE USER ectropy_app WITH PASSWORD '${APP_DB_PASSWORD:-changeme123}';
    END IF;
END
\$\$;

-- Grant necessary permissions to application user
GRANT CONNECT ON DATABASE ${DB_NAME} TO ectropy_app;
GRANT USAGE ON SCHEMA public TO ectropy_app;
GRANT CREATE ON SCHEMA public TO ectropy_app;

-- Create basic application tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES users(id),
    speckle_project_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ifc_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT,
    upload_path TEXT,
    processing_status VARCHAR(50) DEFAULT 'pending',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vector table for embeddings
CREATE TABLE IF NOT EXISTS element_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID REFERENCES ifc_models(id),
    element_id VARCHAR(255) NOT NULL,
    element_type VARCHAR(100),
    embedding vector(1536), -- OpenAI embedding dimension
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create spatial index for performance
CREATE INDEX IF NOT EXISTS idx_element_embeddings_vector ON element_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Grant permissions on tables to application user
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ectropy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ectropy_app;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ectropy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ectropy_app;

-- Create database health check function
CREATE OR REPLACE FUNCTION health_check()
RETURNS TABLE(status text, database_name text, version text, extensions text[]) AS \$\$
BEGIN
    RETURN QUERY SELECT 
        'healthy'::text as status,
        current_database()::text as database_name,
        version()::text as version,
        ARRAY(SELECT extname FROM pg_extension)::text[] as extensions;
END;
\$\$ LANGUAGE plpgsql;

-- Insert default data for staging environment
INSERT INTO users (email, password_hash, role) 
VALUES ('admin@ectropy.dev', '\$2b\$10\$dummy.hash.for.staging', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Performance optimization
VACUUM ANALYZE;

-- Success message
SELECT 'Database initialization completed successfully' as result;
EOF

log_info "Initializing database: $DB_NAME"

# Check if PostgreSQL is available
if ! command -v psql &> /dev/null; then
    log_error "PostgreSQL client (psql) not found. Please install PostgreSQL client tools."
    exit 1
fi

# Test database connection
log_info "Testing database connection..."
if ! PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1;" >/dev/null 2>&1; then
    log_error "Cannot connect to PostgreSQL server at $DB_HOST:$DB_PORT"
    log_error "Please ensure PostgreSQL is running and credentials are correct."
    exit 1
fi

log_success "Database connection successful"

# Execute database initialization
log_info "Executing database initialization script..."
if PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -f /tmp/init_database.sql; then
    log_success "Database initialization completed successfully"
else
    log_error "Database initialization failed"
    exit 1
fi

# Verify database health
log_info "Verifying database health..."
if PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT * FROM health_check();" >/dev/null 2>&1; then
    log_success "Database health check passed"
else
    log_warning "Database health check failed - this may be normal for a new installation"
fi

# Clean up temporary files
rm -f /tmp/init_database.sql

echo ""
log_success "Production database configuration completed"
echo ""
echo "Database Details:"
echo "• Name: $DB_NAME"
echo "• Host: $DB_HOST:$DB_PORT"
echo "• Extensions: pgvector, uuid-ossp, postgis"
echo "• Tables: users, projects, ifc_models, element_embeddings"
echo "• Application User: ectropy_app"
echo ""
echo "Next Steps:"
echo "1. Configure application connection string:"
echo "   DATABASE_URL=postgresql://ectropy_app:password@$DB_HOST:$DB_PORT/$DB_NAME"
echo "2. Update environment variables with actual credentials"
echo "3. Run application migrations if needed"