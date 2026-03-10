#!/bin/bash

# Validate Workflow Environment Context Compliance
# Part of environment-secret drift remediation
#
# Purpose: Ensures workflows using environment-scoped variables/secrets
#          properly declare environment context
#
# Usage: bash scripts/ci/validate-workflow-environments.sh
#
# Exit codes:
#   0 - All workflows compliant
#   1 - One or more workflows missing environment context

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Validating Workflow Environment Context Compliance${NC}"
echo "========================================================"
echo ""

WORKFLOW_DIR=".github/workflows"
ERRORS=0
WARNINGS=0
CHECKED=0

# Environment-scoped variables that require environment declaration
ENV_SCOPED_VARS=(
  "vars.DATABASE_HOST"
  "vars.DATABASE_PORT"
  "vars.DATABASE_NAME"
  "vars.DATABASE_USER"
  "vars.REDIS_HOST"
  "vars.REDIS_PORT"
  "vars.API_HOST"
  "vars.API_PORT"
  "vars.MCP_HOST"
  "vars.MCP_PORT"
  "vars.WEB_HOST"
  "vars.WEB_PORT"
)

# Environment-scoped secrets that require environment declaration
ENV_SCOPED_SECRETS=(
  "secrets.DB_PASSWORD"
  "secrets.REDIS_PASSWORD"
  "secrets.JWT_SECRET"
  "secrets.JWT_REFRESH_SECRET"
  "secrets.SESSION_SECRET"
  "secrets.GOOGLE_CLIENT_ID"
  "secrets.GOOGLE_CLIENT_SECRET"
  "secrets.ENCRYPTION_KEY"
  "secrets.DO_HOST"
  "secrets.DO_SSH_KEY"
  "secrets.OPENAI_API_KEY"
  "secrets.SPECKLE_POSTGRES_PASSWORD"
  "secrets.SPECKLE_REDIS_PASSWORD"
  "secrets.SPECKLE_SESSION_SECRET"
  "secrets.GF_SECURITY_ADMIN_PASSWORD"
)

# Check if workflow directory exists
if [ ! -d "$WORKFLOW_DIR" ]; then
  echo -e "${RED}❌ Workflow directory not found: $WORKFLOW_DIR${NC}"
  exit 1
fi

# Get all workflow files (excluding archived and templates)
WORKFLOW_FILES=$(find "$WORKFLOW_DIR" -maxdepth 1 -name "*.yml" -type f | grep -v "\.archive" | grep -v "TEMPLATE" || true)

if [ -z "$WORKFLOW_FILES" ]; then
  echo -e "${YELLOW}⚠️  No workflow files found${NC}"
  exit 0
fi

echo "Found $(echo "$WORKFLOW_FILES" | wc -l | tr -d ' ') workflow file(s) to check"
echo ""

# Function to check if workflow uses environment-scoped variables/secrets
uses_env_scoped_resources() {
  local workflow="$1"
  local uses_resources=false
  
  # Check for environment-scoped variables
  for var in "${ENV_SCOPED_VARS[@]}"; do
    if grep -q "\${{ $var }}" "$workflow" 2>/dev/null; then
      uses_resources=true
      break
    fi
  done
  
  # Check for environment-scoped secrets
  if [ "$uses_resources" = false ]; then
    for secret in "${ENV_SCOPED_SECRETS[@]}"; do
      if grep -q "\${{ $secret }}" "$workflow" 2>/dev/null; then
        uses_resources=true
        break
      fi
    done
  fi
  
  echo "$uses_resources"
}

# Function to check if workflow declares environment context
has_environment_declaration() {
  local workflow="$1"
  
  # Check if any job declares environment context
  # Look for "environment:" followed by either:
  # 1. A standard environment name (test, develop, staging, production, etc.)
  # 2. A dynamic environment with "name:" key
  # 3. A variable/expression (e.g., ${{ inputs.environment }})
  if grep -E "^[[:space:]]*environment:[[:space:]]*(test|develop|staging|production|production-infrastructure|alpha|beta|github-pages|copilot)" "$workflow" >/dev/null 2>&1; then
    echo "true"
  elif grep -E "^[[:space:]]*environment:" "$workflow" >/dev/null 2>&1 && \
       grep -A1 "^[[:space:]]*environment:" "$workflow" | grep -E "^[[:space:]]*name:" >/dev/null 2>&1; then
    # Dynamic environment with name: key
    echo "true"
  elif grep -E "^[[:space:]]*environment:[[:space:]]*\\\$\{\{" "$workflow" >/dev/null 2>&1; then
    # Environment from variable/expression
    echo "true"
  else
    echo "false"
  fi
}

# Check each workflow
for workflow in $WORKFLOW_FILES; do
  workflow_name=$(basename "$workflow")
  CHECKED=$((CHECKED + 1))
  
  # Skip if workflow doesn't exist
  if [ ! -f "$workflow" ]; then
    continue
  fi
  
  # Check if workflow uses environment-scoped resources
  uses_env_resources=$(uses_env_scoped_resources "$workflow")
  
  if [ "$uses_env_resources" = "true" ]; then
    # Workflow uses environment-scoped resources, check for environment declaration
    has_env_declaration=$(has_environment_declaration "$workflow")
    
    if [ "$has_env_declaration" = "false" ]; then
      echo -e "${RED}❌ $workflow_name${NC}"
      echo "   Uses environment-scoped variables/secrets but missing 'environment:' declaration"
      echo ""
      echo "   Fix: Add 'environment: <env-name>' to affected jobs"
      echo "   Example:"
      echo "     jobs:"
      echo "       my-job:"
      echo "         runs-on: self-hosted"
      echo "         environment: develop  # or test, staging, production"
      echo "         env:"
      echo "           DATABASE_URL: postgresql://\${{ vars.DATABASE_USER }}:..."
      echo ""
      echo "   See: docs/AGENT_GUIDE.md § Environment-Secret Configuration Matrix"
      echo ""
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${GREEN}✅ $workflow_name${NC}"
      echo "   Correctly declares environment context for environment-scoped resources"
    fi
  else
    echo -e "${BLUE}ℹ️  $workflow_name${NC}"
    echo "   No environment-scoped resources detected (OK)"
  fi
done

echo ""
echo "========================================================"
echo "Checked: $CHECKED workflow(s)"
echo ""

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}❌ VALIDATION FAILED${NC}"
  echo "   Errors: $ERRORS"
  echo "   Warnings: $WARNINGS"
  echo ""
  echo "Fix the errors above by adding 'environment:' declarations to workflows"
  echo "that use environment-scoped variables or secrets."
  echo ""
  echo "Available environments:"
  echo "  - test"
  echo "  - develop"
  echo "  - staging"
  echo "  - production"
  echo "  - production-infrastructure"
  echo ""
  echo "Documentation: docs/AGENT_GUIDE.md § Environment-Secret Configuration Matrix"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  VALIDATION PASSED WITH WARNINGS${NC}"
  echo "   Warnings: $WARNINGS"
  exit 0
else
  echo -e "${GREEN}✅ ALL WORKFLOWS COMPLIANT${NC}"
  echo "   All workflows correctly declare environment context where needed"
  exit 0
fi
