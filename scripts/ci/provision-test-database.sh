#!/bin/bash
set -euo pipefail

echo "🔒 Enterprise Database Provisioning v1.0"

# Security: Never use 'root' in any environment
DB_TEST_USER="${DB_TEST_USER:-ectropy_test}"
DB_TEST_PASS="${DB_TEST_PASS:-$(openssl rand -base64 24)}"
DB_NAME="${DB_NAME:-ectropy_test}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

# Export for CI environment
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

echo "📋 Database configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_TEST_USER"

# Check if PostgreSQL is running
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U postgres >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not running or not accessible at $DB_HOST:$DB_PORT"
    echo "💡 In CI environments, ensure PostgreSQL service is started"
    exit 1
fi

echo "✅ PostgreSQL is running"

# Create test user with least privileges
echo "🔧 Creating test database and user with least privileges..."
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres <<SQL
-- Drop if exists for idempotency
DROP ROLE IF EXISTS root;
DROP ROLE IF EXISTS test_user;
DROP DATABASE IF EXISTS ${DB_NAME};
DROP ROLE IF EXISTS ${DB_TEST_USER};

-- Create standardized test user
CREATE ROLE ${DB_TEST_USER} WITH LOGIN PASSWORD '${DB_TEST_PASS}';
CREATE DATABASE ${DB_NAME} OWNER ${DB_TEST_USER};

-- Grant minimal required privileges
GRANT CONNECT ON DATABASE ${DB_NAME} TO ${DB_TEST_USER};
GRANT CREATE ON DATABASE ${DB_NAME} TO ${DB_TEST_USER};

-- Audit logging
ALTER ROLE ${DB_TEST_USER} SET log_statement = 'all';
ALTER ROLE ${DB_TEST_USER} SET log_duration = on;

-- Additional test database privileges for CI
\c ${DB_NAME}
GRANT ALL PRIVILEGES ON SCHEMA public TO ${DB_TEST_USER};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_TEST_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_TEST_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_TEST_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_TEST_USER};
SQL

# Store credentials securely
echo "🔐 Storing test credentials..."
cat > .env.test << EOF
DB_USER=${DB_TEST_USER}
DB_PASSWORD=${DB_TEST_PASS}
DB_NAME=${DB_NAME}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DATABASE_URL=postgresql://${DB_TEST_USER}:${DB_TEST_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}
NODE_ENV=test
EOF

# Test the connection with the test user
echo "🧪 Testing connection with test user..."
export PGPASSWORD="$DB_TEST_PASS"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_TEST_USER" -d "$DB_NAME" -c "SELECT version();" >/dev/null 2>&1; then
    echo "✅ Test user connection successful"
else
    echo "❌ Test user connection failed"
    exit 1
fi

echo "✅ Database provisioned with user: ${DB_TEST_USER}"
echo "🔑 Test credentials stored in .env.test"
echo "🛡️ Security compliance: No root privileges granted"