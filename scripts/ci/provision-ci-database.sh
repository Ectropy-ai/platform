#!/bin/bash
set -euo pipefail

echo "🔒 Enterprise Database Provisioning"

# NEVER use 'root' - enforce security
DB_USER="${DB_USER:-ectropy_ci}"
DB_PASS="${DB_PASS:-$(head -c 16 /dev/urandom | base64)}"
DB_NAME="${DB_NAME:-ectropy_test}"

# Wait for PostgreSQL
until pg_isready -h localhost -p 5432; do
  sleep 2
done

# Provision with least privilege
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h localhost -U postgres <<SQL
-- Security: Remove any legacy unsafe roles
DROP ROLE IF EXISTS root;

-- Create CI user with minimal privileges
CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
GRANT CONNECT, CREATE ON DATABASE ${DB_NAME} TO ${DB_USER};

-- Audit configuration
ALTER DATABASE ${DB_NAME} SET log_statement = 'all';
SQL

# Export for CI
cat > .env.ci << ENV
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
DB_HOST=localhost
DB_PORT=5432
ENV

echo "✅ Database provisioned: user=${DB_USER}, db=${DB_NAME}"