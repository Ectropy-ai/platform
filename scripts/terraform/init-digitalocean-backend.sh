#!/bin/bash
#
# DigitalOcean Spaces Backend Initialization Script
#
# Purpose: Creates and configures DigitalOcean Spaces bucket for Terraform state
#          storage with proper versioning and configuration.
#
# Checks Performed:
#   1. DigitalOcean credentials configured
#   2. Creates Spaces bucket if it doesn't exist
#   3. Configures bucket for Terraform state storage
#
# Usage:
#   bash scripts/terraform/init-digitalocean-backend.sh
#
# Exit Codes:
#   0 - Bucket ready for use
#   1 - One or more steps failed
#
# Requirements:
#   - AWS CLI installed (DigitalOcean Spaces is S3-compatible)
#   - DigitalOcean Spaces credentials configured
#   - Environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#
# Author: Ectropy Infrastructure Team
# Last Updated: 2025-11-01

set -e

# Configuration
SPACES_BUCKET="ectropy-terraform-state"
SPACES_REGION="sfo3"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"
STATE_KEY="production/terraform.tfstate"
S3_API_REGION="us-east-1"  # Required by S3 API, but not used by DigitalOcean Spaces

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 DigitalOcean Spaces Backend Initialization"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check 1: AWS CLI is installed
echo -n "Checking AWS CLI installation... "
if ! command -v aws &>/dev/null; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   AWS CLI is not installed. Install it from: https://aws.amazon.com/cli/"
  exit 1
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
  exit 1
else
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Credentials configured"
fi
echo ""

# Check 3: Test connectivity to DigitalOcean Spaces
echo -n "Testing connectivity to DigitalOcean Spaces... "
if aws s3 ls --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Connected to: $SPACES_ENDPOINT"
else
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Unable to connect to DigitalOcean Spaces"
  echo "   Endpoint: $SPACES_ENDPOINT"
  echo "   Verify:"
  echo "     - Credentials are correct"
  echo "     - Network connectivity"
  exit 1
fi
echo ""

# Check 4: Check if bucket exists
echo -n "Checking if bucket exists... "
if aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  echo -e "${GREEN}✅ EXISTS${NC}"
  echo "   Bucket: $SPACES_BUCKET (already exists)"
  BUCKET_EXISTS=true
else
  echo -e "${YELLOW}⚠️  NOT FOUND${NC}"
  echo "   Bucket: $SPACES_BUCKET (needs to be created)"
  BUCKET_EXISTS=false
fi
echo ""

# Step 5: Create bucket if it doesn't exist
if [ "$BUCKET_EXISTS" = false ]; then
  echo -n "Creating bucket... "
  # DigitalOcean Spaces uses region us-east-1 for S3 API compatibility
  # The actual region (nyc3) is in the endpoint URL
  if aws s3 mb "s3://$SPACES_BUCKET" \
      --endpoint-url "$SPACES_ENDPOINT" \
      --region "$S3_API_REGION" 2>/dev/null; then
    echo -e "${GREEN}✅ CREATED${NC}"
    echo "   Bucket: s3://$SPACES_BUCKET"
  else
    echo -e "${RED}❌ FAILED${NC}"
    echo "   Unable to create bucket: $SPACES_BUCKET"
    echo "   This may be due to:"
    echo "     - Insufficient permissions"
    echo "     - Bucket name already taken globally"
    echo "     - DigitalOcean API limits"
    exit 1
  fi
  echo ""
fi

# Step 6: Enable versioning (if supported)
echo -n "Configuring bucket versioning... "
# Note: DigitalOcean Spaces may not support versioning like AWS S3
# This command may fail, which is acceptable
if aws s3api put-bucket-versioning \
    --bucket "$SPACES_BUCKET" \
    --versioning-configuration Status=Enabled \
    --endpoint-url "$SPACES_ENDPOINT" \
    --region "$S3_API_REGION" 2>/dev/null; then
  echo -e "${GREEN}✅ ENABLED${NC}"
  echo "   Versioning enabled for state backup"
else
  echo -e "${YELLOW}⚠️  SKIPPED${NC}"
  echo "   Versioning not supported by DigitalOcean Spaces"
  echo "   (This is expected and doesn't affect Terraform functionality)"
fi
echo ""

# Step 7: Verify bucket is accessible
echo -n "Verifying bucket accessibility... "
if aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  echo -e "${GREEN}✅ VERIFIED${NC}"
  echo "   Bucket is accessible and ready for Terraform"
else
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Bucket exists but is not accessible"
  exit 1
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ SUCCESS: DigitalOcean Spaces backend is ready${NC}"
echo ""
echo "Backend Configuration:"
echo "  • Bucket: $SPACES_BUCKET"
echo "  • Endpoint: $SPACES_ENDPOINT"
echo "  • Region: $SPACES_REGION (endpoint-based)"
echo "  • State Path: $STATE_KEY"
echo ""
echo "Terraform can now use this backend:"
echo "  cd infrastructure/terraform/"
echo "  terraform init"
echo "  terraform plan"
echo ""
echo "Backend configuration in backend.tf:"
echo "  endpoint = \"$SPACES_ENDPOINT\""
echo "  bucket   = \"$SPACES_BUCKET\""
echo "  key      = \"$STATE_KEY\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
