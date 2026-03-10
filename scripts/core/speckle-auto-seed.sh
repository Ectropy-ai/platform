#!/bin/bash
# PHASE 3 AUTO-SEED SCRIPT (2025-12-18)
# Automatically configure Speckle with demo IFC model
# Part of ROOT CAUSE #58 - BIM Viewer Complete Enablement
#
# Usage: bash scripts/speckle-auto-seed.sh [staging|production]
# Requirements:
#   - Speckle services running (speckle-server, speckle-frontend, etc.)
#   - Demo IFC file available (test-data/Ifc4_SampleHouse.ifc)
#   - jq installed for JSON parsing

set -euo pipefail

# Configuration
ENVIRONMENT="${1:-staging}"
SPECKLE_URL="https://${ENVIRONMENT}.ectropy.ai/speckle"
GRAPHQL_ENDPOINT="${SPECKLE_URL}/graphql"
IFC_FILE="test-data/Ifc4_SampleHouse.ifc"
ADMIN_EMAIL="speckle-admin@ectropy.ai"
ADMIN_PASSWORD="EctropySpeckleAdmin2025!"

echo "=== PHASE 3: Speckle Auto-Seed Script ==="
echo "Environment: ${ENVIRONMENT}"
echo "Speckle URL: ${SPECKLE_URL}"
echo ""

# Step 1: Verify Speckle services are running
echo "[1/5] Verifying Speckle infrastructure..."
# GraphQL endpoints require POST requests with a query, not GET
# Test with a minimal serverInfo query
HEALTH_CHECK=$(curl -sSf -X POST "${GRAPHQL_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ serverInfo { version } }"}' 2>/dev/null || echo 'FAILED')

if echo "$HEALTH_CHECK" | grep -q '"serverInfo"'; then
  SERVER_VERSION=$(echo "$HEALTH_CHECK" | jq -r '.data.serverInfo.version' 2>/dev/null || echo 'unknown')
  echo "✅ Speckle GraphQL endpoint accessible (v${SERVER_VERSION})"
else
  echo "❌ ERROR: Speckle GraphQL endpoint not accessible at ${GRAPHQL_ENDPOINT}"
  echo "   Response: ${HEALTH_CHECK}"
  echo "   Ensure Speckle services are running: docker ps | grep speckle"
  exit 1
fi

# Step 2: Check if admin account exists via database query
echo ""
echo "[2/5] Checking for existing Speckle accounts..."
EXISTING_USERS=$(ssh root@${ENVIRONMENT}.ectropy.ai "docker exec postgres psql -U postgres speckle -t -c \"SELECT email FROM users WHERE email='${ADMIN_EMAIL}' LIMIT 1;\" 2>/dev/null || echo 'no_db'")

if echo "$EXISTING_USERS" | grep -q "${ADMIN_EMAIL}"; then
  echo "✅ Admin account already exists: ${ADMIN_EMAIL}"
  echo "   Skipping account creation, will attempt login with existing credentials"
  SKIP_ACCOUNT_CREATION=true
else
  echo "⚠️  No admin account found, will create: ${ADMIN_EMAIL}"
  SKIP_ACCOUNT_CREATION=false
fi

# Step 3: Create admin account if needed (via GraphQL mutation)
if [ "$SKIP_ACCOUNT_CREATION" = false ]; then
  echo ""
  echo "[3/5] Creating Speckle admin account..."

  CREATE_USER_MUTATION=$(cat <<'EOF'
mutation {
  userCreate(user: {
    email: "speckle-admin@ectropy.ai",
    name: "Ectropy BIM Admin",
    password: "EctropySpeckleAdmin2025!"
  }) {
    id
    email
  }
}
EOF
)

  CREATE_RESULT=$(curl -sSf -X POST "${GRAPHQL_ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$(echo "$CREATE_USER_MUTATION" | tr '\n' ' ' | sed 's/"/\\"/g')\"}" 2>/dev/null || echo '{"errors":[{"message":"creation failed"}]}')

  if echo "$CREATE_RESULT" | grep -q '"userCreate"'; then
    USER_ID=$(echo "$CREATE_RESULT" | jq -r '.data.userCreate.id')
    echo "✅ Admin account created successfully"
    echo "   User ID: ${USER_ID}"
    echo "   Email: ${ADMIN_EMAIL}"
  else
    echo "⚠️  Account creation failed, may already exist. Continuing..."
  fi
