#!/bin/bash
set -e

echo "🔍 Validating API Gateway environment configuration..."
echo "   Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "   Node version: $(node --version)"
echo "   Environment: ${NODE_ENV:-development}"

# ===================================
# DATABASE_URL Parsing (Enterprise Fix)
# ===================================
# Parse DATABASE_URL if provided, extract individual components
# Format: postgresql://user:password@host:port/dbname?sslmode=require
if [ -n "${DATABASE_URL:-}" ]; then
  echo "   Parsing DATABASE_URL into individual components..."

  # Remove protocol prefix
  DB_URL_NO_PROTOCOL=$(echo "$DATABASE_URL" | sed 's|^postgresql://||')

  # Extract user:password@host:port/dbname (before query params)
  DB_URL_CORE=$(echo "$DB_URL_NO_PROTOCOL" | sed 's|?.*||')

  # Extract credentials (before @)
  DB_CREDENTIALS=$(echo "$DB_URL_CORE" | sed 's|@.*||')
  export DATABASE_USER=$(echo "$DB_CREDENTIALS" | sed 's|:.*||')
  export DATABASE_PASSWORD=$(echo "$DB_CREDENTIALS" | sed 's|^[^:]*:||')

  # Extract host:port/dbname (after @)
  DB_HOST_INFO=$(echo "$DB_URL_CORE" | sed 's|^[^@]*@||')

  # Extract host (before :)
  export DATABASE_HOST=$(echo "$DB_HOST_INFO" | sed 's|:.*||')

  # Extract port/dbname (after host:)
  DB_PORT_DB=$(echo "$DB_HOST_INFO" | sed 's|^[^:]*:||')

  # Extract port (before /)
  export DATABASE_PORT=$(echo "$DB_PORT_DB" | sed 's|/.*||')

  # Extract database name (after /)
  export DATABASE_NAME=$(echo "$DB_PORT_DB" | sed 's|^[^/]*/||')

  echo "   ✅ Extracted DATABASE_HOST: $DATABASE_HOST"
  echo "   ✅ Extracted DATABASE_PORT: $DATABASE_PORT"
  echo "   ✅ Extracted DATABASE_NAME: $DATABASE_NAME"
fi

# Validate required OAuth variables INSIDE container
REQUIRED_VARS=(
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "DATABASE_PASSWORD"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "SESSION_SECRET"
)

MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "❌ FATAL: Missing required environment variables inside container:"
  printf '   - %s\n' "${MISSING_VARS[@]}"
  echo ""
  echo "💡 Troubleshooting:"
  echo "   1. Check docker-compose.staging.yml has environment: mappings"
  echo "   2. Verify GitHub Secrets are set in staging environment"
  echo "   3. Ensure .env file is deployed to server with all required vars"
  echo ""
  exit 1
fi

echo "✅ All required environment variables present"

# ===================================
# Dependency Waiting (Enterprise Fix)
# ===================================
# Wait for PostgreSQL and Redis before starting
wait_for_service() {
  local host=$1
  local port=$2
  local service=$3
  local max_attempts=30
  local attempt=1
  local wait_time=1

  echo "   Waiting for ${service} at ${host}:${port}..."

  while ! nc -z "$host" "$port" >/dev/null 2>&1; do
    if [ $attempt -eq $max_attempts ]; then
      echo "❌ FATAL: ${service} not available after ${max_attempts} attempts"
      exit 1
    fi

    echo "      Attempt ${attempt}/${max_attempts}: ${service} not ready, waiting ${wait_time}s..."
    sleep $wait_time

    # Exponential backoff (max 10s)
    wait_time=$((wait_time < 10 ? wait_time * 2 : 10))
    attempt=$((attempt + 1))
  done

  echo "   ✅ ${service} is ready"
}

echo ""
echo "⏳ Checking service dependencies..."

# Wait for Redis (required dependency in docker-compose)
if [ -n "${REDIS_HOST:-}" ]; then
  wait_for_service "${REDIS_HOST}" "${REDIS_PORT:-6379}" "Redis"
fi

# Wait for PostgreSQL if DATABASE_HOST is set
if [ -n "${DATABASE_HOST:-}" ]; then
  wait_for_service "${DATABASE_HOST}" "${DATABASE_PORT:-5432}" "PostgreSQL"
fi

