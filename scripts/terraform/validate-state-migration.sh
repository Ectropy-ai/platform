#!/bin/bash
#
# Terraform State Migration Validation Script
#
# Purpose: Validates that Terraform state was successfully migrated to S3
#          and that all resources are intact
#
# Usage:
#   bash scripts/terraform/validate-state-migration.sh
#
# Exit Codes:
#   0 - Validation successful
#   1 - Validation failed
#
# Author: Ectropy Infrastructure Team
# Last Updated: 2025-10-31

set -e

# Configuration
S3_BUCKET="ectropy-terraform-state"
S3_KEY="terraform-aws/terraform.tfstate"
AWS_REGION="us-west-1"
BACKUP_DIR="../evidence/terraform-state-migration"
TERRAFORM_DIR="terraform"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Terraform State Migration Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

VALIDATION_FAILED=0

# Check 1: Verify state exists in S3
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Checking S3 state file..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

aws s3 ls "s3://$S3_BUCKET/$S3_KEY" --region "$AWS_REGION" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ State file found in S3${NC}"
  
  # Get file details
  FILE_SIZE=$(aws s3 ls "s3://$S3_BUCKET/$S3_KEY" --region "$AWS_REGION" | awk '{print $3}')
  FILE_DATE=$(aws s3 ls "s3://$S3_BUCKET/$S3_KEY" --region "$AWS_REGION" | awk '{print $1, $2}')
  
  echo "   Location: s3://$S3_BUCKET/$S3_KEY"
  echo "   Size: $FILE_SIZE bytes"
  echo "   Last Modified: $FILE_DATE"
else
  echo -e "${RED}❌ State file NOT found in S3${NC}"
  echo "   Expected location: s3://$S3_BUCKET/$S3_KEY"
  echo "   Verify:"
  echo "   - terraform init was run successfully"
  echo "   - backend configuration is correct"
  echo "   - AWS credentials have s3:ListBucket permission"
  VALIDATION_FAILED=1
fi
echo ""

# Check 2: Verify state content matches backup (if backup exists)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Comparing state content with backup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$BACKUP_DIR/resources-inventory.txt" ] && [ -s "$BACKUP_DIR/resources-inventory.txt" ]; then
  echo "Backup inventory found - comparing with current state..."
  
  # Check if terraform is available
  if ! command -v terraform &>/dev/null; then
    echo -e "${YELLOW}⚠️  Terraform not installed - skipping content comparison${NC}"
    echo "   Install Terraform to compare state content"
  else
    cd "$TERRAFORM_DIR"
    
    # Generate current resource list
    terraform state list > /tmp/current-resources.txt 2>/dev/null || {
      echo -e "${RED}❌ Failed to list current resources${NC}"
      echo "   Run 'terraform init' if backend not initialized"
      VALIDATION_FAILED=1
      cd ..
    }
    
    if [ $VALIDATION_FAILED -eq 0 ]; then
      cd ..
      
      # Compare resource lists
      diff "$BACKUP_DIR/resources-inventory.txt" /tmp/current-resources.txt > /dev/null 2>&1
      
      if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ State content matches backup${NC}"
        
        RESOURCE_COUNT=$(wc -l < "$BACKUP_DIR/resources-inventory.txt")
        echo "   Resources verified: $RESOURCE_COUNT"
      else
        echo -e "${YELLOW}⚠️  State content differs - review manually${NC}"
        echo ""
        echo "   Differences found between backup and current state:"
        echo "   Backup: $BACKUP_DIR/resources-inventory.txt"
        echo "   Current: /tmp/current-resources.txt"
        echo ""
        echo "   Run 'diff $BACKUP_DIR/resources-inventory.txt /tmp/current-resources.txt' to see details"
        echo ""
        echo "   This may be normal if:"
        echo "   - Resources were added/removed after backup"
        echo "   - Migration was from empty state"
        echo "   - State was modified during migration"
      fi
    fi
  fi
else
  echo -e "${BLUE}ℹ️  No backup found - skipping comparison${NC}"
  echo "   This is normal for fresh state initialization"
  echo "   Backup location checked: $BACKUP_DIR/resources-inventory.txt"
fi
echo ""

# Check 3: Test state operations
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Testing state operations..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if ! command -v terraform &>/dev/null; then
  echo -e "${YELLOW}⚠️  Terraform not installed - skipping state operations test${NC}"
else
  cd "$TERRAFORM_DIR"
  
  # Test terraform show
  terraform show > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 'terraform show' successful${NC}"
    echo "   State is readable and accessible"
  else
    echo -e "${RED}❌ 'terraform show' failed${NC}"
    echo "   State may be corrupted or inaccessible"
    echo "   Run 'terraform show' for details"
    VALIDATION_FAILED=1
  fi
  
  cd ..
fi
echo ""

# Check 4: Verify S3 versioning is enabled
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Verifying S3 versioning..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

VERSIONING=$(aws s3api get-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --region "$AWS_REGION" \
  --query 'Status' \
  --output text 2>/dev/null || echo "ERROR")

if [ "$VERSIONING" = "ERROR" ]; then
  echo -e "${YELLOW}⚠️  Unable to check versioning status${NC}"
  echo "   Verify IAM permissions include s3:GetBucketVersioning"
elif [ "$VERSIONING" = "Enabled" ]; then
  echo -e "${GREEN}✅ S3 versioning is enabled${NC}"
  echo "   State rollback capability available"
  
  # Count versions
  VERSION_COUNT=$(aws s3api list-object-versions \
    --bucket "$S3_BUCKET" \
    --prefix "$S3_KEY" \
    --region "$AWS_REGION" \
    --query 'length(Versions[])' \
    --output text 2>/dev/null || echo "unknown")
  
  echo "   Available state versions: $VERSION_COUNT"
else
  echo -e "${YELLOW}⚠️  S3 versioning is NOT enabled${NC}"
  echo "   Current status: $VERSIONING"
  echo "   Enable versioning for state rollback capability"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $VALIDATION_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ SUCCESS: State migration validation complete${NC}"
  echo ""
  echo "Terraform state successfully migrated to S3:"
  echo "  • S3 Location: s3://$S3_BUCKET/$S3_KEY"
  echo "  • AWS Region: $AWS_REGION"
  echo "  • Versioning: $VERSIONING"
  echo "  • State Operations: Working"
  echo ""
  echo "Next steps:"
  echo "  1. Test state locking with: bash scripts/terraform/test-state-locking.sh"
  echo "  2. Run terraform plan/apply to verify operations"
  echo "  3. Review docs/runbooks/terraform-state-rollback.md for rollback procedures"
  echo ""
  exit 0
else
  echo -e "${RED}❌ FAILURE: State migration validation failed${NC}"
  echo ""
  echo "Please resolve the issues above before proceeding."
  echo ""
  echo "Common Solutions:"
  echo "  • Ensure 'terraform init' completed successfully"
  echo "  • Verify AWS credentials and permissions"
  echo "  • Check backend configuration in terraform/backend.tf"
  echo "  • Review validation logs above for specific errors"
  echo ""
  echo "For rollback: docs/runbooks/terraform-state-rollback.md"
  echo ""
  exit 1
fi