else
  echo ""
  echo "[3/5] Skipping account creation (already exists)"
fi

# Step 4: Authenticate and get API token
echo ""
echo "[4/5] Authenticating and generating API token..."

# Note: Speckle v2 uses email/password login, then token generation
# This is a simplified approach - in production you'd use proper OAuth flow
LOGIN_MUTATION=$(cat <<EOF
mutation {
  login(email: "${ADMIN_EMAIL}", password: "${ADMIN_PASSWORD}") {
    token
    user {
      id
      email
    }
  }
}
EOF
)

AUTH_RESULT=$(curl -sSf -X POST "${GRAPHQL_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$(echo "$LOGIN_MUTATION" | tr '\n' ' ' | sed 's/"/\\"/g')\"}" 2>/dev/null || echo '{"errors":[{"message":"auth failed"}]}')

if echo "$AUTH_RESULT" | grep -q '"token"'; then
  AUTH_TOKEN=$(echo "$AUTH_RESULT" | jq -r '.data.login.token')
  USER_ID=$(echo "$AUTH_RESULT" | jq -r '.data.login.user.id')
  echo "✅ Authentication successful"
  echo "   Token: ${AUTH_TOKEN:0:20}..."
  echo "   User ID: ${USER_ID}"
else
  echo "❌ ERROR: Authentication failed"
  echo "   Response: ${AUTH_RESULT}"
  echo ""
  echo "MANUAL STEPS REQUIRED:"
  echo "1. Navigate to ${SPECKLE_URL}"
  echo "2. Create account manually: ${ADMIN_EMAIL}"
  echo "3. Generate API token in user settings"
  echo "4. Store token in GitHub Secrets: SPECKLE_API_TOKEN"
  exit 1
fi

# Step 5: Upload demo IFC file
echo ""
echo "[5/5] Uploading demo IFC model..."

# Verify IFC file exists locally
if [ ! -f "${IFC_FILE}" ]; then
  echo "❌ ERROR: Demo IFC file not found: ${IFC_FILE}"
  echo "   Available IFC files in repo:"
  find . -name "*.ifc" -type f 2>/dev/null || echo "   (none found)"
  exit 1
fi

IFC_SIZE=$(stat -f%z "${IFC_FILE}" 2>/dev/null || stat -c%s "${IFC_FILE}" 2>/dev/null)
echo "📁 Demo IFC file: ${IFC_FILE} (${IFC_SIZE} bytes)"

# Create stream (project) for demo model
CREATE_STREAM_MUTATION=$(cat <<'EOF'
mutation {
  streamCreate(stream: {
    name: "Ectropy Demo Building",
    description: "Sample IFC4 building model for BIM viewer demonstration",
    isPublic: true
  }) {
    id
    name
  }
}
EOF
)

