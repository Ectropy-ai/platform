#!/bin/bash
# ============================================================================
# Execute SQL Without Heredoc - Compatible with Git Bash and Limited Shells
# ============================================================================
# Purpose: Provide multiple methods to execute SQL in Docker containers
#          when heredoc syntax (<<EOF) fails
# Usage:   ./execute-sql-no-heredoc.sh [method] [container] [sql_command]
# ============================================================================

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
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Configuration
CONTAINER="${DOCKER_CONTAINER:-ectropy-api-gateway}"
DATABASE_URL="${DATABASE_URL:-}"

# ============================================================================
# Method 1: Using psql with -c flag
# ============================================================================
execute_with_psql_c() {
  local sql="$1"
  log_info "Executing with psql -c (single command)"

  if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL not set"
    return 1
  fi

  docker exec "$CONTAINER" psql "$DATABASE_URL" -c "$sql" || {
    log_error "psql execution failed"
    return 1
  }

  log_success "Command executed successfully"
}

# ============================================================================
# Method 2: Using psql with --file flag
# ============================================================================
execute_with_psql_file() {
  local sql_file="$1"
  log_info "Executing with psql --file (from file)"

  if [ ! -f "$sql_file" ]; then
    log_error "SQL file not found: $sql_file"
    return 1
  fi

  if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL not set"
    return 1
  fi

  docker exec "$CONTAINER" psql "$DATABASE_URL" -f "$sql_file" || {
    log_error "psql file execution failed"
    return 1
  }

  log_success "SQL file executed successfully"
}

# ============================================================================
# Method 3: Using stdin with pipe (echo)
# ============================================================================
execute_with_stdin_echo() {
  local sql="$1"
  log_info "Executing with echo | docker exec (stdin via pipe)"

  if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL not set"
    return 1
  fi

  echo "$sql" | docker exec -i "$CONTAINER" psql "$DATABASE_URL" -q || {
    log_error "stdin execution failed"
    return 1
  }

  log_success "Command executed via stdin"
}

# ============================================================================
# Method 4: Using stdin with printf (safer for multi-line)
# ============================================================================
execute_with_stdin_printf() {
  local sql="$1"
  log_info "Executing with printf | docker exec (stdin via printf)"

  if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL not set"
    return 1
  fi

  printf "%s" "$sql" | docker exec -i "$CONTAINER" psql "$DATABASE_URL" -q || {
    log_error "stdin (printf) execution failed"
    return 1
  }

  log_success "Command executed via printf | stdin"
}

# ============================================================================
# Method 5: Using Prisma db execute with --file
# ============================================================================
execute_with_prisma_file() {
  local sql_file="$1"
  log_info "Executing with prisma db execute --file"

  if [ ! -f "$sql_file" ]; then
    log_error "SQL file not found: $sql_file"
    return 1
  fi

  docker exec -i "$CONTAINER" npx prisma db execute --file "$sql_file" || {
    log_error "Prisma db execute failed"
    return 1
  }

  log_success "Prisma db execute completed successfully"
}

# ============================================================================
# Method 6: Using Prisma db execute with --stdin
# ============================================================================
execute_with_prisma_stdin() {
  local sql="$1"
  log_info "Executing with prisma db execute --stdin"

  echo "$sql" | docker exec -i "$CONTAINER" npx prisma db execute --stdin || {
    log_error "Prisma db execute --stdin failed"
    return 1
  }

  log_success "Prisma db execute completed successfully"
}

# ============================================================================
# Helper: Create SQL file from string (portable method)
# ============================================================================
create_sql_file() {
  local sql_content="$1"
  local output_file="${2:-./.sql_temp_$RANDOM.sql}"

  log_info "Creating SQL file: $output_file"

  # Use printf to avoid heredoc issues
  printf "%s" "$sql_content" > "$output_file"

  if [ ! -f "$output_file" ]; then
    log_error "Failed to create SQL file"
    return 1
  fi

  echo "$output_file"
}

# ============================================================================
# Helper: Verify database connection
# ============================================================================
verify_connection() {
  log_info "Verifying database connection..."

  if ! docker exec "$CONTAINER" psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    log_error "Cannot connect to database"
    log_error "Check DATABASE_URL and container connectivity"
    return 1
  fi

  log_success "Database connection verified"
}

# ============================================================================
# Helper: Get database info
# ============================================================================
get_db_info() {
  log_info "Database Information:"

  docker exec "$CONTAINER" psql "$DATABASE_URL" -c "
    SELECT
      current_database() as database,
      current_user as user,
      version() as version;
  " || log_warning "Could not retrieve database info"
}

