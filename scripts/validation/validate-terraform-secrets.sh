#!/usr/bin/env bash
# ENTERPRISE: Terraform Secrets Validation Script
# Purpose: Validate all required Terraform secrets and variables are configured in GitHub Actions
# Author: DevOps Team
# Date: 2025-12-06

set -euo pipefail

echo "🔍 ENTERPRISE TERRAFORM SECRETS VALIDATION"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Tracking
MISSING_SECRETS=0
MISSING_VARS=0
TOTAL_CHECKS=0

# Function to check if a secret exists (we can't read values, only check existence)
check_secret() {
  local secret_name=$1
  local description=$2

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  # In GitHub Actions, secrets are masked but we can check if they're empty
  if [ -z "${!secret_name:-}" ]; then
    echo -e "${RED}❌ MISSING${NC}: $secret_name"
    echo "   Description: $description"
    echo "   Required for: Terraform infrastructure management"
    echo ""
    MISSING_SECRETS=$((MISSING_SECRETS + 1))
    return 1
  else
    echo -e "${GREEN}✅ FOUND${NC}: $secret_name"
    # Show partial value for validation (first 4 chars)
    local value="${!secret_name}"
    local partial="${value:0:4}***"
    echo "   Value: $partial (${#value} chars total)"
    echo ""
    return 0
  fi
}

# Function to check environment variables
check_var() {
  local var_name=$1
  local description=$2
  local expected_format=$3

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  if [ -z "${!var_name:-}" ]; then
    echo -e "${RED}❌ MISSING${NC}: $var_name"
    echo "   Description: $description"
    echo "   Expected format: $expected_format"
    echo ""
    MISSING_VARS=$((MISSING_VARS + 1))
    return 1
  else
    echo -e "${GREEN}✅ FOUND${NC}: $var_name"
    echo "   Value: ${!var_name}"
    echo "   Expected format: $expected_format"
    echo ""
    return 0
  fi
}

# Function to validate terraform variable format
validate_terraform_var() {
  local var_name=$1
  local var_value="${!var_name:-}"
  local expected_pattern=$2

  if [[ $var_value =~ $expected_pattern ]]; then
    echo -e "   ${GREEN}Format: Valid${NC}"
    return 0
  else
    echo -e "   ${YELLOW}Format: Warning - doesn't match expected pattern${NC}"
    return 1
  fi
}

echo "## Required Secrets for Terraform"
echo ""

# DigitalOcean Access
echo "### DigitalOcean Authentication"
check_secret "DIGITALOCEAN_ACCESS_TOKEN" "DigitalOcean API token for infrastructure management"

# Terraform Backend (DigitalOcean Spaces)
echo "### Terraform Backend (DigitalOcean Spaces)"
check_secret "SPACES_ACCESS_KEY_ID" "DigitalOcean Spaces access key (S3-compatible)"
check_secret "SPACES_SECRET_ACCESS_KEY" "DigitalOcean Spaces secret key (S3-compatible)"

echo ""
echo "## Required Variables for Terraform"
echo ""

# SSH Configuration
echo "### SSH Configuration"
check_var "TF_VAR_SSH_KEY_FINGERPRINT" "SSH key fingerprint for server access" "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99"
if [ -n "${TF_VAR_SSH_KEY_FINGERPRINT:-}" ]; then
  validate_terraform_var "TF_VAR_SSH_KEY_FINGERPRINT" "^[0-9a-f]{2}(:[0-9a-f]{2}){15}$"
fi

# Network Configuration
echo "### Network Configuration"
check_var "TF_VAR_ADMIN_IP" "Admin IP address for firewall rules" "xxx.xxx.xxx.xxx"
if [ -n "${TF_VAR_ADMIN_IP:-}" ]; then
  validate_terraform_var "TF_VAR_ADMIN_IP" "^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$"
fi

# SSL Configuration
echo "### SSL Configuration"
# ENTERPRISE: SSL certificate is optional for non-production environments
# Production requires proper SSL, but staging/dev can use self-signed or HTTP
ENVIRONMENT="${ENVIRONMENT:-staging}"
if [[ "$ENVIRONMENT" == "production" ]]; then
  check_var "TF_VAR_SSL_CERTIFICATE_NAME" "SSL certificate name in DigitalOcean" "ectropy-prod-cert or ectropy-production-cert"
