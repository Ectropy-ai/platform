#!/bin/bash
# =============================================================================
# Speckle Server Programmatic Bootstrap (apiTokenCreate — credential-based)
# =============================================================================
# Purpose: Register admin user and create a Speckle-managed service PAT.
#          Writes the PAT to a shared volume for api-gateway to consume.
# Usage:   ./bootstrap-admin.sh
# Date:    2026-02-23
#
# Five Why Root Cause (2026-02-23):
#   Using a static pre-shared SPECKLE_SERVER_TOKEN required synchronized
#   registration between Speckle's internal DB and GitHub Actions CI/CD.
#   This split-path synchronization is the source of all 403 failures.
#
# Industry-pattern fix (apiTokenCreate):
#   1. Register/login admin user → access_code from redirect
#   2. Exchange access_code → JWT (ephemeral session token)
#   3. Check shared volume for existing valid service PAT
#   4. If no valid PAT: call apiTokenCreate mutation → Speckle-managed token
#   5. Write new PAT to shared volume for api-gateway
#   6. Validate PAT via activeUser query (HARD FAIL if invalid)
#
# This eliminates the split-secret-path problem entirely:
#   - No static token needs to be pre-registered in the DB
#   - Speckle manages bcrypt internally (no manual hash replication)
#   - apiTokenCreate is the documented API for creating persistent PATs
#
# Prerequisites:
#   - curl (for HTTP requests)
#   - sed (for JSON parsing — no jq or python3 required)
#   - Environment variables: SPECKLE_ADMIN_EMAIL, SPECKLE_ADMIN_PASSWORD
#   - Shared volume mounted at /shared-tokens (optional — writes token there)
# =============================================================================

set -e

ADMIN_EMAIL="${SPECKLE_ADMIN_EMAIL:-speckle-admin@ectropy.ai}"
ADMIN_PASSWORD="${SPECKLE_ADMIN_PASSWORD}"
SPECKLE_URL="${SPECKLE_SERVER_URL:-http://localhost:3000}"
TOKEN_FILE="${TOKEN_FILE:-/shared-tokens/speckle-service-token}"

echo "═══════════════════════════════════════════════════════════════"
echo "Speckle Server Bootstrap — apiTokenCreate (Five Why 2026-02-23)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Server:      $SPECKLE_URL"
echo "Admin Email: $ADMIN_EMAIL"
echo "Token file:  $TOKEN_FILE"
echo ""

# Validate prerequisites
if ! command -v curl &>/dev/null; then
  echo "ERROR: curl is required but not found"
  exit 1
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  echo "ERROR: SPECKLE_ADMIN_PASSWORD is not set"
  exit 1
fi

