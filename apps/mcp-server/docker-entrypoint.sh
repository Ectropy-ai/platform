#!/bin/bash
set -e

echo "🔍 Validating MCP Server environment configuration..."
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

# Validate required environment variables INSIDE container
REQUIRED_VARS=(
  "DATABASE_PASSWORD"
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

MAX_RETRIES=5
RETRY=0
BACKOFF=5

while [ $RETRY -lt $MAX_RETRIES ]; do
  echo "   Attempt $((RETRY + 1))/$MAX_RETRIES: prisma migrate deploy..."

  if npx prisma migrate deploy --schema=/app/prisma/schema.prisma 2>&1; then
    echo "✅ Migrations applied successfully"
    break
  fi

  RETRY=$((RETRY + 1))
  if [ $RETRY -lt $MAX_RETRIES ]; then
    echo "⚠️  Migration failed. Retrying in ${BACKOFF}s..."
    sleep $BACKOFF
    BACKOFF=$((BACKOFF * 2))
    [ $BACKOFF -gt 60 ] && BACKOFF=60
  else
    echo "⚠️  Migrations failed after $MAX_RETRIES attempts - continuing startup"
  fi
done

echo "🚀 Starting MCP Server..."

# Execute the main container command
exec "$@"