# Load Speckle token from shared volume (created by speckle-admin-bootstrap via GraphQL)
# The bootstrap runs asynchronously — NOT a hard dependency of api-gateway.
# This prevents cascading failure: bootstrap failure must not block the app stack.
# Wait up to 90 seconds for the token file, then start regardless.
TOKEN_FILE="/shared-tokens/speckle-service-token"
TOKEN_WAIT=0
TOKEN_MAX_WAIT=90

if [ -d "/shared-tokens" ] && [ ! -f "$TOKEN_FILE" ]; then
  echo "⏳ Waiting for Speckle bootstrap token (max ${TOKEN_MAX_WAIT}s)..."
  while [ ! -f "$TOKEN_FILE" ] && [ $TOKEN_WAIT -lt $TOKEN_MAX_WAIT ]; do
    sleep 5
    TOKEN_WAIT=$((TOKEN_WAIT + 5))
    echo "   Waiting... ($TOKEN_WAIT/${TOKEN_MAX_WAIT}s)"
  done
fi

if [ -f "$TOKEN_FILE" ]; then
  BOOTSTRAP_TOKEN=$(cat "$TOKEN_FILE" | tr -d '[:space:]')
  if [ -n "$BOOTSTRAP_TOKEN" ]; then
    export SPECKLE_SERVER_TOKEN="$BOOTSTRAP_TOKEN"
    echo "✅ Loaded SPECKLE_SERVER_TOKEN from bootstrap (${#BOOTSTRAP_TOKEN} chars)"
  else
    echo "⚠️  Bootstrap token file exists but is empty, using env fallback"
  fi
else
  if [ -n "$SPECKLE_SERVER_TOKEN" ]; then
    echo "⚠️  No bootstrap token file after ${TOKEN_MAX_WAIT}s, using SPECKLE_SERVER_TOKEN from environment"
  else
    echo "⚠️  No SPECKLE_SERVER_TOKEN available — Speckle integration will be unavailable"
  fi
fi

# ===================================
# Database Migrations (Inline Pattern)
# ===================================
# ENTERPRISE FIX: Run migrations inline (Watchtower-compatible)
# Replaces db-migrate init container per FIVE_WHY_STAGING_502_BACKEND_DOWN_2026-02-24.json
#
# ROOT CAUSE: db-migrate init container uses restart:'no' - runs once, exits.
# Watchtower updates individual containers but does NOT re-run Docker Compose
# dependency chains. If db-migrate fails once, it stays "exited (1)" forever,
# blocking api-gateway/mcp-server indefinitely via service_completed_successfully.
#
# FIX: Inline migrations run on every container start. Watchtower restarts
# trigger migrations automatically. Matches Kubernetes sidecar pattern.

echo ""
echo "🔄 Running database migrations..."

# ===================================
# ENTERPRISE FIX (2026-03-08): Make migration failure FATAL
# ===================================
# ROOT CAUSE: Migrations failed silently — "continuing startup" masked the error.
# Impact: App starts without database tables → users table missing → OAuth broken.
# Health check (SELECT 1) passed despite missing tables → deploys appeared "successful".
# Fix: Hard-fail if migrations fail — app is BROKEN without tables.
# Evidence: FIVE_WHY_PRODUCTION_DEPLOY_AND_BIM_VIEWER_2026-03-08.json chain-5

# ===================================
# ENTERPRISE FIX (2026-03-08): Separate migration credentials from runtime
# ===================================
# ROOT CAUSE: DigitalOcean managed PostgreSQL 16 revokes CREATE on public schema
# for non-owner users. The `ectropy` application user can SELECT/INSERT/UPDATE/DELETE
# but cannot CREATE TABLE (required by prisma migrate deploy).
#
# PATTERN: Use MIGRATION_DATABASE_URL (admin user, e.g. doadmin) for migrations,
# fall back to DATABASE_URL for both if MIGRATION_DATABASE_URL is not set.
# This separates DDL privileges (migrations) from DML privileges (runtime).
# Evidence: FIVE_WHY_PRODUCTION_DEPLOY_AND_BIM_VIEWER_2026-03-08.json chain-7
EFFECTIVE_MIGRATION_URL="${MIGRATION_DATABASE_URL:-$DATABASE_URL}"

if [ -n "${MIGRATION_DATABASE_URL:-}" ]; then
  echo "   Using MIGRATION_DATABASE_URL for migrations (admin credentials)"
else
  echo "   Using DATABASE_URL for migrations (no separate MIGRATION_DATABASE_URL set)"
fi

# Pre-flight: verify prisma CLI is available
if ! command -v npx >/dev/null 2>&1; then
  echo "❌ FATAL: npx not found — cannot run prisma migrate deploy"
  exit 1