# Step 1: Wait for Speckle Server to be ready
echo "Step 1: Waiting for Speckle Server..."
for i in $(seq 1 30); do
  HEALTH=$(curl -sf "$SPECKLE_URL/graphql" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ serverInfo { version } }"}' 2>/dev/null || true)
  if echo "$HEALTH" | grep -q '"serverInfo"'; then
    VERSION=$(echo "$HEALTH" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
    echo "  Speckle Server ready (version: $VERSION)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  FATAL: Speckle Server not ready after 30 attempts"
    exit 1
  fi
  echo "  Attempt $i/30 - waiting 5s..."
  sleep 5
done
echo ""

# Step 2: Register admin user (or login if exists)
# Speckle v2 requires a challenge parameter in the query string (middleware.ts)
# Generate a random challenge for this session
CHALLENGE=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
echo "Step 2: Registering admin user ($ADMIN_EMAIL)..."
echo "  Generated challenge: ${CHALLENGE:0:8}..."

REGISTER_RESP=$(curl -s -o /dev/null -w "%{redirect_url}" \
  -X POST "$SPECKLE_URL/auth/local/register?challenge=$CHALLENGE" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"name\":\"Ectropy Admin\",\"company\":\"Ectropy\"}")

ACCESS_CODE=$(echo "$REGISTER_RESP" | grep -oE 'access_code=[^&]+' | cut -d= -f2)

if [ -z "$ACCESS_CODE" ]; then
  echo "  Registration returned no access_code (user may exist), trying login..."
  LOGIN_RESP=$(curl -s -o /dev/null -w "%{redirect_url}" \
    -X POST "$SPECKLE_URL/auth/local/login?challenge=$CHALLENGE" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
  ACCESS_CODE=$(echo "$LOGIN_RESP" | grep -oE 'access_code=[^&]+' | cut -d= -f2)
fi

if [ -z "$ACCESS_CODE" ]; then
  echo "  FATAL: Could not obtain access_code from register or login"
  echo "  Hint: Ensure Speckle local auth is enabled and credentials are correct"
  exit 1
fi
echo "  Got access_code: ${ACCESS_CODE:0:8}..."
echo ""

# Step 3: Exchange access_code for JWT (using the same challenge from Step 2)
echo "Step 3: Exchanging access_code for JWT..."
TOKEN_RESP=$(curl -sf "$SPECKLE_URL/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"appId\":\"spklwebapp\",\"appSecret\":\"spklwebapp\",\"accessCode\":\"$ACCESS_CODE\",\"challenge\":\"$CHALLENGE\"}")

JWT=$(echo "$TOKEN_RESP" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "$JWT" ]; then
  echo "  FATAL: Could not obtain JWT"
  echo "  Response: $TOKEN_RESP"
  exit 1
fi
echo "  Got JWT: ${JWT:0:20}..."
echo ""

# Step 4: Check shared volume for existing valid service PAT
echo "Step 4: Checking shared volume for existing valid token..."
if [ -f "$TOKEN_FILE" ]; then
  EXISTING=$(cat "$TOKEN_FILE" | tr -d '[:space:]')
  if [ -n "$EXISTING" ]; then
    CHECK=$(curl -s "$SPECKLE_URL/graphql" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $EXISTING" \
      -d '{"query":"{ activeUser { id } }"}' 2>/dev/null || true)
    if echo "$CHECK" | grep -q '"activeUser"'; then
      echo "  Existing token is valid — skipping PAT creation"
      echo ""
      echo "═══════════════════════════════════════════════════════════════"
      echo "BOOTSTRAP COMPLETE (existing token reused)"
      echo "═══════════════════════════════════════════════════════════════"
      exit 0
    fi
    echo "  Existing token is no longer valid — creating new PAT"
  fi
else
  echo "  No token file found — creating new PAT"
fi
echo ""

# Step 5: Create service PAT via apiTokenCreate mutation
# Speckle generates its own bcrypt token internally — no manual hash replication.
echo "Step 5: Creating service PAT via apiTokenCreate..."
CREATE_RESP=$(curl -sf "$SPECKLE_URL/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"query":"mutation{apiTokenCreate(token:{name:\"Ectropy Service Token\",scopes:[\"streams:read\",\"streams:write\",\"profile:read\",\"users:read\"],lifespan:3154000000000})}"}')

SERVICE_TOKEN=$(echo "$CREATE_RESP" | sed -n 's/.*"apiTokenCreate"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "$SERVICE_TOKEN" ]; then
  echo "  FATAL: apiTokenCreate returned no token"
  echo "  Response: $CREATE_RESP"
  exit 1
fi
echo "  PAT created: ${SERVICE_TOKEN:0:10}..."
echo ""

# Step 6: Write service token to shared volume
echo "Step 6: Writing service token to shared volume..."
TOKEN_DIR=$(dirname "$TOKEN_FILE")
if [ ! -d "$TOKEN_DIR" ]; then
  echo "  Warning: $TOKEN_DIR does not exist — creating it"
  mkdir -p "$TOKEN_DIR"
fi
echo -n "$SERVICE_TOKEN" > "$TOKEN_FILE"
chmod 644 "$TOKEN_FILE"
echo "  Written to $TOKEN_FILE"
echo ""

# Step 7: Validate service token via GraphQL — HARD FAIL if invalid
echo "Step 7: Validating service token via GraphQL (HARD FAIL if invalid)..."
VERIFY=$(curl -s "$SPECKLE_URL/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -d '{"query":"{ activeUser { id email name role } }"}')

if echo "$VERIFY" | grep -q '"activeUser"'; then
  VERIFIED_EMAIL=$(echo "$VERIFY" | sed -n 's/.*"email"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  VERIFIED_ROLE=$(echo "$VERIFY" | sed -n 's/.*"role"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  echo "  Token validation PASSED"
  echo "  Authenticated as: $VERIFIED_EMAIL (role: $VERIFIED_ROLE)"
else
  echo "  FATAL: Service token validation FAILED after creation"
  echo "  Response: $VERIFY"
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "BOOTSTRAP COMPLETE"
echo "  Admin:  $ADMIN_EMAIL"
echo "  Token:  ${SERVICE_TOKEN:0:10}... (Speckle-generated, bcrypt in DB)"
echo "  Scopes: streams:read, streams:write, profile:read, users:read"
echo "  File:   $TOKEN_FILE"
echo "  Pattern: apiTokenCreate (Speckle manages bcrypt internally)"
echo "═══════════════════════════════════════════════════════════════"
