#!/bin/sh
set -euo pipefail

# ===================================
# Docker Entrypoint Script
# Enhanced with exponential backoff and comprehensive validation
# ===================================
# Purpose: Initialize application environment and start service
# Usage: Automatically executed by Docker on container start
# ===================================

echo "🚀 Starting Ectropy service..."
echo "   Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "   Node version: $(node --version)"
echo "   Environment: ${NODE_ENV:-development}"
echo "   Working directory: $(pwd)"

# ===================================
# Environment Variable Validation
# ===================================
echo ""
echo "🔍 Validating required environment variables..."

# ENTERPRISE FIX (2025-12-15): ROOT CAUSE #42 - DATABASE_URL parsing
# Problem: Production deployment provides DATABASE_URL, but script expects individual variables
# Solution: Parse DATABASE_URL if provided, extract individual components
# Format: postgresql://user:password@host:port/dbname?sslmode=require
if [ -n "${DATABASE_URL:-}" ]; then
  echo "   Parsing DATABASE_URL into individual components..."

  # Extract components using sed (POSIX-compliant, works in Alpine)
  # Format: postgresql://USER:PASSWORD@HOST:PORT/DBNAME

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
  echo "   ✅ Extracted DATABASE_USER: $DATABASE_USER"
fi

# Core database configuration (required for both api-gateway and mcp-server)
REQUIRED_VARS="DATABASE_HOST DATABASE_PORT DATABASE_NAME DATABASE_USER DATABASE_PASSWORD"

# Additional variables for api-gateway
if echo "$@" | grep -q "api-gateway\|main.js.*4000"; then
  REQUIRED_VARS="$REQUIRED_VARS JWT_SECRET SESSION_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET"
  echo "   Service: API Gateway"
fi

# Additional variables for mcp-server
if echo "$@" | grep -q "mcp-server\|main.js.*3001"; then
  echo "   Service: MCP Server"
fi

# Check for missing variables
MISSING_VARS=""
for VAR in $REQUIRED_VARS; do
  eval VALUE=\$$VAR
  if [ -z "$VALUE" ]; then
    MISSING_VARS="$MISSING_VARS $VAR"
  fi
done

# Report validation results
if [ -n "$MISSING_VARS" ]; then
  echo ""
  echo "❌ CRITICAL ERROR: Missing required environment variables"
  echo "   Missing:$MISSING_VARS"
  echo ""
  echo "💡 Troubleshooting:"
  echo "   1. Check docker-compose.test.yml has all environment variables mapped"
  echo "   2. Verify GitHub Actions workflow exports variables in 'env:' block"
  echo "   3. Check secrets exist: gh secret list --env test"
  echo "   4. For local testing, ensure .env.ci or .env.test is loaded"
  echo ""
  exit 1
fi

echo "✅ All required environment variables present"

# Display configuration (sanitized)
echo ""
echo "📋 Configuration Summary:"
echo "   DATABASE_HOST: ${DATABASE_HOST}"
echo "   DATABASE_PORT: ${DATABASE_PORT}"
echo "   DATABASE_NAME: ${DATABASE_NAME}"
echo "   DATABASE_USER: ${DATABASE_USER}"
echo "   REDIS_HOST: ${REDIS_HOST:-not_set}"
echo "   REDIS_PORT: ${REDIS_PORT:-not_set}"
if [ -n "${JWT_SECRET:-}" ]; then
  echo "   JWT_SECRET: ***configured***"
fi
if [ -n "${GOOGLE_CLIENT_ID:-}" ]; then
  echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
fi

# ===================================
# Enhanced Dependency Wait with Exponential Backoff
# ===================================
echo ""
echo "⏳ Checking service dependencies..."

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
      echo "   Troubleshooting:"
      echo "      1. Check if ${service} container is running: docker ps"
      echo "      2. Check ${service} logs: docker logs <container-id>"
      echo "      3. Verify network connectivity: docker network inspect"
      exit 1
    fi
    
    echo "      Attempt ${attempt}/${max_attempts}: ${service} not ready, waiting ${wait_time}s..."
    sleep $wait_time
    
    # Exponential backoff (max 10s)
    wait_time=$((wait_time < 10 ? wait_time * 2 : 10))
    attempt=$((attempt + 1))
  done
  
  echo "✅ ${service} is ready"
}

# Wait for PostgreSQL if DATABASE_HOST is set
if [ -n "${DATABASE_HOST:-}" ]; then
  wait_for_service "${DATABASE_HOST}" "${DATABASE_PORT:-5432}" "PostgreSQL"
fi

# Wait for Redis if REDIS_HOST is set
if [ -n "${REDIS_HOST:-}" ]; then
  wait_for_service "${REDIS_HOST}" "${REDIS_PORT:-6379}" "Redis"
fi

# ===================================
# Database Migrations
# ===================================
# Run database migrations if Prisma schema exists
if [ -f "prisma/schema.prisma" ]; then
  echo ""
  echo "🔄 Running database migrations..."
  START_TIME=$(date +%s)
  
  if ! npx prisma migrate deploy 2>&1; then
    ELAPSED_TIME=$(($(date +%s) - START_TIME))
    echo "⚠️  Prisma migration failed or skipped (took ${ELAPSED_TIME}s)"
    echo "   Possible causes:"
    echo "   - Database not accessible (check DATABASE_URL)"
    echo "   - No pending migrations to apply"
    echo "   - Schema validation error"
    echo "   Continuing startup (migrations not critical for health checks)..."
  else
    ELAPSED_TIME=$(($(date +%s) - START_TIME))
    echo "✅ Migrations completed successfully (took ${ELAPSED_TIME}s)"
  fi
fi

echo ""
echo "✅ Service initialization complete"
echo "🎯 Starting application: $@"
echo "   Process will start at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Execute CMD from Dockerfile (replaces shell process for proper signal handling)
exec "$@"
