#!/bin/bash
# Validate E2E required secrets
# This script checks if all required environment variables for E2E tests are present
# Usage: bash scripts/ci/validate-e2e-secrets.sh
#
# Required Environment Variables:
# - BASE_URL: Base URL for web-dashboard
# - TEST_GOOGLE_EMAIL: Google OAuth test account email
# - TEST_GOOGLE_PASSWORD: Google OAuth test account password
# - GOOGLE_CLIENT_ID: OAuth client ID for Google authentication
# - GOOGLE_CLIENT_SECRET: OAuth client secret for Google authentication
#
# Exit Codes:
# - 0: All required secrets are present
# - 1: One or more required secrets are missing

set -e

echo "🔍 Validating E2E test secrets..."
echo ""

# Define required environment variables
required_vars=(
  "BASE_URL"
  "TEST_GOOGLE_EMAIL"
  "TEST_GOOGLE_PASSWORD"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
)

# Track missing variables
missing=()

# Check each required variable
# SECURITY: NEVER log secret values (even partial values)
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing+=("$var")
    echo "❌ Missing: $var"
  else
    # All values are sensitive - never log them
    echo "✅ Present: $var"
  fi
done

echo ""

# Report results
if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ Missing required E2E secrets:"
  printf '   - %s\n' "${missing[@]}"
  echo ""
  echo "📝 To fix this issue:"
  echo "   1. Go to: https://github.com/$GITHUB_REPOSITORY/settings/secrets/actions"
  echo "   2. Add the missing secrets as repository secrets"
  echo "   3. Re-run the workflow"
  echo ""
  echo "📖 For more information, see: docs/AGENT_GUIDE.md (E2E Test Environment Variables section)"
  exit 1
fi

echo "✅ All E2E secrets present"
echo "   Total secrets validated: ${#required_vars[@]}"
echo ""

exit 0
