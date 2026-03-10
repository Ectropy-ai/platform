#!/bin/bash
#
# DigitalOcean Spaces Terraform Bucket Diagnostics
#
# Purpose: Diagnose and potentially create the Terraform state bucket
# Usage:
#   export AWS_ACCESS_KEY_ID="your-spaces-key"
#   export AWS_SECRET_ACCESS_KEY="your-spaces-secret"
#   bash scripts/terraform/diagnose-spaces-bucket.sh

set -e

SPACES_BUCKET="ectropy-terraform-state"
SPACES_REGION="sfo3"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"
S3_API_REGION="us-east-1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 DigitalOcean Spaces Terraform Bucket Diagnostics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check 1: AWS CLI
echo -n "Checking AWS CLI... "
if ! command -v aws &>/dev/null; then
  echo -e "${RED}❌ NOT FOUND${NC}"
  exit 1
fi
echo -e "${GREEN}✅ FOUND${NC}"
aws --version 2>&1 | head -1
echo ""

# Check 2: Credentials
echo -n "Checking credentials... "
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo -e "${RED}❌ NOT SET${NC}"
  echo "Set environment variables:"
  echo "  export AWS_ACCESS_KEY_ID='your-spaces-key'"
  echo "  export AWS_SECRET_ACCESS_KEY='your-spaces-secret'"
  exit 1
fi
echo -e "${GREEN}✅ SET${NC}"
echo ""

# Check 3: Test connection
echo -n "Testing connection to $SPACES_ENDPOINT... "
if aws s3 ls --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  echo -e "${GREEN}✅ CONNECTED${NC}"
else
  echo -e "${RED}❌ FAILED${NC}"
  echo "Cannot connect to DigitalOcean Spaces. Check:"
  echo "  - Credentials are correct"
  echo "  - Network connectivity"
  echo "  - Endpoint URL: $SPACES_ENDPOINT"
  exit 1
fi
echo ""

# Check 4: List all buckets
echo "Listing all buckets in $SPACES_REGION:"
aws s3 ls --endpoint-url "$SPACES_ENDPOINT" 2>&1 | sed 's/^/  /'
echo ""

# Check 5: Check if target bucket exists
echo -n "Checking if '$SPACES_BUCKET' exists... "
if aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
  echo -e "${GREEN}✅ EXISTS${NC}"
  echo ""
  echo "Bucket contents:"
  aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" --recursive 2>&1 | head -20 | sed 's/^/  /'
  echo ""
  echo -e "${GREEN}✅ BUCKET READY${NC} - No action needed"
  echo "The Terraform backend initialization script will detect this bucket."
  exit 0
else
  echo -e "${YELLOW}⚠️  NOT FOUND${NC}"
fi
echo ""

# Check 6: Try to create bucket
echo "Attempting to create bucket '$SPACES_BUCKET'..."
echo ""

if aws s3 mb "s3://$SPACES_BUCKET" \
    --endpoint-url "$SPACES_ENDPOINT" \
    --region "$S3_API_REGION" 2>&1; then
  echo ""
  echo -e "${GREEN}✅ BUCKET CREATED SUCCESSFULLY${NC}"
  echo ""
  echo "Verifying bucket access..."
  if aws s3 ls "s3://$SPACES_BUCKET" --endpoint-url "$SPACES_ENDPOINT" &>/dev/null; then
    echo -e "${GREEN}✅ BUCKET ACCESSIBLE${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}✅ SUCCESS${NC} - Terraform state bucket is ready"
    echo ""
    echo "Bucket: $SPACES_BUCKET"
    echo "Region: $SPACES_REGION"
    echo "Endpoint: $SPACES_ENDPOINT"
    echo ""
    echo "Next steps:"
    echo "  1. Run: terraform init"
    echo "  2. Or re-run the Terraform drift detection workflow"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  else
    echo -e "${RED}❌ BUCKET NOT ACCESSIBLE${NC}"
    exit 1
  fi
else
  echo ""
  echo -e "${RED}❌ BUCKET CREATION FAILED${NC}"
  echo ""
  echo "Possible reasons:"
  echo "  1. Bucket name 'ectropy-terraform-state' is globally taken"
  echo "  2. Insufficient permissions on your Spaces credentials"
  echo "  3. DigitalOcean Spaces API rate limiting"
  echo ""
  echo "Recommended actions:"
  echo "  1. Try a unique bucket name: 'luhtech-ectropy-terraform-state'"
  echo "  2. Check permissions in DigitalOcean console"
  echo "  3. Manually create bucket via DigitalOcean web console"
  echo ""
  exit 1
fi
