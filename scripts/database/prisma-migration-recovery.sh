#!/bin/bash
# ============================================================================
# PRISMA MIGRATION RECOVERY SCRIPT
# ============================================================================
# Enterprise-grade automated detection and resolution of failed Prisma migrations.
# Integrates into CI/CD deployment workflow to prevent migration failures
# from blocking deployments.
#
# USAGE:
#   ./scripts/database/prisma-migration-recovery.sh
#
# EXIT CODES:
#   0 - Success (no failed migrations or successfully recovered)
#   1 - Fatal error (cannot connect to database, unsafe state, etc.)
#   2 - Recovery failed (manual intervention required)
#
# ENVIRONMENT VARIABLES:
#   DATABASE_URL - PostgreSQL connection string (required)
#   RECOVERY_MODE - 'auto' (default) or 'check-only'
#   LOG_LEVEL - 'info' (default), 'debug', 'warn', 'error'
#
# @version 1.0.0
# @author Claude Code
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly LOG_FILE="${WORKSPACE_ROOT}/logs/migration-recovery-$(date +%Y%m%d-%H%M%S).log"

# Recovery settings
RECOVERY_MODE="${RECOVERY_MODE:-auto}"
LOG_LEVEL="${LOG_LEVEL:-info}"
MAX_RECOVERY_ATTEMPTS=3
VERIFICATION_DELAY=2  # seconds

# Colors for terminal output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log_info() {
    local message="$1"
    echo -e "${BLUE}ℹ${NC} ${message}" | tee -a "${LOG_FILE}"
}

log_success() {
    local message="$1"
    echo -e "${GREEN}✅${NC} ${message}" | tee -a "${LOG_FILE}"
}

log_warn() {
    local message="$1"
    echo -e "${YELLOW}⚠️${NC} ${message}" | tee -a "${LOG_FILE}"
}

log_error() {
    local message="$1"
    echo -e "${RED}❌${NC} ${message}" | tee -a "${LOG_FILE}" >&2
}

log_debug() {
    local message="$1"
    if [[ "${LOG_LEVEL}" == "debug" ]]; then
        echo -e "${BOLD}[DEBUG]${NC} ${message}" | tee -a "${LOG_FILE}"
    fi
}

# ============================================================================
# DATABASE CONNECTION
# ============================================================================

check_database_connection() {
    log_info "Verifying database connection..."

    if [[ -z "${DATABASE_URL:-}" ]]; then
        log_error "DATABASE_URL environment variable not set"
        return 1
    fi

    # Test connection with psql
    if ! psql "${DATABASE_URL}" -c "SELECT 1" &>/dev/null; then
        log_error "Cannot connect to database"
        log_debug "DATABASE_URL: ${DATABASE_URL%%@*}@***"  # Sanitized
        return 1
    fi

    log_success "Database connection verified"
    return 0
}

# ============================================================================
# MIGRATION STATE DETECTION
# ============================================================================

detect_failed_migrations() {
    log_info "Scanning for failed migrations..."

    local failed_migrations
    failed_migrations=$(psql "${DATABASE_URL}" -t -c "
        SELECT migration_name
        FROM _prisma_migrations
        WHERE finished_at IS NULL
        ORDER BY started_at DESC;
    " | xargs)

    if [[ -z "${failed_migrations}" ]]; then
        log_success "No failed migrations detected"
        return 1  # Signal no failures found
    fi

    log_warn "Found failed migration(s): ${failed_migrations}"
    echo "${failed_migrations}"
    return 0  # Signal failures found
}

get_migration_details() {
    local migration_name="$1"

    log_debug "Retrieving details for migration: ${migration_name}"

    psql "${DATABASE_URL}" -c "
        SELECT
            migration_name,
            checksum,
            started_at,
            finished_at,
            applied_steps_count,
            logs
        FROM _prisma_migrations
        WHERE migration_name = '${migration_name}';
    " | tee -a "${LOG_FILE}"
}

# ============================================================================
# SAFETY VERIFICATION
# ============================================================================

verify_database_state() {
    local migration_name="$1"

    log_info "Verifying database state for migration: ${migration_name}"

    # Check if migration created any database objects
    # This is a safety check to ensure we're not losing data

    local applied_steps
    applied_steps=$(psql "${DATABASE_URL}" -t -c "
        SELECT applied_steps_count
        FROM _prisma_migrations
        WHERE migration_name = '${migration_name}';
    " | xargs)

    if [[ "${applied_steps}" != "0" ]]; then
        log_error "Migration has applied ${applied_steps} steps - unsafe to auto-recover"
        log_error "Manual intervention required to assess partial database state"
        return 1
    fi

    log_success "Database state is clean (0 applied steps)"

    # Additional safety checks based on migration name patterns
    case "${migration_name}" in
        *rls*|*row_level_security*)
            verify_rls_state
            ;;
        *multi_tenant*)
            verify_tenant_isolation_state
            ;;
        *)
            log_debug "No specific state verification for this migration type"
            ;;
    esac

    return 0
}

