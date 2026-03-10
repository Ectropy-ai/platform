#!/bin/bash
#
# DigitalOcean Spaces Backend Validation Script
#
# Purpose: Validates that the DigitalOcean Spaces backend is properly configured
#          and accessible before running Terraform operations.
#
# Checks Performed:
#   1. AWS CLI installed (for S3-compatible API)
#   2. DigitalOcean Spaces credentials configured
#   3. Spaces bucket exists and is accessible
#   4. Network connectivity to DigitalOcean Spaces
#
# Usage:
#   bash scripts/terraform/validate-digitalocean-backend.sh
#
# Exit Codes:
#   0 - All validations passed
#   1 - One or more validations failed
#
# Requirements:
#   - AWS CLI installed
#   - DigitalOcean Spaces credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
#   - Network access to DigitalOcean Spaces
#
# Author: Ectropy Infrastructure Team
# Last Updated: 2025-11-01

set -e

# Configuration
SPACES_BUCKET="ectropy-terraform-state"
SPACES_REGION="sfo3"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"
STATE_KEY="production/terraform.tfstate"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation tracking
VALIDATION_FAILED=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 DigitalOcean Spaces Backend Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check 1: AWS CLI is installed
echo -n "Checking AWS CLI installation... "
if ! command -v aws &>/dev/null; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   AWS CLI is not installed. Install it from: https://aws.amazon.com/cli/"
  VALIDATION_FAILED=1
else
  AWS_VERSION=$(aws --version 2>&1 | head -n1 || echo "aws-cli (version unknown)")
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   $AWS_VERSION"
fi
echo ""

# Check 2: Credentials are configured
echo -n "Checking DigitalOcean Spaces credentials... "
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   DigitalOcean Spaces credentials are not configured"
  echo "   Required environment variables:"
  echo "     - AWS_ACCESS_KEY_ID (DigitalOcean Spaces Access Key)"
  echo "     - AWS_SECRET_ACCESS_KEY (DigitalOcean Spaces Secret Key)"
  echo ""
  echo "   Set them with:"
  echo "     export AWS_ACCESS_KEY_ID='your-spaces-key'"
  echo "     export AWS_SECRET_ACCESS_KEY='your-spaces-secret'"
  VALIDATION_FAILED=1
else
  echo -e "${GREEN}✅ PASSED${NC}"
  # Show partial credential for verification (first 8 chars only)
  KEY_PREFIX=$(echo "$AWS_ACCESS_KEY_ID" | cut -c1-8)
  echo "   Access Key: ${KEY_PREFIX}... (configured)"
fi
echo ""

# Check 3: Test connectivity to DigitalOcean Spaces
echo -n "Checking connectivity to DigitalOcean Spaces... "

# Add retry logic for transient failures
MAX_RETRIES=3
RETRY_COUNT=0
CONNECTIVITY_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if aws s3 ls --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
    echo -e "${GREEN}✅ PASSED${NC} (attempt $((RETRY_COUNT + 1)))"
    echo "   Connected to: $SPACES_ENDPOINT"
    CONNECTIVITY_SUCCESS=true
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo -n "⚠️  Retry $RETRY_COUNT... "
    sleep 5
  fi
done

if [ "$CONNECTIVITY_SUCCESS" = false ]; then
  echo -e "${RED}❌ FAILED${NC} (after $MAX_RETRIES attempts)"
  echo "   Unable to connect to DigitalOcean Spaces"
  echo "   Endpoint: $SPACES_ENDPOINT"
  echo "   Verify:"
  echo "   - Credentials are correct and have Spaces access"
  echo "   - Network connectivity is available"
  echo "   - DigitalOcean Spaces service is operational"
  VALIDATION_FAILED=1
fi
echo ""

# Check 4: Spaces bucket exists and is accessible
echo -n "Checking Spaces bucket accessibility... "

