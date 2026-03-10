#!/bin/bash
# =============================================================================
# Speckle Server v2 - API Token Management
# =============================================================================
# Purpose: Create and manage API tokens via GraphQL API and Web UI
# Usage:   ./create-api-token.sh [environment] [token-name]
# Author:  Ectropy Infrastructure Team
# Date:    2026-01-10
#
# IMPORTANT: Speckle Server v2 Architecture
# -----------------------------------------
# - /speckle/authn/register → Frontend UI (Nuxt.js, port 3101) - NOT an API
# - /speckle/graphql → GraphQL API (Speckle Server, port 3100)
# - /speckle/api/ → REST API (limited to file operations)
#
# Industry Standard Pattern:
# 1. Initial Setup: Create first token via Web UI (/speckle/)
# 2. Programmatic: Use GraphQL apiTokenCreate mutation with existing token
# 3. No REST API for token creation in Speckle v2
# =============================================================================

set -e

# =============================================================================
# Configuration
# =============================================================================

ENVIRONMENT="${1:-staging}"
TOKEN_NAME="${2:-Ectropy Service Token $(date +%Y-%m-%d)}"

# Environment-specific endpoints
case "$ENVIRONMENT" in
  staging)
    SPECKLE_URL="https://staging.ectropy.ai/speckle"
    SPECKLE_WEB_UI="https://staging.ectropy.ai/speckle"
    ;;
  production)
    SPECKLE_URL="https://ectropy.ai/speckle"
    SPECKLE_WEB_UI="https://ectropy.ai/speckle"
    ;;
  development)
    SPECKLE_URL="http://localhost:8080"
    SPECKLE_WEB_UI="http://localhost:8080"
    ;;
  *)
    echo "❌ ERROR: Invalid environment '$ENVIRONMENT'"
    echo "Usage: $0 [staging|production|development] [token-name]"
    exit 1
    ;;
esac

GRAPHQL_ENDPOINT="${SPECKLE_URL}/graphql"

# =============================================================================
# Functions
# =============================================================================

print_header() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "$1"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""
}

# =============================================================================
# Method 1: Using Existing Service Token
# =============================================================================
create_token_with_service_account() {
  print_header "Method 1: Create Token Using Service Account"

  # Check if SPECKLE_SERVER_TOKEN is available
  if [ -z "$SPECKLE_SERVER_TOKEN" ]; then
    echo "⚠️  SPECKLE_SERVER_TOKEN not found in environment"
    echo "Please export SPECKLE_SERVER_TOKEN or pass it as argument"
    return 1
  fi

  echo "📋 Configuration:"
  echo "   Environment:  $ENVIRONMENT"
  echo "   GraphQL URL:  $GRAPHQL_ENDPOINT"
  echo "   Token Name:   $TOKEN_NAME"
  echo "   Existing Token: ${SPECKLE_SERVER_TOKEN:0:20}..."
  echo ""

  # Query to get current user info (validates existing token)
  echo "🔍 Validating existing service token..."
  USER_QUERY='{"query":"query { activeUser { id email name } }"}'

  USER_RESULT=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SPECKLE_SERVER_TOKEN" \
    -d "$USER_QUERY")

  # Check if user query succeeded
  if echo "$USER_RESULT" | jq -e '.errors' > /dev/null 2>&1; then
    echo "❌ ERROR: Service token validation failed"
    echo "$USER_RESULT" | jq .
    return 1
  fi

  USER_EMAIL=$(echo "$USER_RESULT" | jq -r '.data.activeUser.email // empty')

  if [ -z "$USER_EMAIL" ]; then
    echo "❌ ERROR: Could not retrieve user info"
    echo "$USER_RESULT" | jq .
    return 1
  fi

  echo "✅ Authenticated as: $USER_EMAIL"
  echo ""

  # Create new API token
  echo "🔑 Creating new API token..."

  # GraphQL mutation to create token
  CREATE_TOKEN_MUTATION=$(cat <<'EOF'
{
  "query": "mutation CreateToken($token: ApiTokenCreateInput!) { apiTokenCreate(token: $token) }",
  "variables": {
    "token": {
      "name": "'"$TOKEN_NAME"'",
      "scopes": ["streams:read", "streams:write", "profile:read"]
    }
  }
}
EOF
  )

  TOKEN_RESULT=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SPECKLE_SERVER_TOKEN" \
    -d "$CREATE_TOKEN_MUTATION")

  # Check if token creation succeeded
  if echo "$TOKEN_RESULT" | jq -e '.errors' > /dev/null 2>&1; then
    echo "❌ ERROR: Token creation failed"
    echo "$TOKEN_RESULT" | jq .
    return 1
  fi

  NEW_TOKEN=$(echo "$TOKEN_RESULT" | jq -r '.data.apiTokenCreate // empty')

  if [ -z "$NEW_TOKEN" ]; then
    echo "❌ ERROR: No token returned"
    echo "$TOKEN_RESULT" | jq .
    return 1
  fi

  print_header "✅ SUCCESS: API Token Created"

  echo "Token Name:   $TOKEN_NAME"
  echo "Token Value:  $NEW_TOKEN"
  echo "Scopes:       streams:read, streams:write, profile:read"
  echo "Created By:   $USER_EMAIL"
  echo ""
  echo "⚠️  IMPORTANT: Save this token immediately - it won't be shown again!"
  echo ""
  echo "📝 To use this token:"
  echo "   export SPECKLE_SERVER_TOKEN=\"$NEW_TOKEN\""
  echo ""
  echo "   Or add to .env file:"
  echo "   SPECKLE_SERVER_TOKEN=$NEW_TOKEN"
  echo ""
}