else
  # Optional for non-production
  if [ -n "${TF_VAR_SSL_CERTIFICATE_NAME:-}" ]; then
    echo -e "${GREEN}✅ FOUND${NC}: TF_VAR_SSL_CERTIFICATE_NAME (optional for $ENVIRONMENT)"
    echo "   Value: ${TF_VAR_SSL_CERTIFICATE_NAME}"
    echo ""
  else
    echo -e "${YELLOW}⚠️  OPTIONAL${NC}: TF_VAR_SSL_CERTIFICATE_NAME (not required for $ENVIRONMENT)"
    echo "   Description: SSL certificate name in DigitalOcean"
    echo "   Note: Production deployments will require this variable"
    echo ""
  fi
fi

# Monitoring Configuration
echo "### Monitoring Configuration"
# ENTERPRISE: Alert email is optional for non-production environments
if [[ "$ENVIRONMENT" == "production" ]]; then
  check_var "TF_VAR_ALERT_EMAIL" "Email address for infrastructure alerts" "alerts@ectropy.ai"
  if [ -n "${TF_VAR_ALERT_EMAIL:-}" ]; then
    validate_terraform_var "TF_VAR_ALERT_EMAIL" "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
  fi
else
  # Optional for non-production
  if [ -n "${TF_VAR_ALERT_EMAIL:-}" ]; then
    echo -e "${GREEN}✅ FOUND${NC}: TF_VAR_ALERT_EMAIL (optional for $ENVIRONMENT)"
    echo "   Value: ${TF_VAR_ALERT_EMAIL}"
    if validate_terraform_var "TF_VAR_ALERT_EMAIL" "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"; then
      :  # Format valid
    fi
    echo ""
  else
    echo -e "${YELLOW}⚠️  OPTIONAL${NC}: TF_VAR_ALERT_EMAIL (not required for $ENVIRONMENT)"
    echo "   Description: Email address for infrastructure alerts"
    echo "   Note: Production deployments will require this variable"
    echo ""
  fi
fi

echo ""
echo "=========================================="
echo "VALIDATION SUMMARY"
echo "=========================================="
echo ""
echo "Total checks performed: $TOTAL_CHECKS"
echo -e "Missing secrets: ${RED}$MISSING_SECRETS${NC}"
echo -e "Missing variables: ${RED}$MISSING_VARS${NC}"
echo ""

# Determine overall status
if [ $MISSING_SECRETS -gt 0 ] || [ $MISSING_VARS -gt 0 ]; then
  echo -e "${RED}❌ VALIDATION FAILED${NC}"
  echo ""
  echo "ACTION REQUIRED:"
  echo ""

  if [ $MISSING_SECRETS -gt 0 ]; then
    echo "To add missing secrets to GitHub Actions:"
    echo "  gh secret set SECRET_NAME --body \"secret-value\""
    echo "  Example: gh secret set DIGITALOCEAN_ACCESS_TOKEN --body \"dop_v1_xxxxx\""
    echo ""
  fi

  if [ $MISSING_VARS -gt 0 ]; then
    echo "To add missing variables to GitHub Actions:"
    echo "  gh variable set VARIABLE_NAME --body \"variable-value\""
    echo "  Example: gh variable set TF_VAR_ADMIN_IP --body \"203.0.113.0\""
    echo ""
  fi

  echo "For more information, see:"
  echo "  - ENTERPRISE_ACTION_PLAN_2025-12-06.md"
  echo "  - PRODUCTION_DEPLOYMENT_OPTIMIZATION_PLAN.md"
  echo ""

  exit 1
else
  echo -e "${GREEN}✅ ALL TERRAFORM SECRETS AND VARIABLES VALIDATED${NC}"
  echo ""
  echo "Terraform infrastructure management is properly configured."
  echo "Ready to run terraform operations via CI/CD."
  echo ""
  exit 0
fi
