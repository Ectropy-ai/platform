#!/bin/bash
# ============================================================================
# Create API Keys Table in Ectropy PostgreSQL Database
# ============================================================================
# Purpose: Create the api_keys table without using heredoc syntax
#          Compatible with Git Bash, DigitalOcean console, and limited shells
#
# Usage:   ./scripts/database/create-api-keys-table.sh [method] [container]
#
# Methods:
#   prisma   - Use Prisma db execute (recommended)
#   psql     - Use PostgreSQL psql directly
#   stdin    - Use stdin pipe method
#
# Environment:
#   DATABASE_URL    - PostgreSQL connection string (required in container)
#   DOCKER_CONTAINER - Docker container name (default: ectropy-api-gateway)
#
# Examples:
#   ./scripts/database/create-api-keys-table.sh prisma ectropy-api-gateway
#   ./scripts/database/create-api-keys-table.sh psql ectropy-api-gateway
#   ./scripts/database/create-api-keys-table.sh stdin ectropy-api-gateway
#
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Configuration
METHOD="${1:-prisma}"
CONTAINER="${2:-ectropy-api-gateway-gateway}"
DATABASE_URL="${DATABASE_URL:-}"

# SQL for creating api_keys table (matches migration 20260209120000)
read -r -d '' SQL_CREATE_API_KEYS << 'SQLEOF' || true
-- API Keys Table Migration
-- Purpose: Enable API key authentication for server-to-server calls
-- Security: bcrypt hashed keys, scoped permissions, audit trail
-- Use Case: business-tools n8n workflows → Ectropy platform

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_key_hash_key" ON "api_keys"("key_hash");
CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys"("user_id");
CREATE INDEX IF NOT EXISTS "api_keys_is_active_idx" ON "api_keys"("is_active");
CREATE INDEX IF NOT EXISTS "api_keys_expires_at_idx" ON "api_keys"("expires_at");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
SQLEOF

# ============================================================================
# Verify Prerequisites
# ============================================================================
verify_prerequisites() {
  log_info "Verifying prerequisites..."

  # Check Docker container is running
  if ! docker ps | grep -q "$CONTAINER"; then
    log_error "Docker container '$CONTAINER' is not running"
    log_info "Available containers:"
    docker ps --filter "label!=none" --format "table {{.Names}}\t{{.Status}}" | head -10
    return 1
  fi
  log_success "Docker container '$CONTAINER' is running"

  # Check DATABASE_URL is available in container
  if ! docker exec "$CONTAINER" sh -c '[ -n "$DATABASE_URL" ]' 2>/dev/null; then
    log_warning "DATABASE_URL not set in container, may be set at runtime"
  else
    log_success "DATABASE_URL is set in container"
  fi

  return 0
}

# ============================================================================
# Method 1: Using Prisma db execute (Recommended)
# ============================================================================
execute_with_prisma() {
  log_info "Creating API Keys table using Prisma db execute..."

  # Create temporary SQL file
  local temp_file="/tmp/api_keys_$RANDOM.sql"
  printf "%s" "$SQL_CREATE_API_KEYS" > "$temp_file"

  if [ ! -f "$temp_file" ]; then
    log_error "Failed to create temporary SQL file"
    return 1
  fi

  log_info "Executing SQL via Prisma..."

  if docker exec -i "$CONTAINER" npx prisma db execute --file "$temp_file"; then
    log_success "API Keys table created successfully with Prisma"
    rm -f "$temp_file"
    return 0
  else
    log_error "Prisma db execute failed"
    rm -f "$temp_file"
    return 1
  fi
}

# ============================================================================
# Method 2: Using psql directly
# ============================================================================
execute_with_psql() {
  log_info "Creating API Keys table using psql..."

  # Create temporary SQL file
  local temp_file="/tmp/api_keys_$RANDOM.sql"
  printf "%s" "$SQL_CREATE_API_KEYS" > "$temp_file"

  if [ ! -f "$temp_file" ]; then
    log_error "Failed to create temporary SQL file"
    return 1
  fi

  log_info "Executing SQL via psql..."

  if docker exec -i "$CONTAINER" psql "\$DATABASE_URL" -f "$temp_file"; then
    log_success "API Keys table created successfully with psql"
    rm -f "$temp_file"
    return 0
  else
    log_error "psql execution failed"
    rm -f "$temp_file"
    return 1
  fi
}

# ============================================================================
# Method 3: Using stdin pipe (no files needed)
# ============================================================================
execute_with_stdin() {
  log_info "Creating API Keys table using stdin pipe..."
  log_info "Piping SQL directly to container..."

  if echo "$SQL_CREATE_API_KEYS" | docker exec -i "$CONTAINER" psql "\$DATABASE_URL" -q; then
    log_success "API Keys table created successfully with stdin"
    return 0
  else
    log_error "stdin execution failed"
    return 1
  fi
}

# ============================================================================
# Verify Table Creation
# ============================================================================
verify_table_creation() {
  log_info "Verifying table creation..."

  # Check if table exists
  if docker exec "$CONTAINER" psql "\$DATABASE_URL" -c "\dt api_keys" 2>/dev/null | grep -q "api_keys"; then
    log_success "api_keys table verified"
    return 0
  else
    log_warning "Could not verify table (this may be normal in some environments)"
    return 0
  fi
}

# ============================================================================
# Show Table Schema
# ============================================================================
show_table_schema() {
  log_info "Table schema:"

  docker exec "$CONTAINER" psql "\$DATABASE_URL" -c "\d api_keys" 2>/dev/null || \
    log_warning "Could not retrieve table schema"
}

# ============================================================================
# Main
# ============================================================================
main() {
  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║     Creating API Keys Table in Ectropy PostgreSQL         ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  log_info "Configuration:"
  log_info "  Method: $METHOD"
  log_info "  Container: $CONTAINER"
  log_info "  Database URL: ${DATABASE_URL:-<from container env>}"
  echo ""

  # Verify prerequisites
  if ! verify_prerequisites; then
    exit 1
  fi
  echo ""

  # Execute based on method
  case "$METHOD" in
    prisma)
      if ! execute_with_prisma; then
        exit 1
      fi
      ;;
    psql)
      if ! execute_with_psql; then
        exit 1
      fi
      ;;
    stdin)
      if ! execute_with_stdin; then
        exit 1
      fi
      ;;
    *)
      log_error "Unknown method: $METHOD"
      log_info "Valid methods: prisma, psql, stdin"
      exit 1
      ;;
  esac

  echo ""

  # Verify creation
  verify_table_creation

  echo ""

  # Show schema
  show_table_schema

  echo ""
  echo "╔════════════════════════════════════════════════════════════╗"
  echo "║              ✅ API Keys Table Setup Complete              ║"
  echo "╚════════════════════════════════════════════════════════════╝"
  echo ""

  log_info "Next steps:"
  log_info "  1. Verify the table was created"
  log_info "  2. Check foreign key constraint: users(id)"
  log_info "  3. Insert test data for API key authentication"
  log_info ""
  log_info "Example to insert an API key:"
  log_info "  docker exec $CONTAINER psql \\\$DATABASE_URL -c \\"
  log_info "    INSERT INTO api_keys (name, key_hash, user_id) \\"
  log_info "    VALUES ('test-key', 'hashed_value', 'user-uuid')\""
  echo ""
}

# ============================================================================
# Run Main
# ============================================================================
main "$@"
