#!/bin/bash
#
# Ectropy Platform - Enterprise Database Backup Script
# Automated PostgreSQL backup with compression, retention, and verification
#
# Usage:
#   ./scripts/backup/database-backup.sh [environment] [backup-type]
#
# Arguments:
#   environment: development|staging|production (default: development)
#   backup-type: full|incremental (default: full)
#
# Examples:
#   ./scripts/backup/database-backup.sh production full
#   ./scripts/backup/database-backup.sh staging incremental
#
# Cron Schedule (Production):
#   0 2 * * * /app/scripts/backup/database-backup.sh production full >> /var/log/ectropy/backup.log 2>&1
#   0 */6 * * * /app/scripts/backup/database-backup.sh production incremental >> /var/log/ectropy/backup.log 2>&1
#

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

ENVIRONMENT="${1:-development}"
BACKUP_TYPE="${2:-full}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env.$ENVIRONMENT" ]; then
  source "$PROJECT_ROOT/.env.$ENVIRONMENT"
fi
if [ -f "$PROJECT_ROOT/.env.local" ]; then
  source "$PROJECT_ROOT/.env.local"
fi

# Database configuration
DATABASE_HOST="${DATABASE_HOST:-localhost}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
DATABASE_NAME="${DATABASE_NAME:-ectropy_db}"
DATABASE_USER="${DATABASE_USER:-ectropy_user}"
PGPASSWORD="${DB_PASSWORD}"
export PGPASSWORD

# Backup configuration
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"  # Keep backups for 30 days
BACKUP_FILENAME="ectropy_${ENVIRONMENT}_${BACKUP_TYPE}_${TIMESTAMP}.sql"
BACKUP_COMPRESSED_FILENAME="${BACKUP_FILENAME}.gz"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_COMPRESSED_FILENAME"

# S3 backup configuration (optional)
S3_BACKUP_ENABLED="${S3_BACKUP_ENABLED:-false}"
S3_BUCKET="${S3_BUCKET:-ectropy-backups}"
S3_PREFIX="${S3_PREFIX:-database/$ENVIRONMENT}"

# Notification configuration (optional)
NOTIFICATION_ENABLED="${NOTIFICATION_ENABLED:-false}"
NOTIFICATION_WEBHOOK="${NOTIFICATION_WEBHOOK:-}"

# Verification configuration
VERIFY_BACKUP="${VERIFY_BACKUP:-true}"

# ==============================================================================
# Functions
# ==============================================================================

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

notify() {
  local status="$1"
  local message="$2"

  if [ "$NOTIFICATION_ENABLED" = "true" ] && [ -n "$NOTIFICATION_WEBHOOK" ]; then
    curl -X POST "$NOTIFICATION_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"$status\",\"message\":\"$message\",\"environment\":\"$ENVIRONMENT\",\"timestamp\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"}" \
      > /dev/null 2>&1 || true
  fi
}

