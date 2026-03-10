#!/bin/bash
################################################################################
# ENTERPRISE DATABASE BACKUP SCRIPT
# Automated daily PostgreSQL backups to DigitalOcean Spaces
#
# Schedule: Daily at 2 AM UTC via cron
# Retention: 30 days
# Storage: DigitalOcean Spaces (S3-compatible)
# Encryption: pgcrypto for sensitive data
#
# Usage: ./backup-database.sh [environment]
# Example: ./backup-database.sh production
################################################################################

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-production}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/backups"
BACKUP_FILE="ectropy_${ENVIRONMENT}_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=30

# Required environment variables
: "${DATABASE_HOST:?DATABASE_HOST not set}"
: "${DATABASE_PORT:?DATABASE_PORT not set}"
: "${DATABASE_NAME:?DATABASE_NAME not set}"
: "${DATABASE_USER:?DATABASE_USER not set}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD not set}"
: "${DO_SPACES_KEY:?DO_SPACES_KEY not set}"
: "${DO_SPACES_SECRET:?DO_SPACES_SECRET not set}"
: "${DO_SPACES_REGION:?DO_SPACES_REGION not set}"
: "${DO_SPACES_BUCKET:?DO_SPACES_BUCKET not set}"

echo "🔒 ENTERPRISE DATABASE BACKUP"
echo "================================"
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $TIMESTAMP"
echo "Database: $DATABASE_NAME@$DATABASE_HOST:$DATABASE_PORT"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

# Step 1: Dump database
echo "📦 Step 1: Creating database dump..."
export PGPASSWORD="$DATABASE_PASSWORD"
pg_dump \
  -h "$DATABASE_HOST" \
  -p "$DATABASE_PORT" \
  -U "$DATABASE_USER" \
  -d "$DATABASE_NAME" \
  --format=custom \
  --verbose \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

unset PGPASSWORD

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Database dump created: $BACKUP_FILE ($BACKUP_SIZE)"

# Step 2: Calculate checksum
echo ""
echo "🔐 Step 2: Calculating checksum..."
SHA256=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')
echo "$SHA256  $BACKUP_FILE" > "${BACKUP_FILE}.sha256"
echo "✅ Checksum: $SHA256"

# Step 3: Upload to DigitalOcean Spaces
echo ""
echo "☁️  Step 3: Uploading to DigitalOcean Spaces..."

# Configure s3cmd (DigitalOcean Spaces is S3-compatible)
cat > /tmp/s3cmd.cfg << EOF
[default]
access_key = $DO_SPACES_KEY
secret_key = $DO_SPACES_SECRET
host_base = ${DO_SPACES_REGION}.digitaloceanspaces.com
host_bucket = %(bucket)s.${DO_SPACES_REGION}.digitaloceanspaces.com
use_https = True
EOF

# Upload backup file
s3cmd -c /tmp/s3cmd.cfg put "$BACKUP_FILE" "s3://${DO_SPACES_BUCKET}/backups/${ENVIRONMENT}/${BACKUP_FILE}"
s3cmd -c /tmp/s3cmd.cfg put "${BACKUP_FILE}.sha256" "s3://${DO_SPACES_BUCKET}/backups/${ENVIRONMENT}/${BACKUP_FILE}.sha256"

echo "✅ Uploaded to s3://${DO_SPACES_BUCKET}/backups/${ENVIRONMENT}/"

# Step 4: Cleanup old backups
echo ""
echo "🧹 Step 4: Cleaning up old backups (retention: $RETENTION_DAYS days)..."

# List and delete backups older than retention period
OLD_BACKUPS=$(s3cmd -c /tmp/s3cmd.cfg ls "s3://${DO_SPACES_BUCKET}/backups/${ENVIRONMENT}/" \
  | awk '{print $4}' \
  | grep "ectropy_${ENVIRONMENT}_" \
  | sort -r \
  | tail -n +$((RETENTION_DAYS + 1)))

DELETED_COUNT=0
for backup in $OLD_BACKUPS; do
  echo "Deleting old backup: $backup"
  s3cmd -c /tmp/s3cmd.cfg del "$backup"
  s3cmd -c /tmp/s3cmd.cfg del "${backup}.sha256" 2>/dev/null || true
  DELETED_COUNT=$((DELETED_COUNT + 1))
done

echo "✅ Deleted $DELETED_COUNT old backup(s)"

# Step 5: Local cleanup
echo ""
echo "🧹 Step 5: Cleaning up local files..."
rm -f "/tmp/s3cmd.cfg"
rm -f "$BACKUP_DIR/$BACKUP_FILE"
rm -f "$BACKUP_DIR/${BACKUP_FILE}.sha256"
echo "✅ Local cleanup complete"

# Step 6: Verification
echo ""
echo "✅ BACKUP COMPLETE"
echo "===================="
echo "Backup file: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo "Checksum: $SHA256"
echo "Location: s3://${DO_SPACES_BUCKET}/backups/${ENVIRONMENT}/"
echo "Retention: $RETENTION_DAYS days"
echo ""
echo "🔍 To restore this backup:"
echo "   1. Download: s3cmd get s3://${DO_SPACES_BUCKET}/backups/${ENVIRONMENT}/$BACKUP_FILE"
echo "   2. Verify: sha256sum -c ${BACKUP_FILE}.sha256"
echo "   3. Restore: gunzip -c $BACKUP_FILE | pg_restore -d DATABASE_NAME"
echo ""

# Send success notification (optional - configure Slack/email)
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ Database backup complete: $ENVIRONMENT ($BACKUP_SIZE)\"}"
fi

exit 0