fi

echo "   Checking prisma CLI availability..."
if ! npx prisma --version 2>&1; then
  echo "❌ FATAL: prisma CLI not available via npx"
  echo "   node_modules/.bin contents: $(ls /app/node_modules/.bin/prisma* 2>/dev/null || echo 'not found')"
  exit 1
fi

echo "   Checking migration files..."
MIGRATION_COUNT=$(ls -d /app/prisma/migrations/20* 2>/dev/null | wc -l)
echo "   Found $MIGRATION_COUNT migration directories"
if [ "$MIGRATION_COUNT" -eq 0 ]; then
  echo "❌ FATAL: No migration directories found in /app/prisma/migrations/"
  echo "   Contents: $(ls /app/prisma/migrations/ 2>/dev/null || echo 'directory not found')"
  exit 1
fi

echo "   DATABASE_URL set: $([ -n "${DATABASE_URL:-}" ] && echo 'yes' || echo 'no')"
echo "   MIGRATION_DATABASE_URL set: $([ -n "${MIGRATION_DATABASE_URL:-}" ] && echo 'yes' || echo 'no')"
echo "   DATABASE_HOST: ${DATABASE_HOST:-not set}"
echo "   DATABASE_PORT: ${DATABASE_PORT:-not set}"
echo "   DATABASE_NAME: ${DATABASE_NAME:-not set}"

MAX_RETRIES=5
RETRY=0
BACKOFF=5
MIGRATION_SUCCESS=false

while [ $RETRY -lt $MAX_RETRIES ]; do
  echo "   Attempt $((RETRY + 1))/$MAX_RETRIES: prisma migrate deploy..."

  # Use EFFECTIVE_MIGRATION_URL (admin credentials) for DDL operations
  if MIGRATION_OUTPUT=$(DATABASE_URL="$EFFECTIVE_MIGRATION_URL" npx prisma migrate deploy --schema=/app/prisma/schema.prisma 2>&1); then
    echo "$MIGRATION_OUTPUT"
    echo "✅ Migrations applied successfully"
    MIGRATION_SUCCESS=true
    break
  else
    echo "$MIGRATION_OUTPUT"
  fi

  # ===================================
  # ENTERPRISE FIX (2026-03-15): P3009 auto-resolve
  # ===================================
  # ROOT CAUSE: When a migration fails mid-execution (e.g., partial SQL error,
  # transient DB issue), Prisma records it as "failed" in _prisma_migrations.
  # All subsequent `prisma migrate deploy` calls see P3009 and refuse to proceed.
  # Simply retrying is pointless — the failed record must be cleared first.
  #
  # FIX: Detect P3009, delete the failed migration record from _prisma_migrations,
  # then retry. The migration SQL is idempotent (IF NOT EXISTS patterns) so
  # re-running after a partial application is safe.
  if echo "$MIGRATION_OUTPUT" | grep -q "P3009"; then
    FAILED_MIGRATION=$(echo "$MIGRATION_OUTPUT" | grep 'The `' | sed "s/.*The \`\([^\`]*\)\` migration.*/\1/" | head -1)
    if [ -n "$FAILED_MIGRATION" ]; then
      echo "🔧 P3009: Removing failed migration record for '$FAILED_MIGRATION'..."
      DELETE_SQL="DELETE FROM _prisma_migrations WHERE migration_name = '${FAILED_MIGRATION}' AND finished_at IS NULL;"
      if echo "$DELETE_SQL" | DATABASE_URL="$EFFECTIVE_MIGRATION_URL" npx prisma db execute --stdin --schema=/app/prisma/schema.prisma 2>&1; then
        echo "   ✅ Failed record removed — next attempt will re-run migration"
      else
        echo "   ⚠️  Could not remove failed migration record via prisma db execute"
        # Fallback: try psql directly (postgresql-client installed in Dockerfile)
        if command -v psql >/dev/null 2>&1; then
          echo "   Trying psql fallback..."
          if echo "$DELETE_SQL" | psql "$EFFECTIVE_MIGRATION_URL" 2>&1; then
            echo "   ✅ Failed record removed via psql"
          else
            echo "   ⚠️  psql fallback also failed"
          fi
        fi
      fi
    fi
  fi

  RETRY=$((RETRY + 1))
  if [ $RETRY -lt $MAX_RETRIES ]; then
    echo "⚠️  Migration failed (attempt $RETRY). Retrying in ${BACKOFF}s..."
    sleep $BACKOFF
    BACKOFF=$((BACKOFF * 2))
    [ $BACKOFF -gt 60 ] && BACKOFF=60
  fi