# Add retry logic for transient failures
MAX_RETRIES=3
RETRY_COUNT=0
BUCKET_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
    echo -e "${GREEN}✅ PASSED${NC} (attempt $((RETRY_COUNT + 1)))"
    echo "   Bucket: s3://$SPACES_BUCKET (accessible)"
    
    # Count objects in bucket
    OBJECT_COUNT=$(aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" --recursive 2>/dev/null | wc -l || echo "0")
    echo "   Objects in bucket: $OBJECT_COUNT"
    BUCKET_SUCCESS=true
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo -n "⚠️  Retry $RETRY_COUNT... "
    sleep 5
  fi
done

if [ "$BUCKET_SUCCESS" = false ]; then
  echo -e "${RED}❌ FAILED${NC} (after $MAX_RETRIES attempts)"
  echo "   Spaces bucket '$SPACES_BUCKET' is not accessible"
  echo "   Verify:"
  echo "   - Bucket exists in DigitalOcean Spaces console"
  echo "   - Credentials have read/write permissions for this bucket"
  echo "   - Bucket is in region: $SPACES_REGION"
  echo ""
  echo "   Create bucket with:"
  echo "   bash scripts/terraform/init-digitalocean-backend.sh"
  VALIDATION_FAILED=1
fi
echo ""

# Check 5: Check for Terraform state file
echo -n "Checking for Terraform state file... "
if aws s3 ls "s3://$SPACES_BUCKET/$STATE_KEY" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  echo -e "${GREEN}✅ FOUND${NC}"
  
  # Get state file info
  STATE_SIZE=$(aws s3 ls "s3://$SPACES_BUCKET/$STATE_KEY" --endpoint-url "$SPACES_ENDPOINT" 2>/dev/null | awk '{print $3}')
  STATE_DATE=$(aws s3 ls "s3://$SPACES_BUCKET/$STATE_KEY" --endpoint-url "$SPACES_ENDPOINT" 2>/dev/null | awk '{print $1, $2}')
  
  echo "   State file: $STATE_KEY"
  echo "   Size: $STATE_SIZE bytes"
  echo "   Last modified: $STATE_DATE"
else
  echo -e "${YELLOW}⚠️  NOT FOUND${NC}"
  echo "   State file: $STATE_KEY (doesn't exist yet)"
  echo "   This is normal for first-time initialization"
  echo "   State will be created on first 'terraform apply'"
fi
echo ""

# Check 6: Verify bucket permissions
echo -n "Verifying bucket permissions... "
# Try to write a test file
TEST_FILE="s3://$SPACES_BUCKET/.terraform-backend-test"
TEST_CONTENT="Backend validation test at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if echo "$TEST_CONTENT" | aws s3 cp - "$TEST_FILE" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  # Verify we can read it back
  if aws s3 cp "$TEST_FILE" - --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
    # Clean up test file
    aws s3 rm "$TEST_FILE" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null
    echo -e "${GREEN}✅ PASSED${NC}"
    echo "   Read/Write permissions verified"
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Cannot read from bucket (write succeeded)"
    VALIDATION_FAILED=1
  fi
else
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Cannot write to bucket"
  echo "   Verify credentials have PutObject permission"
  VALIDATION_FAILED=1
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $VALIDATION_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ SUCCESS: All validations passed${NC}"
  echo ""
  echo "DigitalOcean Spaces backend is properly configured:"
  echo "  • Bucket: $SPACES_BUCKET"
  echo "  • Endpoint: $SPACES_ENDPOINT"
  echo "  • Region: $SPACES_REGION"
  echo "  • State Path: $STATE_KEY"
  echo ""
  echo "You can now run Terraform commands:"
  echo "  cd infrastructure/terraform/"
  echo "  terraform init"
  echo "  terraform plan"
  echo ""
  exit 0
else
  echo -e "${RED}❌ FAILURE: One or more validations failed${NC}"
  echo ""
  echo "Please resolve the issues above before running Terraform operations."
  echo ""
  echo "Common Solutions:"
  echo "  • Configure Spaces credentials as environment variables"
  echo "  • Create bucket: bash scripts/terraform/init-digitalocean-backend.sh"
  echo "  • Verify credentials in DigitalOcean console"
  echo "  • Check Spaces permissions (read, write, list)"
  echo ""
  exit 1
fi