# =============================================================================
# Method 2: Check if initial token needed (Bootstrap Detection)
# =============================================================================
check_bootstrap_status() {
  print_header "Method 2: Bootstrap Status Check"

  echo "🔍 Checking if Speckle Server needs initial token setup..."
  echo ""

  # Try to query server info (public endpoint, no auth required)
  SERVER_QUERY='{"query":"query { serverInfo { name version } }"}'

  SERVER_RESULT=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "$SERVER_QUERY" 2>/dev/null || echo '{"errors":[{"message":"connection failed"}]}')

  # Check if server is accessible
  if echo "$SERVER_RESULT" | jq -e '.data.serverInfo' > /dev/null 2>&1; then
    SERVER_NAME=$(echo "$SERVER_RESULT" | jq -r '.data.serverInfo.name // "Unknown"')
    SERVER_VERSION=$(echo "$SERVER_RESULT" | jq -r '.data.serverInfo.version // "Unknown"')

    echo "✅ Speckle Server is accessible"
    echo "   Name:    $SERVER_NAME"
    echo "   Version: $SERVER_VERSION"
    echo ""

    # Check if we have a token
    if [ -z "$SPECKLE_SERVER_TOKEN" ]; then
      echo "⚠️  No SPECKLE_SERVER_TOKEN found in environment"
      echo ""
      echo "🎯 BOOTSTRAP REQUIRED: Initial token setup needed"
      echo ""
      return 1
    else
      echo "✅ SPECKLE_SERVER_TOKEN found: ${SPECKLE_SERVER_TOKEN:0:20}..."
      echo ""
      return 0
    fi
  else
    echo "❌ ERROR: Speckle Server not accessible"
    echo "   Endpoint: $GRAPHQL_ENDPOINT"
    echo ""
    echo "Please verify:"
    echo "  1. Speckle containers are running"
    echo "  2. Nginx routing is configured"
    echo "  3. DNS/network connectivity"
    echo ""
    return 1
  fi
}