STREAM_RESULT=$(curl -sSf -X POST "${GRAPHQL_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -d "{\"query\":\"$(echo "$CREATE_STREAM_MUTATION" | tr '\n' ' ' | sed 's/"/\\"/g')\"}" 2>/dev/null || echo '{"errors":[{"message":"stream creation failed"}]}')

if echo "$STREAM_RESULT" | grep -q '"streamCreate"'; then
  STREAM_ID=$(echo "$STREAM_RESULT" | jq -r '.data.streamCreate.id')
  echo "✅ Speckle stream created"
  echo "   Stream ID: ${STREAM_ID}"
  echo "   Name: Ectropy Demo Building"
else
  echo "❌ ERROR: Stream creation failed"
  echo "   Response: ${STREAM_RESULT}"
  exit 1
fi

# Upload IFC file via Speckle file upload API
# Note: Speckle v2 uses multipart form upload to /api/file endpoint
UPLOAD_URL="${SPECKLE_URL}/api/file/${STREAM_ID}"
echo "📤 Uploading IFC file to ${UPLOAD_URL}..."

UPLOAD_RESULT=$(curl -sSf -X POST "${UPLOAD_URL}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -F "file=@${IFC_FILE}" \
  2>/dev/null || echo '{"error":"upload failed"}')

if echo "$UPLOAD_RESULT" | grep -q '"fileId"'; then
  FILE_ID=$(echo "$UPLOAD_RESULT" | jq -r '.fileId')
  OBJECT_ID=$(echo "$UPLOAD_RESULT" | jq -r '.objectId // .commitId // .versionId')
  echo "✅ IFC file uploaded successfully"
  echo "   File ID: ${FILE_ID}"
  echo "   Object ID: ${OBJECT_ID}"
else
  echo "⚠️  Standard upload failed, trying alternative endpoint..."
  # Alternative: Use fileimport service directly
  FILEIMPORT_URL="${SPECKLE_URL}:3103/import"
  UPLOAD_RESULT=$(curl -sSf -X POST "${FILEIMPORT_URL}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -F "streamId=${STREAM_ID}" \
    -F "file=@${IFC_FILE}" \
    2>/dev/null || echo '{"error":"import failed"}')

  if echo "$UPLOAD_RESULT" | grep -q '"success"'; then
    OBJECT_ID=$(echo "$UPLOAD_RESULT" | jq -r '.objectId // .commitId')
    echo "✅ IFC file imported successfully"
    echo "   Object ID: ${OBJECT_ID}"
  else
    echo "❌ ERROR: IFC upload failed on both endpoints"
    echo "   Response: ${UPLOAD_RESULT}"
    echo ""
    echo "MANUAL UPLOAD REQUIRED:"
    echo "1. Navigate to ${SPECKLE_URL}"
    echo "2. Login as ${ADMIN_EMAIL}"
    echo "3. Create new stream: 'Ectropy Demo Building'"
    echo "4. Upload ${IFC_FILE} via Web UI"
    echo "5. Copy Stream ID and Object ID from URL"
    exit 1
  fi
fi

# Step 6: Output configuration for Phase 4
echo ""
echo "=== ✅ PHASE 3 COMPLETE ==="
echo ""
echo "SPECKLE CONFIGURATION:"
echo "  Stream ID:  ${STREAM_ID}"
echo "  Object ID:  ${OBJECT_ID}"
echo "  Auth Token: ${AUTH_TOKEN:0:20}..."
echo "  Admin Email: ${ADMIN_EMAIL}"
echo ""
echo "NEXT STEPS (PHASE 4):"
echo "1. Add these values to webpack.config.cjs:"
echo "   REACT_APP_DEMO_STREAM_ID: '${STREAM_ID}'"
echo "   REACT_APP_DEMO_OBJECT_ID: '${OBJECT_ID}'"
echo ""
echo "2. Add same values to docker-compose.staging.yml (line ~120):"
echo "   REACT_APP_DEMO_STREAM_ID: '${STREAM_ID}'"
echo "   REACT_APP_DEMO_OBJECT_ID: '${OBJECT_ID}'"
echo ""
echo "3. Commit and push to trigger rebuild:"
echo "   git add webpack.config.cjs docker-compose.staging.yml"
echo "   git commit -m 'feat(bim-viewer): P0 ROOT CAUSE #58 PHASE 4 - Configure Demo Model'"
echo "   git push origin main"
echo ""
echo "4. After deployment, verify BIM viewer loads 3D model:"
echo "   https://${ENVIRONMENT}.ectropy.ai/ → Navigate to dashboards"
echo "   Expected: Rotatable 3D building model visible"
echo ""
echo "Enterprise excellence: Fully automated Speckle configuration complete."
