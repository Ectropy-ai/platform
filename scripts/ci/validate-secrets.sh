#!/bin/bash
# =============================================================================
# Secret Validation Utility
# =============================================================================
# Validates that required secrets are set (non-empty) in the current environment.
# Uses shell-native [ -z ] checks only — no external tools.
#
# Usage: bash scripts/ci/validate-secrets.sh [environment]
#
# Arguments:
#   environment - The environment to validate (test, staging, production)
#                 Default: test
#
# Exit Codes:
#   0 - All required secrets are present
#   1 - One or more required secrets are missing
# =============================================================================

set -e

ENVIRONMENT=${1:-test}
MISSING=()
PRESENT=0

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔐 Secret Validation — Environment: ${ENVIRONMENT}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_secret() {
  local name="$1"
  local required="$2"  # "required" or "optional"
  local value="${!name}"

  if [ -z "$value" ]; then
    if [ "$required" = "required" ]; then
      MISSING+=("$name")
      echo "  ❌ Missing: $name"
    else
      echo "  ⚠️  Optional: $name (not set)"
    fi
  else
    PRESENT=$((PRESENT + 1))
    echo "  ✅ Present: $name (****)"
  fi
}

# ━━━ Core Database & Cache ━━━
echo "━━━ Core Database & Cache ━━━"
check_secret "DB_PASSWORD" "required"
check_secret "REDIS_PASSWORD" "required"

# ━━━ Authentication ━━━
echo "━━━ Authentication ━━━"
check_secret "JWT_SECRET" "required"
check_secret "JWT_REFRESH_SECRET" "required"
check_secret "SESSION_SECRET" "required"
check_secret "ENCRYPTION_KEY" "required"

# ━━━ OAuth ━━━
echo "━━━ OAuth ━━━"
check_secret "GOOGLE_CLIENT_ID" "required"
check_secret "GOOGLE_CLIENT_SECRET" "required"

# ━━━ Speckle BIM (optional for test builds) ━━━
echo "━━━ Speckle BIM ━━━"
if [ "$ENVIRONMENT" = "test" ]; then
  check_secret "SPECKLE_POSTGRES_PASSWORD" "optional"
  check_secret "SPECKLE_REDIS_PASSWORD" "optional"
  check_secret "SPECKLE_SESSION_SECRET" "optional"
else
  check_secret "SPECKLE_POSTGRES_PASSWORD" "required"
  check_secret "SPECKLE_REDIS_PASSWORD" "required"
  check_secret "SPECKLE_SESSION_SECRET" "required"
fi

# ━━━ External Services (optional for test builds) ━━━
echo "━━━ External Services ━━━"
if [ "$ENVIRONMENT" = "test" ]; then
  check_secret "OPENAI_API_KEY" "optional"
else
  check_secret "OPENAI_API_KEY" "required"
fi

# ━━━ Summary ━━━
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Secret Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: ${ENVIRONMENT}"
echo "Present: ${PRESENT}"
echo "Missing (required): ${#MISSING[@]}"
echo ""

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "✅ All required secrets are configured"
  exit 0
else
  echo "❌ Missing required secrets:"
  for var in "${MISSING[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "📝 To fix: Add missing secrets to GitHub Settings → Environments → staging → Secrets"
  echo ""
  exit 1
fi
