#!/bin/bash

# Validate Secret Synchronization Across Environments
# Part of environment-secret drift remediation
#
# Purpose: Validates that critical secrets are configured in all required environments
#          and reports any missing secrets that could cause deployment failures
#
# NOTE: This script uses GitHub CLI to check secret metadata (presence/absence)
#       It CANNOT read secret values for security reasons
#
# Usage: bash scripts/security/validate-secret-sync.sh
#
# Prerequisites: GitHub CLI (gh) must be installed and authenticated
#
# Exit codes:
#   0 - All required secrets present
#   1 - One or more required secrets missing

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔒 Secret Synchronization Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo -e "${RED}❌ GitHub CLI (gh) not found${NC}"
  echo ""
  echo "This script requires GitHub CLI to check secret configuration."
  echo ""
  echo "Install GitHub CLI:"
  echo "  macOS:   brew install gh"
  echo "  Ubuntu:  sudo apt install gh"
  echo "  Windows: winget install GitHub.cli"
  echo ""
  echo "Then authenticate: gh auth login"
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo -e "${RED}❌ GitHub CLI not authenticated${NC}"
  echo ""
  echo "Authenticate with: gh auth login"
  exit 1
fi

# Core environments that require secret synchronization
CORE_ENVIRONMENTS=("test" "develop" "staging" "production")

# Secrets that MUST be synchronized across all core environments
CRITICAL_SECRETS=(
  "DB_PASSWORD"
  "REDIS_PASSWORD"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "SESSION_SECRET"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "ENCRYPTION_KEY"
)

# Optional secrets (feature-specific, not required in all environments)
OPTIONAL_SECRETS=(
  "OPENAI_API_KEY"
  "SPECKLE_POSTGRES_PASSWORD"
  "SPECKLE_REDIS_PASSWORD"
  "SPECKLE_SESSION_SECRET"
  "GF_SECURITY_ADMIN_PASSWORD"
)

# Environment-specific secrets (only needed in specific environments)
declare -A ENV_SPECIFIC_SECRETS
ENV_SPECIFIC_SECRETS["staging"]="DO_HOST DO_SSH_KEY"

MISSING_COUNT=0
OPTIONAL_MISSING_COUNT=0

echo "Checking secret presence across 4 core environments:"
echo "  - test"
echo "  - develop"
echo "  - staging"
echo "  - production"
echo ""

# Function to check if secret exists in environment
secret_exists() {
  local env="$1"
  local secret="$2"
  
  # Use gh CLI to check if secret exists
  # Note: This only checks presence, not value
  if gh secret list --env "$env" 2>/dev/null | grep -q "^$secret"; then
    echo "true"
  else
    echo "false"
  fi
}

# Function to display secret status for an environment
display_secret_status() {
  local env="$1"
  local secret="$2"
  local exists="$3"
  
  if [ "$exists" = "true" ]; then
    echo -e "  ${GREEN}✅ $env${NC}: Configured"
  else
    echo -e "  ${RED}❌ $env${NC}: MISSING"
  fi
}

echo -e "${CYAN}━━━ Critical Secrets (Required in All Environments) ━━━${NC}"
echo ""

# Check critical secrets
for secret in "${CRITICAL_SECRETS[@]}"; do
  echo -e "${BLUE}Secret: $secret${NC}"
  
  all_configured=true
  
  for env in "${CORE_ENVIRONMENTS[@]}"; do
    exists=$(secret_exists "$env" "$secret")
    display_secret_status "$env" "$secret" "$exists"
    
    if [ "$exists" = "false" ]; then
      all_configured=false
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done
  
  if [ "$all_configured" = "true" ]; then
    echo -e "  ${GREEN}✓ Synchronized across all environments${NC}"
  else
    echo -e "  ${RED}✗ Missing in one or more environments${NC}"
  fi
  
  echo ""
done

echo -e "${CYAN}━━━ Optional Secrets (Feature-Specific) ━━━${NC}"
echo ""

