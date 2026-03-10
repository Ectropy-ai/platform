#!/bin/bash
#
# Terraform Backend Validation Script
#
# Purpose: Validates that the Terraform backend (AWS S3 + DynamoDB) is properly
#          configured and accessible before running Terraform operations.
#
# Checks Performed:
#   1. AWS credentials configured and valid
#   2. S3 bucket exists and is accessible
#   3. DynamoDB table exists and is in ACTIVE state
#   4. S3 bucket versioning is enabled
#   5. Network connectivity to AWS services
#
# Usage:
#   bash scripts/terraform/validate-backend.sh
#
# Exit Codes:
#   0 - All validations passed
#   1 - One or more validations failed
#
# Requirements:
#   - AWS CLI installed and configured
#   - Valid AWS credentials with appropriate permissions
#   - Network access to AWS us-west-1 region
#
# Author: Ectropy Infrastructure Team
# Last Updated: 2025-10-31

set -e

# Configuration
S3_BUCKET="ectropy-terraform-state"
DYNAMODB_TABLE="ectropy-terraform-locks"
AWS_REGION="us-west-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Validation tracking
VALIDATION_FAILED=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Terraform Backend Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check 1: AWS CLI is installed
echo -n "Checking AWS CLI installation... "
if ! command -v aws &>/dev/null; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   AWS CLI is not installed. Install it from: https://aws.amazon.com/cli/"
  VALIDATION_FAILED=1
else
  # More robust version parsing with fallback
  AWS_VERSION=$(aws --version 2>&1 | head -n1 || echo "aws-cli (version unknown)")
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   $AWS_VERSION"
fi
echo ""

# Check 2: AWS credentials are configured
echo -n "Checking AWS credentials... "
if ! aws sts get-caller-identity --region "$AWS_REGION" &>/dev/null; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   AWS credentials are not configured or invalid."
  echo "   Configure credentials using: aws configure"
  echo "   Or set environment variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
  VALIDATION_FAILED=1
else
  CALLER_IDENTITY=$(aws sts get-caller-identity --region "$AWS_REGION" --output json 2>/dev/null)
  AWS_ACCOUNT=$(echo "$CALLER_IDENTITY" | jq -r '.Account' 2>/dev/null || echo "unknown")
  # Extract principal name, handling both user ARNs and role ARNs
  AWS_ARN=$(echo "$CALLER_IDENTITY" | jq -r '.Arn' 2>/dev/null || echo "unknown")
  AWS_PRINCIPAL=$(echo "$AWS_ARN" | awk -F'/' '{print $NF}' || echo "unknown")
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   AWS Account: $AWS_ACCOUNT"
  echo "   Principal: $AWS_PRINCIPAL"
  echo "   ARN: $AWS_ARN"
fi
echo ""

# Check 3: S3 bucket exists and is accessible
echo -n "Checking S3 bucket accessibility... "
if ! aws s3 ls "s3://$S3_BUCKET" --region "$AWS_REGION" &>/dev/null; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   S3 bucket '$S3_BUCKET' is not accessible in region $AWS_REGION"
  echo "   Verify:"
  echo "   - Bucket exists: aws s3 ls"
  echo "   - IAM permissions include s3:ListBucket, s3:GetObject, s3:PutObject"
  echo "   - Region is correct: $AWS_REGION"
  VALIDATION_FAILED=1
else
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Bucket: s3://$S3_BUCKET (accessible)"
fi
echo ""

# Check 4: S3 bucket versioning is enabled
echo -n "Checking S3 bucket versioning... "
VERSIONING=$(aws s3api get-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --region "$AWS_REGION" \
  --query 'Status' \
  --output text 2>/dev/null || echo "ERROR")

if [ "$VERSIONING" = "ERROR" ]; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Unable to check versioning status for bucket '$S3_BUCKET'"
  echo "   Verify IAM permissions include s3:GetBucketVersioning"
  VALIDATION_FAILED=1
