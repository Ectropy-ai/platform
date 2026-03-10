#!/bin/bash
# =============================================================================
# Environment Variable Validation Utility
# =============================================================================
# Validates that all required environment variables are set for a given environment
#
# Usage: bash scripts/core/validate-env.sh [environment]
#
# Arguments:
#   environment - The environment to validate (ci, staging, production, development)
#                 Default: ci
#
# Required Files:
#   scripts/core/required-env-vars-[environment].txt
#
# File Format:
#   - One variable name per line
#   - Lines starting with # are treated as comments
#   - Empty lines are ignored
#   - Variable groups can be marked as optional with # OPTIONAL: comment
#
# Exit Codes:
#   0 - All required environment variables are configured
#   1 - One or more required environment variables are missing
#   2 - Requirements file not found
#
# Examples:
#   bash scripts/core/validate-env.sh ci
#   bash scripts/core/validate-env.sh staging
#   bash scripts/core/validate-env.sh production
# =============================================================================

set -e

# Configuration
ENVIRONMENT=${1:-ci}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIRED_VARS_FILE="${SCRIPT_DIR}/required-env-vars-${ENVIRONMENT}.txt"

# Colors for output (if terminal supports it)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  NC=''
fi

# Print header
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Environment Variable Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: ${ENVIRONMENT}"
echo "Requirements File: ${REQUIRED_VARS_FILE}"
echo ""

# Check if requirements file exists
if [ ! -f "$REQUIRED_VARS_FILE" ]; then
  echo -e "${RED}❌ ERROR: Requirements file not found${NC}"
  echo "   Expected: $REQUIRED_VARS_FILE"
  echo ""
  echo "Available environments:"
  for file in "${SCRIPT_DIR}"/required-env-vars-*.txt; do
    if [ -f "$file" ]; then
      env_name=$(basename "$file" | sed 's/required-env-vars-//;s/.txt//')
      echo "   - $env_name"
    fi
  done
  echo ""
  exit 2
fi

# Initialize tracking variables
MISSING_VARS=()
PRESENT_VARS=()
OPTIONAL_VARS=()
VALIDATION_PASSED=true
CURRENT_SECTION=""
IN_OPTIONAL_SECTION=false

# Read and validate environment variables
while IFS= read -r line || [ -n "$line" ]; do
  # Trim whitespace
  line=$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  
  # Skip empty lines
  [ -z "$line" ] && continue
  
  # Check for section headers (comments that end with :)
  if [[ "$line" =~ ^#.*:$ ]]; then
    CURRENT_SECTION=$(echo "$line" | sed 's/^# *//;s/:$//')
    # Check if this is an optional section
    if [[ "$CURRENT_SECTION" =~ [Oo]ptional ]]; then
      IN_OPTIONAL_SECTION=true
    else
      IN_OPTIONAL_SECTION=false
    fi
    if [ -n "$CURRENT_SECTION" ]; then
      echo -e "${BLUE}━━━ $CURRENT_SECTION ━━━${NC}"
    fi
    continue
  fi
  
  # Skip other comments
  [[ "$line" =~ ^# ]] && continue
  
  # Extract variable name (handle inline comments)
  var_name=$(echo "$line" | awk '{print $1}')
  
  # Skip if not a valid variable name
  [[ ! "$var_name" =~ ^[A-Z_][A-Z0-9_]*$ ]] && continue
  
  # Check if variable is set
  if [ -z "${!var_name}" ]; then
    if [ "$IN_OPTIONAL_SECTION" = true ]; then
      OPTIONAL_VARS+=("$var_name")
      echo -e "${YELLOW}⚠️  Optional: $var_name (not set)${NC}"
    else
      MISSING_VARS+=("$var_name")
      VALIDATION_PASSED=false
      echo -e "${RED}❌ Missing: $var_name${NC}"
    fi
  else
    PRESENT_VARS+=("$var_name")
    # Mask sensitive values in output
    if [[ "$var_name" =~ (PASSWORD|SECRET|KEY|TOKEN) ]]; then
      echo -e "${GREEN}✅ Present: $var_name (****)${NC}"
    else
      # Show first few characters for verification
      value="${!var_name}"
      if [ ${#value} -gt 30 ]; then
        preview="${value:0:30}..."
      else
        preview="${value}"
      fi
      echo -e "${GREEN}✅ Present: $var_name${NC}"
    fi
  fi
done < "$REQUIRED_VARS_FILE"

# Print summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: ${ENVIRONMENT}"
echo "Required variables checked: $((${#PRESENT_VARS[@]} + ${#MISSING_VARS[@]}))"
echo "Present: ${#PRESENT_VARS[@]}"
echo "Missing: ${#MISSING_VARS[@]}"
if [ ${#OPTIONAL_VARS[@]} -gt 0 ]; then
  echo "Optional (not set): ${#OPTIONAL_VARS[@]}"
fi
echo ""

# Report results
if [ "$VALIDATION_PASSED" = true ]; then
  echo -e "${GREEN}✅ SUCCESS: All required environment variables are configured${NC}"
  echo -e "${GREEN}✅ Environment validation passed for: ${ENVIRONMENT}${NC}"
  
  if [ ${#OPTIONAL_VARS[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}ℹ️  Note: ${#OPTIONAL_VARS[@]} optional variable(s) not set (this is OK):${NC}"
    for var in "${OPTIONAL_VARS[@]}"; do
      echo "   - $var"
    done
  fi
  
  echo ""
  exit 0
else
  echo -e "${RED}❌ FAILURE: Environment validation failed!${NC}"
  echo -e "${RED}❌ Missing required variables:${NC}"
  for var in "${MISSING_VARS[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "📝 How to fix:"
  case $ENVIRONMENT in
    ci)
      echo "   1. Go to GitHub repository settings"
      echo "   2. Navigate to: Settings → Secrets and variables → Actions"
      echo "   3. Add the missing variables as repository secrets or variables"
      echo "   4. For environment-specific secrets, use: Settings → Environments → [env] → Secrets"
      ;;
    staging|production)
      echo "   1. Set the missing variables in your deployment environment"
      echo "   2. For GitHub Actions: Settings → Environments → ${ENVIRONMENT} → Secrets"
      echo "   3. For manual deployment: Add to .env.${ENVIRONMENT} file (never commit secrets!)"
      ;;
    development)
      echo "   1. Copy .env.local.template to .env"
      echo "   2. Update the missing variables with appropriate values"
      echo "   3. For secrets, use development-safe values (not production secrets!)"
      ;;
  esac
  echo ""
  echo "📖 For more information:"
  echo "   - See: docs/INFRASTRUCTURE_CATALOG.md (Environment Variable Management section)"
  echo "   - Template: .env.${ENVIRONMENT}.template"
  echo ""
  exit 1
fi