verify_rls_state() {
    log_debug "Checking for RLS artifacts..."

    local rls_enabled
    rls_enabled=$(psql "${DATABASE_URL}" -t -c "
        SELECT COUNT(*)
        FROM pg_tables
        WHERE schemaname = 'public' AND rowsecurity = true;
    " | xargs)

    if [[ "${rls_enabled}" != "0" ]]; then
        log_error "Found ${rls_enabled} tables with RLS enabled - partial migration state"
        return 1
    fi

    local rls_functions
    rls_functions=$(psql "${DATABASE_URL}" -t -c "
        SELECT COUNT(*)
        FROM pg_proc
        WHERE proname LIKE 'rls_%';
    " | xargs)

    if [[ "${rls_functions}" != "0" ]]; then
        log_error "Found ${rls_functions} RLS functions - partial migration state"
        return 1
    fi

    log_success "No RLS artifacts detected - clean state"
    return 0
}

verify_tenant_isolation_state() {
    log_debug "Checking for tenant isolation artifacts..."

    # Check for tenant-specific policies, triggers, or functions
    local tenant_policies
    tenant_policies=$(psql "${DATABASE_URL}" -t -c "
        SELECT COUNT(*)
        FROM pg_policies
        WHERE policyname LIKE '%tenant%';
    " | xargs)

    if [[ "${tenant_policies}" != "0" ]]; then
        log_error "Found ${tenant_policies} tenant policies - partial migration state"
        return 1
    fi

    log_success "No tenant isolation artifacts detected - clean state"
    return 0
}

# ============================================================================
# RECOVERY OPERATIONS
# ============================================================================

recover_failed_migration() {
    local migration_name="$1"

    log_info "Initiating recovery for migration: ${migration_name}"

    # Verify safe to recover
    if ! verify_database_state "${migration_name}"; then
        log_error "Database state verification failed - aborting recovery"
        return 1
    fi

    # Backup migration record before deletion (for audit trail)
    log_info "Creating audit record..."
    psql "${DATABASE_URL}" -c "
        INSERT INTO migration_recovery_audit (
            migration_name,
            recovery_timestamp,
            recovery_reason,
            original_started_at,
            original_applied_steps
        )
        SELECT
            migration_name,
            NOW(),
            'Automated recovery: failed migration with 0 applied steps',
            started_at,
            applied_steps_count
        FROM _prisma_migrations
        WHERE migration_name = '${migration_name}'
        ON CONFLICT DO NOTHING;
    " 2>/dev/null || log_debug "Audit table not available (non-critical)"

    # Delete failed migration record
    log_info "Removing failed migration record..."
    local deleted_count
    deleted_count=$(psql "${DATABASE_URL}" -t -c "
        DELETE FROM _prisma_migrations
        WHERE migration_name = '${migration_name}'
        AND finished_at IS NULL
        RETURNING migration_name;
    " | grep -c "${migration_name}" || echo "0")

    if [[ "${deleted_count}" != "1" ]]; then
        log_error "Failed to delete migration record (expected 1, got ${deleted_count})"
        return 1
    fi

    log_success "Migration record deleted successfully"

    # Verify recovery
    sleep "${VERIFICATION_DELAY}"

    local still_failed
    still_failed=$(psql "${DATABASE_URL}" -t -c "
        SELECT COUNT(*)
        FROM _prisma_migrations
        WHERE migration_name = '${migration_name}' AND finished_at IS NULL;
    " | xargs)

    if [[ "${still_failed}" != "0" ]]; then
        log_error "Recovery verification failed - migration still shows as failed"
        return 1
    fi

    log_success "Recovery verified - migration ready for retry"
    return 0
}

# ============================================================================
# AUDIT TABLE SETUP
# ============================================================================

setup_audit_table() {
    log_debug "Setting up migration recovery audit table..."

    psql "${DATABASE_URL}" <<-SQL 2>/dev/null || log_debug "Audit table setup skipped (may already exist)"
		CREATE TABLE IF NOT EXISTS migration_recovery_audit (
		    id SERIAL PRIMARY KEY,
		    migration_name TEXT NOT NULL,
		    recovery_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    recovery_reason TEXT,
		    original_started_at TIMESTAMPTZ,
		    original_applied_steps INTEGER,
		    recovery_successful BOOLEAN DEFAULT true,
		    UNIQUE(migration_name, recovery_timestamp)
		);

		CREATE INDEX IF NOT EXISTS idx_migration_recovery_timestamp
		ON migration_recovery_audit(recovery_timestamp DESC);
		SQL
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║        PRISMA MIGRATION RECOVERY - ENTERPRISE AUTOMATION       ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Create logs directory
    mkdir -p "$(dirname "${LOG_FILE}")"

    log_info "Recovery mode: ${RECOVERY_MODE}"
    log_info "Log level: ${LOG_LEVEL}"
    log_info "Log file: ${LOG_FILE}"

    # Step 1: Database connection check
    if ! check_database_connection; then
        log_error "Cannot proceed without database connection"
        exit 1
    fi

    # Step 2: Setup audit table (optional, non-blocking)
    setup_audit_table

    # Step 3: Detect failed migrations
    local failed_migrations
    if ! failed_migrations=$(detect_failed_migrations); then
        log_success "No recovery needed - all migrations in good state"
        exit 0
    fi

    # Convert space-separated list to array
    read -ra migration_array <<< "${failed_migrations}"
    local total_failures=${#migration_array[@]}

    log_warn "Found ${total_failures} failed migration(s)"

    # Step 4: Check-only mode
    if [[ "${RECOVERY_MODE}" == "check-only" ]]; then
        log_info "Running in check-only mode - no recovery will be performed"
        for migration in "${migration_array[@]}"; do
            get_migration_details "${migration}"
        done
        exit 2  # Signal recovery needed
    fi

    # Step 5: Auto-recovery mode
    log_info "Proceeding with automatic recovery..."

    local recovery_count=0
    local failed_count=0

    for migration in "${migration_array[@]}"; do
        log_info "Processing migration: ${migration}"
        get_migration_details "${migration}"

        if recover_failed_migration "${migration}"; then
            ((recovery_count++))
            log_success "Recovery successful for: ${migration}"
        else
            ((failed_count++))
            log_error "Recovery failed for: ${migration}"
        fi
    done

    # Step 6: Summary
    echo ""
    echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║                      RECOVERY SUMMARY                          ║${NC}"
    echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    log_info "Total failed migrations: ${total_failures}"
    log_success "Successfully recovered: ${recovery_count}"

    if [[ "${failed_count}" -gt 0 ]]; then
        log_error "Failed to recover: ${failed_count}"
        log_error "Manual intervention required for remaining failures"
        exit 2
    fi

    log_success "All migrations recovered successfully"
    log_info "Database is ready for 'prisma migrate deploy'"

    exit 0
}

# ============================================================================
# SCRIPT EXECUTION
# ============================================================================

# Trap errors and cleanup
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main
main "$@"