check_dependencies() {
  local missing_deps=()

  if ! command -v pg_dump &> /dev/null; then
    missing_deps+=("pg_dump (postgresql-client)")
  fi

  if ! command -v gzip &> /dev/null; then
    missing_deps+=("gzip")
  fi

  if ! command -v psql &> /dev/null; then
    missing_deps+=("psql (postgresql-client)")
  fi

  if [ "$S3_BACKUP_ENABLED" = "true" ] && ! command -v aws &> /dev/null; then
    missing_deps+=("aws (aws-cli)")
  fi

  if [ ${#missing_deps[@]} -ne 0 ]; then
    error "Missing required dependencies: ${missing_deps[*]}"
    error "Install with: sudo apt-get install -y postgresql-client gzip awscli"
    exit 1
  fi
}

check_database_connection() {
  log "Checking database connection..."

  if ! psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    error "Cannot connect to database: postgresql://$DATABASE_USER@$DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"
    exit 1
  fi

  log "✅ Database connection successful"
}

create_backup_directory() {
  if [ ! -d "$BACKUP_DIR" ]; then
    log "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
  fi
}

perform_full_backup() {
  log "Starting FULL backup: $BACKUP_FILENAME"

  # pg_dump options:
  # -h: host
  # -p: port
  # -U: user
  # -d: database
  # -F c: custom format (compressed, parallelizable restore)
  # -Z 0: no compression (we'll use gzip for better compression)
  # -v: verbose
  # --no-owner: don't output commands to set ownership
  # --no-acl: don't output commands to set access privileges

  pg_dump \
    -h "$DATABASE_HOST" \
    -p "$DATABASE_PORT" \
    -U "$DATABASE_USER" \
    -d "$DATABASE_NAME" \
    -F p \
    -v \
    --no-owner \
    --no-acl \
    2>&1 | gzip > "$BACKUP_PATH"

  log "✅ Full backup completed: $BACKUP_PATH"
}

perform_incremental_backup() {
  log "Starting INCREMENTAL backup: $BACKUP_FILENAME"

  # For PostgreSQL, we'll use WAL archiving for true incremental backups
  # This is a simplified version that backs up specific tables that change frequently

  # Tables to include in incremental backup (frequently changing data)
  INCREMENTAL_TABLES=(
    "audit_log"
    "sessions"
    "proposals"
    "votes"
  )

  pg_dump \
    -h "$DATABASE_HOST" \
    -p "$DATABASE_PORT" \
    -U "$DATABASE_USER" \
    -d "$DATABASE_NAME" \
    -F p \
    -v \
    --no-owner \
    --no-acl \
    $(printf -- '-t %s ' "${INCREMENTAL_TABLES[@]}") \
    2>&1 | gzip > "$BACKUP_PATH"

  log "✅ Incremental backup completed: $BACKUP_PATH"
}

verify_backup() {
  if [ "$VERIFY_BACKUP" = "false" ]; then
    log "Backup verification skipped (VERIFY_BACKUP=false)"
    return 0
  fi

  log "Verifying backup integrity..."

  # Check if file exists and is not empty
  if [ ! -f "$BACKUP_PATH" ]; then
    error "Backup file not found: $BACKUP_PATH"
    return 1
  fi

  if [ ! -s "$BACKUP_PATH" ]; then
    error "Backup file is empty: $BACKUP_PATH"
    return 1
  fi

  # Test gzip integrity
  if ! gzip -t "$BACKUP_PATH" 2>&1; then
    error "Backup file is corrupted (gzip test failed)"
    return 1
  fi

  # Get backup size
  BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
  log "Backup size: $BACKUP_SIZE"

  # Verify SQL content (decompress first 1000 lines)
  if ! gzip -cd "$BACKUP_PATH" | head -n 1000 | grep -q "PostgreSQL database dump"; then
    error "Backup file does not contain valid PostgreSQL dump"
    return 1
  fi

  log "✅ Backup verification successful"
}

upload_to_s3() {
  if [ "$S3_BACKUP_ENABLED" != "true" ]; then
    log "S3 backup upload skipped (S3_BACKUP_ENABLED=false)"
    return 0
  fi

  log "Uploading backup to S3: s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_COMPRESSED_FILENAME"

  aws s3 cp \
    "$BACKUP_PATH" \
    "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_COMPRESSED_FILENAME" \
    --storage-class STANDARD_IA \
    --server-side-encryption AES256

  log "✅ Backup uploaded to S3"
}

cleanup_old_backups() {
  log "Cleaning up backups older than $BACKUP_RETENTION_DAYS days..."

  # Find and delete old backups
  find "$BACKUP_DIR" -name "ectropy_${ENVIRONMENT}_*.sql.gz" -type f -mtime +$BACKUP_RETENTION_DAYS -delete

  local deleted_count
  deleted_count=$(find "$BACKUP_DIR" -name "ectropy_${ENVIRONMENT}_*.sql.gz" -type f -mtime +$BACKUP_RETENTION_DAYS | wc -l)

  if [ "$deleted_count" -gt 0 ]; then
    log "✅ Deleted $deleted_count old backup(s)"
  else
    log "No old backups to delete"
  fi

  # Cleanup S3 old backups (optional)
  if [ "$S3_BACKUP_ENABLED" = "true" ]; then
    # Note: AWS S3 lifecycle policies are recommended for production
    # This is a simplified manual cleanup
    aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/" | \
      awk '{print $4}' | \
      grep "ectropy_${ENVIRONMENT}_" | \
      head -n -$BACKUP_RETENTION_DAYS | \
      xargs -I {} aws s3 rm "s3://$S3_BUCKET/$S3_PREFIX/{}" || true
  fi
}

generate_backup_report() {
  local backup_count
  backup_count=$(find "$BACKUP_DIR" -name "ectropy_${ENVIRONMENT}_*.sql.gz" -type f | wc -l)

  local total_size
  total_size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

  log ""
  log "=========================================="
  log "Backup Report - $ENVIRONMENT"
  log "=========================================="
  log "Environment: $ENVIRONMENT"
  log "Backup Type: $BACKUP_TYPE"
  log "Backup File: $BACKUP_COMPRESSED_FILENAME"
  log "Backup Size: $(du -h "$BACKUP_PATH" | cut -f1)"
  log "Total Backups: $backup_count"
  log "Total Size: $total_size"
  log "Retention: $BACKUP_RETENTION_DAYS days"
  log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
  log "=========================================="
}

# ==============================================================================
# Main Execution
# ==============================================================================

main() {
  log "=========================================="
  log "Ectropy Database Backup - START"
  log "=========================================="
  log "Environment: $ENVIRONMENT"
  log "Backup Type: $BACKUP_TYPE"
  log "Database: postgresql://$DATABASE_USER@$DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"
  log ""

  # Pre-flight checks
  check_dependencies
  check_database_connection
  create_backup_directory

  # Perform backup based on type
  case "$BACKUP_TYPE" in
    full)
      perform_full_backup
      ;;
    incremental)
      perform_incremental_backup
      ;;
    *)
      error "Invalid backup type: $BACKUP_TYPE (must be 'full' or 'incremental')"
      exit 1
      ;;
  esac

  # Post-backup operations
  verify_backup
  upload_to_s3
  cleanup_old_backups
  generate_backup_report

  # Send success notification
  notify "success" "Database backup completed successfully: $BACKUP_COMPRESSED_FILENAME"

  log ""
  log "=========================================="
  log "Ectropy Database Backup - COMPLETE"
  log "=========================================="

  exit 0
}

# Error handler
trap 'error "Backup failed at line $LINENO"; notify "failure" "Database backup failed at line $LINENO"; exit 1' ERR

# Execute main function
main "$@"