# Check optional secrets
for secret in "${OPTIONAL_SECRETS[@]}"; do
  echo -e "${BLUE}Secret: $secret (optional)${NC}"
  
  configured_count=0
  
  for env in "${CORE_ENVIRONMENTS[@]}"; do
    exists=$(secret_exists "$env" "$secret")
    
    if [ "$exists" = "true" ]; then
      echo -e "  ${GREEN}✅ $env${NC}: Configured"
      configured_count=$((configured_count + 1))
    else
      echo -e "  ${YELLOW}⚠️  $env${NC}: Not configured (OK if feature not used)"
      OPTIONAL_MISSING_COUNT=$((OPTIONAL_MISSING_COUNT + 1))
    fi
  done
  
  if [ "$configured_count" -eq 0 ]; then
    echo -e "  ${YELLOW}ℹ️  Not configured in any environment (feature likely not in use)${NC}"
  elif [ "$configured_count" -lt 4 ]; then
    echo -e "  ${YELLOW}⚠️  Configured in $configured_count/4 environments (verify intentional)${NC}"
  else
    echo -e "  ${GREEN}✓ Configured in all environments${NC}"
  fi
  
  echo ""
done

echo -e "${CYAN}━━━ Environment-Specific Secrets ━━━${NC}"
echo ""

# Check environment-specific secrets
for env in "${!ENV_SPECIFIC_SECRETS[@]}"; do
  echo -e "${BLUE}Environment: $env${NC}"
  
  for secret in ${ENV_SPECIFIC_SECRETS[$env]}; do
    exists=$(secret_exists "$env" "$secret")
    
    if [ "$exists" = "true" ]; then
      echo -e "  ${GREEN}✅ $secret${NC}: Configured"
    else
      echo -e "  ${RED}❌ $secret${NC}: MISSING (required for $env)"
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done
  
  echo ""
done

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ $MISSING_COUNT -gt 0 ]; then
  echo -e "${RED}❌ VALIDATION FAILED${NC}"
  echo "   Missing critical secrets: $MISSING_COUNT"
  echo "   Optional secrets not configured: $OPTIONAL_MISSING_COUNT (may be OK)"
  echo ""
  echo -e "${YELLOW}To fix missing secrets:${NC}"
  echo ""
  echo "  1. Set secret value (interactive prompt):"
  echo "     gh secret set SECRET_NAME --env ENVIRONMENT_NAME"
  echo ""
  echo "  2. Set secret from file:"
  echo "     gh secret set SECRET_NAME --env ENVIRONMENT_NAME < secret.txt"
  echo ""
  echo "  3. Set secret from stdin:"
  echo "     echo 'secret-value' | gh secret set SECRET_NAME --env ENVIRONMENT_NAME"
  echo ""
  echo "Example: Configure DB_PASSWORD for production:"
  echo "  gh secret set DB_PASSWORD --env production"
  echo ""
  echo "Documentation: docs/AGENT_GUIDE.md § Environment-Secret Configuration Matrix"
  exit 1
else
  echo -e "${GREEN}✅ ALL CRITICAL SECRETS CONFIGURED${NC}"
  echo "   All required secrets are present in their respective environments"
  
  if [ $OPTIONAL_MISSING_COUNT -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}ℹ️  $OPTIONAL_MISSING_COUNT optional secret(s) not configured${NC}"
    echo "   This is OK if those features are not in use"
    echo "   See docs/AGENT_GUIDE.md for optional secret purposes"
  fi
  
  echo ""
  echo "Next steps:"
  echo "  1. Verify secret VALUES are synchronized (this script only checks presence)"
  echo "  2. Check secret rotation schedules (docs/INFRASTRUCTURE_CATALOG.md § 5.6)"
  echo "  3. Run workflow validation: bash scripts/ci/validate-workflow-environments.sh"
  
  exit 0
fi