elif [ "$VERSIONING" != "Enabled" ]; then
  echo -e "${YELLOW}⚠️  WARNING${NC}"
  echo "   S3 bucket versioning is NOT enabled (current status: $VERSIONING)"
  echo "   Versioning provides state rollback capability and is highly recommended"
  echo "   Enable with: aws s3api put-bucket-versioning --bucket $S3_BUCKET --versioning-configuration Status=Enabled"
else
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Versioning: Enabled"
fi
echo ""

# Check 5: S3 bucket encryption
echo -n "Checking S3 bucket encryption... "
ENCRYPTION=$(aws s3api get-bucket-encryption \
  --bucket "$S3_BUCKET" \
  --region "$AWS_REGION" \
  --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
  --output text 2>/dev/null || echo "NONE")

if [ "$ENCRYPTION" = "NONE" ] || [ "$ENCRYPTION" = "ERROR" ]; then
  echo -e "${YELLOW}⚠️  WARNING${NC}"
  echo "   S3 bucket encryption is not configured"
  echo "   Enable default encryption for enhanced security"
else
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Encryption: $ENCRYPTION"
fi
echo ""

# Check 6: DynamoDB table exists and is active
echo -n "Checking DynamoDB table... "
TABLE_STATUS=$(aws dynamodb describe-table \
  --table-name "$DYNAMODB_TABLE" \
  --region "$AWS_REGION" \
  --query 'Table.TableStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$TABLE_STATUS" = "NOT_FOUND" ]; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   DynamoDB table '$DYNAMODB_TABLE' not found in region $AWS_REGION"
  echo "   Verify:"
  echo "   - Table exists: aws dynamodb list-tables --region $AWS_REGION"
  echo "   - IAM permissions include dynamodb:DescribeTable"
  VALIDATION_FAILED=1
elif [ "$TABLE_STATUS" != "ACTIVE" ]; then
  echo -e "${YELLOW}⚠️  WARNING${NC}"
  echo "   DynamoDB table '$DYNAMODB_TABLE' exists but is not ACTIVE"
  echo "   Current status: $TABLE_STATUS"
  echo "   Wait for table to become ACTIVE before running Terraform operations"
  VALIDATION_FAILED=1
else
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Table: $DYNAMODB_TABLE (status: ACTIVE)"
fi
echo ""

# Check 7: DynamoDB table has correct key schema
echo -n "Checking DynamoDB table key schema... "
KEY_SCHEMA=$(aws dynamodb describe-table \
  --table-name "$DYNAMODB_TABLE" \
  --region "$AWS_REGION" \
  --query 'Table.KeySchema[?KeyType==`HASH`].AttributeName' \
  --output text 2>/dev/null || echo "ERROR")

if [ "$KEY_SCHEMA" = "ERROR" ]; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   Unable to check key schema for table '$DYNAMODB_TABLE'"
  VALIDATION_FAILED=1
elif [ "$KEY_SCHEMA" != "LockID" ]; then
  echo -e "${RED}❌ FAILED${NC}"
  echo "   DynamoDB table key schema is incorrect"
  echo "   Expected partition key: LockID (String)"
  echo "   Found: $KEY_SCHEMA"
  echo "   Terraform state locking requires a partition key named 'LockID'"
  VALIDATION_FAILED=1
else
  echo -e "${GREEN}✅ PASSED${NC}"
  echo "   Partition Key: LockID (correct)"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $VALIDATION_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ SUCCESS: All validations passed${NC}"
  echo ""
  echo "Terraform backend is properly configured:"
  echo "  • S3 Bucket: $S3_BUCKET"
  echo "  • DynamoDB Table: $DYNAMODB_TABLE"
  echo "  • AWS Region: $AWS_REGION"
  echo "  • Versioning: $VERSIONING"
  echo "  • Encryption: $ENCRYPTION"
  echo ""
  echo "You can now run Terraform commands:"
  echo "  cd terraform/"
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
  echo "  • Configure AWS credentials: aws configure"
  echo "  • Verify IAM permissions for S3 and DynamoDB"
  echo "  • Check network connectivity to AWS region $AWS_REGION"
  echo "  • Ensure resources were created by administrator"
  echo ""
  exit 1
fi