done

if [ "$MIGRATION_SUCCESS" = "false" ]; then
  echo ""
  echo "❌ FATAL: Database migrations failed after $MAX_RETRIES attempts"
  echo "   Last output: $MIGRATION_OUTPUT"
  echo "   DATABASE_URL is set: $([ -n "${DATABASE_URL:-}" ] && echo 'yes' || echo 'no')"
  echo "   MIGRATION_DATABASE_URL is set: $([ -n "${MIGRATION_DATABASE_URL:-}" ] && echo 'yes' || echo 'no')"
  echo ""
  echo "   Database tables are a HARD DEPENDENCY — the app cannot function without them."
  echo "   Common causes:"
  echo "     1. Database not reachable (check trusted sources / firewall)"
  echo "     2. DATABASE_URL malformed (check .env on server)"
  echo "     3. Database user lacks CREATE TABLE permissions (set MIGRATION_DATABASE_URL with admin user)"
  echo "     4. Migration lock held by another process"
  echo ""
  exit 1
fi

# ===================================
# ENTERPRISE FIX (2026-03-08): Grant runtime user access to migrated tables
# ===================================
# ROOT CAUSE: Migrations run as doadmin (admin user) which OWNS all created tables.
# PostgreSQL does not automatically grant access to other users.
# The ectropy runtime user needs SELECT/INSERT/UPDATE/DELETE on all tables
# and USAGE/SELECT on all sequences for auto-increment columns.
# ALTER DEFAULT PRIVILEGES ensures future tables created by doadmin are also accessible.
# This is idempotent — GRANTs on already-granted privileges are no-ops.
if [ -n "${MIGRATION_DATABASE_URL:-}" ] && [ -n "${DATABASE_USER:-}" ]; then
  echo "🔐 Granting runtime user '${DATABASE_USER}' access to migrated tables..."

  GRANT_SQL="GRANT USAGE ON SCHEMA public TO ${DATABASE_USER};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${DATABASE_USER};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${DATABASE_USER};
ALTER DEFAULT PRIVILEGES FOR USER doadmin IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${DATABASE_USER};
ALTER DEFAULT PRIVILEGES FOR USER doadmin IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${DATABASE_USER};"

  if echo "$GRANT_SQL" | DATABASE_URL="$EFFECTIVE_MIGRATION_URL" npx prisma db execute --stdin --schema=/app/prisma/schema.prisma 2>&1; then
    echo "   ✅ Runtime user '${DATABASE_USER}' granted access to all tables and sequences"
  else
    echo "   ⚠️  GRANT failed — runtime queries may fail with permission errors"
    echo "   Continuing startup (tables exist, user may already have access)"
  fi
fi

# ===================================
# Platform & Shared Schema Deployment
# ===================================
# Uses `prisma db push` (not `prisma migrate deploy`) because:
# - Platform and shared schemas have NO migration directories
# - `prisma db push` is idempotent for table creation (creates only what's missing)
# - `--skip-generate` because clients are already generated in Docker build stage
# - No `--accept-data-loss`: forces manual review of destructive schema changes

# Platform schema: create tables if not exist
echo "🔄 Applying platform database schema..."
if [ -n "${PLATFORM_DATABASE_URL:-}" ]; then
  npx prisma db push --schema=/app/prisma/schema.platform.prisma --skip-generate 2>&1 || \
    echo "⚠️  Platform schema push failed - continuing startup"
else
  echo "⚠️  PLATFORM_DATABASE_URL not set - skipping platform schema"
fi

# Shared trials schema: create tables if not exist
echo "🔄 Applying shared trials database schema..."
if [ -n "${SHARED_DATABASE_URL:-}" ]; then
  npx prisma db push --schema=/app/prisma/schema.shared.prisma --skip-generate 2>&1 || \
    echo "⚠️  Shared trials schema push failed - continuing startup"
else
  echo "⚠️  SHARED_DATABASE_URL not set - skipping shared trials schema"
fi

# Seed platform database (model catalog)
echo "🌱 Seeding platform database..."
if [ -n "${PLATFORM_DATABASE_URL:-}" ]; then
  node /app/prisma/seeds/seed-platform.cjs 2>&1 || \
    echo "⚠️  Platform seed failed - continuing startup"
fi

echo "🚀 Starting API Gateway..."

# Execute the main container command
exec "$@"