# ============================================================================
# Main: Interactive menu
# ============================================================================
show_usage() {
  cat << 'USAGE'
Usage: execute-sql-no-heredoc.sh [COMMAND]

Commands:
  verify              Verify database connection
  info                Show database information
  method1 <sql>       Execute with psql -c
  method2 <file>      Execute from file with psql
  method3 <sql>       Execute with echo | stdin
  method4 <sql>       Execute with printf | stdin
  method5 <file>      Execute with prisma db execute --file
  method6 <sql>       Execute with prisma db execute --stdin
  demo                Run demonstration of all methods

Environment Variables:
  DATABASE_URL        Database connection string
  DOCKER_CONTAINER   Docker container name (default: ectropy-api-gateway)

Examples:
  ./execute-sql-no-heredoc.sh verify
  ./execute-sql-no-heredoc.sh method3 "SELECT COUNT(*) FROM users;"
  ./execute-sql-no-heredoc.sh method5 ./migration.sql
  ./execute-sql-no-heredoc.sh demo

USAGE
}

# ============================================================================
# Demo: Show all methods in action
# ============================================================================
demo() {
  log_info "=== Executing SQL Without Heredoc - Demonstration ==="
  echo ""

  # Simple test query
  TEST_SQL="SELECT 'SQL execution successful' as result;"

  if [ -z "$DATABASE_URL" ]; then
    log_warning "DATABASE_URL not set, using default for demo"
    DATABASE_URL="postgresql://localhost/postgres"
  fi

  log_info "Test SQL: $TEST_SQL"
  echo ""

  # Method 1
  log_info "--- Method 1: psql -c ---"
  if docker exec "$CONTAINER" psql "$DATABASE_URL" -c "$TEST_SQL" 2>/dev/null; then
    log_success "Method 1 works"
  else
    log_warning "Method 1 failed (may not be available)"
  fi
  echo ""

  # Method 3
  log_info "--- Method 3: echo | stdin ---"
  if echo "$TEST_SQL" | docker exec -i "$CONTAINER" psql "$DATABASE_URL" -q 2>/dev/null; then
    log_success "Method 3 works"
  else
    log_warning "Method 3 failed"
  fi
  echo ""

  # Method 4
  log_info "--- Method 4: printf | stdin ---"
  if printf "%s" "$TEST_SQL" | docker exec -i "$CONTAINER" psql "$DATABASE_URL" -q 2>/dev/null; then
    log_success "Method 4 works"
  else
    log_warning "Method 4 failed"
  fi
  echo ""

  # Method 6
  log_info "--- Method 6: prisma db execute --stdin ---"
  if echo "$TEST_SQL" | docker exec -i "$CONTAINER" npx prisma db execute --stdin 2>/dev/null; then
    log_success "Method 6 works"
  else
    log_warning "Method 6 failed (Prisma may not be available)"
  fi
  echo ""

  log_success "Demonstration complete!"
}

# ============================================================================
# Main Script
# ============================================================================
main() {
  local command="${1:-help}"

  case "$command" in
    verify)
      verify_connection
      ;;
    info)
      get_db_info
      ;;
    method1)
      if [ -z "${2:-}" ]; then
        log_error "method1 requires SQL argument"
        exit 1
      fi
      execute_with_psql_c "$2"
      ;;
    method2)
      if [ -z "${2:-}" ]; then
        log_error "method2 requires file argument"
        exit 1
      fi
      execute_with_psql_file "$2"
      ;;
    method3)
      if [ -z "${2:-}" ]; then
        log_error "method3 requires SQL argument"
        exit 1
      fi
      execute_with_stdin_echo "$2"
      ;;
    method4)
      if [ -z "${2:-}" ]; then
        log_error "method4 requires SQL argument"
        exit 1
      fi
      execute_with_stdin_printf "$2"
      ;;
    method5)
      if [ -z "${2:-}" ]; then
        log_error "method5 requires file argument"
        exit 1
      fi
      execute_with_prisma_file "$2"
      ;;
    method6)
      if [ -z "${2:-}" ]; then
        log_error "method6 requires SQL argument"
        exit 1
      fi
      execute_with_prisma_stdin "$2"
      ;;
    demo)
      demo
      ;;
    help|--help|-h)
      show_usage
      ;;
    *)
      log_error "Unknown command: $command"
      show_usage
      exit 1
      ;;
  esac
}

# Run main function
main "$@"
