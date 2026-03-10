#!/bin/bash
# =============================================================================
# Speckle Bootstrap Token Creation (Programmatic)
# =============================================================================
# Purpose: Create initial API token via GraphQL without Web UI
# Usage:   ./create-bootstrap-token.sh
# Date:    2026-01-10
#
# This script logs in to Speckle Server and creates an API token programmatically
# bypassing the Web UI entirely.
# =============================================================================

set -e

ADMIN_EMAIL="${SPECKLE_ADMIN_EMAIL:-speckle-admin@ectropy.ai}"
ADMIN_PASSWORD="${SPECKLE_ADMIN_PASSWORD:-Staging-speckle-admin-2026!}"
SPECKLE_SERVER="${SPECKLE_SERVER:-https://staging.ectropy.ai/speckle}"
TOKEN_NAME="Ectropy API Gateway Service Token"

echo "═══════════════════════════════════════════════════════════════"
echo "Speckle Bootstrap Token Creation (Programmatic)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Server: $SPECKLE_SERVER"
echo "Email:  $ADMIN_EMAIL"
echo ""

# Step 1: Login to get session token
echo "1️⃣  Logging in to Speckle Server..."

# Try GraphQL-based login first (Speckle v2 pattern)
LOGIN_RESPONSE=$(curl -s -c cookies.txt -X POST "$SPECKLE_SERVER/graphql" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation TokenCreate(\$token: ApiTokenCreateInput!) { apiTokenCreate(token: \$token) }\",
    \"variables\": {
      \"token\": {
        \"name\": \"$TOKEN_NAME\",
        \"scopes\": [\"streams:read\", \"streams:write\", \"profile:read\"]
      }
    }
  }" 2>&1)

# Check if we got an auth error (no session)
if echo "$LOGIN_RESPONSE" | grep -q "not authenticated\|Unauthorized"; then
  echo "❌ Not authenticated - trying database token creation..."

  # Fallback: Use bootstrap script that creates token directly in DB
  if [ -f "./scripts/speckle/bootstrap-admin.sh" ]; then
    echo "2️⃣  Running database bootstrap script..."
    bash ./scripts/speckle/bootstrap-admin.sh
  else
    echo "❌ Error: bootstrap-admin.sh not found"
    echo ""
    echo "Manual steps required:"
    echo "1. Access Speckle Web UI via SSH tunnel or fix base path configuration"
    echo "2. Login with: $ADMIN_EMAIL"
    echo "3. Create token via Developer Settings"
    exit 1
  fi
else
  # Check if token was created successfully
  if echo "$LOGIN_RESPONSE" | grep -q '"apiTokenCreate"'; then
    API_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.apiTokenCreate // empty')

    if [ -n "$API_TOKEN" ] && [ "$API_TOKEN" != "null" ]; then
      echo "✅ Token created successfully via GraphQL!"
      echo ""
      echo "═══════════════════════════════════════════════════════════════"
      echo "✅ BOOTSTRAP COMPLETE"
      echo "═══════════════════════════════════════════════════════════════"
      echo ""
      echo "API Token:"
      echo "  $API_TOKEN"
      echo ""
      echo "📝 Next Steps:"
      echo ""
      echo "1. Update .env file:"
      echo "   ssh ectropy-staging \"sed -i 's/SPECKLE_SERVER_TOKEN=.*/SPECKLE_SERVER_TOKEN=$API_TOKEN/' /var/www/ectropy/.env && docker restart ectropy-api-gateway\""
      echo ""
      echo "2. Or update GitHub Secret:"
      echo "   gh secret set SPECKLE_SERVER_TOKEN --body \"$API_TOKEN\""
      echo ""
      echo "3. Verify token works:"
      echo "   ./scripts/speckle/verify-token.sh $API_TOKEN"
      echo ""
      exit 0
    fi
  fi

  echo "❌ Token creation failed - response:"
  echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
  echo ""
  echo "Trying database bootstrap as fallback..."

  if [ -f "./scripts/speckle/bootstrap-admin.sh" ]; then
    bash ./scripts/speckle/bootstrap-admin.sh
  else
    echo "❌ Error: bootstrap-admin.sh not found"
    exit 1
  fi
fi

# Cleanup
rm -f cookies.txt

echo "═══════════════════════════════════════════════════════════════"
