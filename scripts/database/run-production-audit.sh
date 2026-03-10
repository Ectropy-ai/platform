#!/bin/bash
# =============================================================================
# Production Database Multi-Tenant Audit Script
# =============================================================================
# Purpose: Execute multi-tenant audit on production database
# Usage: Run on production server with DATABASE_URL env var set
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "==============================================================================="
echo "PRODUCTION DATABASE MULTI-TENANT AUDIT"
echo "==============================================================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}ERROR: DATABASE_URL environment variable not set${NC}"
  echo "Please set DATABASE_URL before running this script"
  echo "Example: export DATABASE_URL='postgresql://user:pass@host:port/dbname?sslmode=require'"
  exit 1
fi

# Extract database name from DATABASE_URL
DB_NAME=$(echo $DATABASE_URL | sed -n 's#.*://[^/]*/\([^?]*\).*#\1#p')
echo "Database: $DB_NAME"
echo ""

# Create output directory
OUTPUT_DIR="evidence/production-audit-$(date +%Y-%m-%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

# Run the audit
echo "Running multi-tenant architecture audit..."
echo ""

psql "$DATABASE_URL" -f scripts/database/audit-multi-tenant-state.sql \
  > "$OUTPUT_DIR/audit-report.txt" 2>&1

# Check exit code
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Audit completed successfully${NC}"
  echo "Report saved to: $OUTPUT_DIR/audit-report.txt"
else
  echo -e "${RED}✗ Audit failed${NC}"
  echo "Check $OUTPUT_DIR/audit-report.txt for errors"
  exit 1
fi

# Extract key metrics
echo ""
echo "==============================================================================="
echo "KEY METRICS SUMMARY"
echo "==============================================================================="
echo ""

# Tenant count
TENANT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM tenants;" 2>/dev/null | xargs)
echo "Total Tenants: $TENANT_COUNT"

# Orphaned projects
ORPHAN_PROJECTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM projects WHERE tenant_id IS NULL;" 2>/dev/null | xargs)
if [ "$ORPHAN_PROJECTS" -eq 0 ]; then
  echo -e "Orphaned Projects: ${GREEN}$ORPHAN_PROJECTS ✓${NC}"
else
  echo -e "Orphaned Projects: ${RED}$ORPHAN_PROJECTS ✗${NC}"
fi

# Orphaned users
ORPHAN_USERS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users WHERE tenant_id IS NULL AND (is_platform_admin = false OR is_platform_admin IS NULL);" 2>/dev/null | xargs)
if [ "$ORPHAN_USERS" -eq 0 ]; then
  echo -e "Orphaned Users: ${GREEN}$ORPHAN_USERS ✓${NC}"
else
  echo -e "Orphaned Users: ${RED}$ORPHAN_USERS ✗${NC}"
fi

# Platform admins
PLATFORM_ADMINS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM users WHERE is_platform_admin = true;" 2>/dev/null | xargs)
echo "Platform Admins: $PLATFORM_ADMINS"

# Projects tenant_id nullability
PROJECTS_NULLABLE=$(psql "$DATABASE_URL" -t -c "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tenant_id';" 2>/dev/null | xargs)
if [ "$PROJECTS_NULLABLE" = "NO" ]; then
  echo -e "Projects tenant_id: ${GREEN}NOT NULL ✓${NC}"
else
  echo -e "Projects tenant_id: ${RED}NULLABLE ✗${NC}"
fi

echo ""
echo "Full audit report: $OUTPUT_DIR/audit-report.txt"
echo "==============================================================================="
