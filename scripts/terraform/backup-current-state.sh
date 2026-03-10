#!/bin/bash
#
# Terraform State Backup Script
#
# Purpose: Backs up existing local Terraform state before migration to S3
#          Creates inventory of managed resources for validation
#
# Usage:
#   bash scripts/terraform/backup-current-state.sh
#
# Exit Codes:
#   0 - Backup successful or no state to backup
#   1 - Backup failed
#
# Author: Ectropy Infrastructure Team
# Last Updated: 2025-10-31

set -e

# Configuration
BACKUP_DIR="../evidence/terraform-state-migration"
TERRAFORM_DIR="terraform"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 Terraform State Backup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Navigate to terraform directory
cd "$TERRAFORM_DIR"

# Check if local state exists
if [ -f terraform.tfstate ]; then
  echo -e "${BLUE}📄 Local state found - backing up${NC}"
  
  # Create backup directory if it doesn't exist
  mkdir -p "$BACKUP_DIR"
  
  # Backup the state file
  cp terraform.tfstate "$BACKUP_DIR/current-state-backup.tfstate"
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ State file backed up to: $BACKUP_DIR/current-state-backup.tfstate${NC}"
  else
    echo -e "${RED}❌ Failed to backup state file${NC}"
    exit 1
  fi
  
  # Create inventory of all resources in state
  echo ""
  echo -e "${BLUE}📋 Creating resource inventory...${NC}"
  
  # Check if terraform is available
  if ! command -v terraform &>/dev/null; then
    echo -e "${YELLOW}⚠️  Terraform not installed - skipping resource inventory${NC}"
    echo -e "${YELLOW}   Install Terraform to generate resource inventory${NC}"
  else
    terraform state list > "$BACKUP_DIR/resources-inventory.txt" 2>/dev/null || {
      echo -e "${YELLOW}⚠️  Could not generate resource inventory${NC}"
      echo -e "${YELLOW}   This may be normal if state is corrupted or empty${NC}"
      echo "" > "$BACKUP_DIR/resources-inventory.txt"
    }
    
    RESOURCE_COUNT=$(wc -l < "$BACKUP_DIR/resources-inventory.txt" 2>/dev/null || echo "0")
    echo -e "${GREEN}✅ Resource inventory created: $RESOURCE_COUNT resources${NC}"
  fi
  
  # Create backup metadata
  cat > "$BACKUP_DIR/backup-metadata.json" <<EOF
{
  "backup_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backup_user": "${USER:-unknown}",
  "terraform_version": "$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || echo 'unknown')",
  "state_file_size": "$(stat -f%z terraform.tfstate 2>/dev/null || stat -c%s terraform.tfstate 2>/dev/null || echo 'unknown')",
  "resource_count": ${RESOURCE_COUNT}
}
EOF
  
  echo ""
  echo -e "${GREEN}✅ Current state backed up successfully${NC}"
  echo ""
  echo "Backup location: $BACKUP_DIR/"
  echo "  - current-state-backup.tfstate (state file backup)"
  echo "  - resources-inventory.txt (resource list)"
  echo "  - backup-metadata.json (backup information)"
  
else
  echo -e "${BLUE}ℹ️  No local state found - fresh initialization${NC}"
  echo ""
  echo "This is a fresh Terraform setup with no existing state."
  echo "No backup needed - proceeding with new state initialization."
  
  # Create metadata for fresh setup
  mkdir -p "$BACKUP_DIR"
  cat > "$BACKUP_DIR/backup-metadata.json" <<EOF
{
  "backup_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "backup_user": "${USER:-unknown}",
  "state_type": "fresh_initialization",
  "note": "No local state found - fresh Terraform initialization"
}
EOF
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