# =============================================================================
# Method 3: Web UI Bootstrap Instructions
# =============================================================================
print_web_ui_bootstrap() {
  print_header "Method 3: Bootstrap via Speckle Web UI (REQUIRED FOR INITIAL SETUP)"

  cat <<EOF
╔═══════════════════════════════════════════════════════════════════════════╗
║                    SPECKLE SERVER v2 BOOTSTRAP PROCESS                    ║
╚═══════════════════════════════════════════════════════════════════════════╝

⚠️  IMPORTANT: Speckle Server v2 does NOT have REST API for initial token creation
The /authn/register endpoint is a FRONTEND PAGE, not an API endpoint.

INDUSTRY STANDARD PATTERN:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Initial Setup:  Create first token via Web UI (manual, one-time)
2. Programmatic:   Use GraphQL apiTokenCreate with existing token
3. No REST API:    Token creation only via Web UI or GraphQL

STEP-BY-STEP BOOTSTRAP PROCESS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣  Open Speckle Web UI:
   🌐 $SPECKLE_WEB_UI

2️⃣  Register/Login as Admin:
EOF

  if [ -n "$SPECKLE_ADMIN_EMAIL" ]; then
    echo "   📧 Email: $SPECKLE_ADMIN_EMAIL"
    if [ -n "$SPECKLE_ADMIN_PASSWORD" ]; then
      echo "   🔑 Password: [from SPECKLE_ADMIN_PASSWORD env var]"
    fi
  else
    echo "   📧 Email: [your admin email]"
    echo "   🔑 Password: [your admin password]"
  fi

  cat <<EOF

3️⃣  Navigate to Personal Access Tokens:
   👤 Click your avatar (top right)
   ⚙️  Settings
   🔧 Developer Settings
   🎫 Personal Access Tokens

4️⃣  Create New Token:
   ➕ Click "New Token" or "Create Token"

   Configure:
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Name:     $TOKEN_NAME
   Scopes:   ☑ streams:read
             ☑ streams:write
             ☑ profile:read
   Expires:  Never (recommended for service tokens)

5️⃣  Save Token Immediately:
   ⚠️  This is the ONLY time you'll see the full token!

   📋 Copy the token and run:

   # For temporary use:
   export SPECKLE_SERVER_TOKEN="<paste-token-here>"

   # For persistent use, add to .env file:
   echo 'SPECKLE_SERVER_TOKEN=<paste-token-here>' >> .env

6️⃣  Verify Token Works:
   ./scripts/speckle/create-api-token.sh $ENVIRONMENT

ALTERNATIVE: Direct Profile Access
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You can also access tokens directly via:
🌐 $SPECKLE_WEB_UI/profile

TROUBLESHOOTING:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Can't access web UI?
   → Check: docker ps | grep speckle-frontend
   → Check: curl -I $SPECKLE_WEB_UI

❌ Can't see Developer Settings?
   → Ensure you're logged in as admin
   → Check user role in profile

❌ Token not working after creation?
   → Verify: echo \$SPECKLE_SERVER_TOKEN
   → Test with: curl -H "Authorization: Bearer \$SPECKLE_SERVER_TOKEN" \\
                     $GRAPHQL_ENDPOINT

REFERENCES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 Speckle Tokens:    https://speckle.guide/dev/tokens.html
📖 Apps & Auth:       https://speckle.guide/dev/apps-auth.html
📄 Local Guide:       evidence/speckle-token-deployment-2025-12-21.md

═══════════════════════════════════════════════════════════════════════════════

EOF
}

# =============================================================================
# Main Execution
# =============================================================================

print_header "Speckle Server v2 - API Token Manager"

echo "🎯 Target: $ENVIRONMENT environment"
echo "📍 GraphQL: $GRAPHQL_ENDPOINT"
echo "🌐 Web UI:  $SPECKLE_WEB_UI"
echo ""

# Step 1: Check bootstrap status
if ! check_bootstrap_status; then
  # No token exists - show bootstrap instructions
  print_web_ui_bootstrap
  exit 1
fi

echo ""

# Step 2: Token exists - can create additional tokens programmatically
if [ -n "$SPECKLE_SERVER_TOKEN" ]; then
  # Method 1: Use existing service token to create new token
  if create_token_with_service_account; then
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "✅ SUCCESS: Additional token created programmatically"
    echo ""
    echo "💡 You can now use this script anytime to create more tokens!"
    echo ""
    exit 0
  fi
  echo ""
fi

# Fallback: Show web UI instructions
echo "⚠️  Could not create token programmatically"
echo ""
print_web_ui_bootstrap

echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "For more information, see:"
echo "  - evidence/speckle-token-deployment-2025-12-21.md"
echo "  - https://speckle.guide/dev/tokens.html"
echo ""
