#!/bin/bash
# ENTERPRISE SCALABLE DEMO SETUP (2025-12-18)
# Purpose: Create Speckle demo content that mirrors real user workflow
# Supports: Multiple building types, staging/production environments
# Pattern: User creates project → uploads model → views in BIM viewer
#
# Usage: bash scripts/core/speckle-demo-setup.sh [staging|production] [building-type]
# Example: bash scripts/core/speckle-demo-setup.sh staging residential-single-family
#
# Architecture: Scalable for multiple demo scenarios
# - residential-single-family (Ifc4_SampleHouse.ifc)
# - residential-multi-family (Ifc2x3_Duplex_Architecture.ifc)
# - commercial-office (demo-office-building.ifc)
# - commercial-large (Ifc4_Revit_ARC.ifc - 14MB)
#
# Requirements:
# - SPECKLE_SERVER_TOKEN in GitHub secrets (or local env)
# - IFC file in test-data/ directory
# - Speckle services running and accessible

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

ENVIRONMENT="${1:-staging}"
BUILDING_TYPE="${2:-residential-single-family}"

# Environment URLs
if [ "$ENVIRONMENT" = "production" ]; then
  SPECKLE_URL="https://ectropy.ai/speckle"
else
  SPECKLE_URL="https://staging.ectropy.ai/speckle"
fi

GRAPHQL_ENDPOINT="${SPECKLE_URL}/graphql"

# Building type to IFC file mapping (scalable for multiple types)
declare -A BUILDING_FILES=(
  ["residential-single-family"]="test-data/Ifc4_SampleHouse.ifc"
  ["residential-multi-family"]="test-data/Ifc2x3_Duplex_Architecture.ifc"
  ["commercial-office"]="test-data/demo-office-building.ifc"
  ["commercial-large"]="test-data/Ifc4_Revit_ARC.ifc"
)

declare -A BUILDING_NAMES=(
  ["residential-single-family"]="Ectropy Demo - Single Family Residence"
  ["residential-multi-family"]="Ectropy Demo - Duplex Building"
  ["commercial-office"]="Ectropy Demo - Office Building"
  ["commercial-large"]="Ectropy Demo - Large Commercial Project"
)

# Get IFC file for selected building type
IFC_FILE="${BUILDING_FILES[$BUILDING_TYPE]}"
PROJECT_NAME="${BUILDING_NAMES[$BUILDING_TYPE]}"

# Credential-based ephemeral token (Five Why 2026-02-23).
# Obtain a fresh token at runtime from admin credentials rather than
# requiring a static pre-shared SPECKLE_SERVER_TOKEN.
SPECKLE_ADMIN_EMAIL="${SPECKLE_ADMIN_EMAIL:-speckle-admin@ectropy.ai}"
if [ -z "${SPECKLE_ADMIN_PASSWORD:-}" ]; then
  echo "⚠️  SPECKLE_ADMIN_PASSWORD not set in environment"
  echo "   For automation, set SPECKLE_ADMIN_PASSWORD in GitHub Secrets"
  read -sp "Enter Speckle admin password: " SPECKLE_ADMIN_PASSWORD
  echo ""
fi

# =============================================================================
# BANNER
# =============================================================================

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║         ECTROPY ENTERPRISE DEMO SETUP - SPECKLE BIM WORKFLOW        ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Environment:     $ENVIRONMENT"
echo "Building Type:   $BUILDING_TYPE"
echo "Project Name:    $PROJECT_NAME"
echo "IFC File:        $IFC_FILE"
echo "Speckle URL:     $SPECKLE_URL"
echo ""

# =============================================================================
# STEP 1: Validate Prerequisites
# =============================================================================

echo "[1/5] Validating prerequisites..."

# Check IFC file exists
if [ ! -f "$IFC_FILE" ]; then
  echo "❌ ERROR: IFC file not found: $IFC_FILE"
  echo ""
  echo "Available building types:"
  for type in "${!BUILDING_FILES[@]}"; do
    file="${BUILDING_FILES[$type]}"
    if [ -f "$file" ]; then
      size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
      size_mb=$((size / 1024 / 1024))
      echo "  ✅ $type ($size_mb MB)"
    else
      echo "  ❌ $type (file missing: $file)"
    fi
  done
  exit 1
fi

FILE_SIZE=$(stat -c%s "$IFC_FILE" 2>/dev/null || stat -f%z "$IFC_FILE" 2>/dev/null)
FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))
echo "✅ IFC file found: $FILE_SIZE_MB MB"

# Check Speckle GraphQL endpoint
HEALTH_CHECK=$(curl -sSf -X POST "$GRAPHQL_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ serverInfo { version } }"}' 2>/dev/null || echo 'FAILED')

if echo "$HEALTH_CHECK" | grep -q '"serverInfo"'; then
  SERVER_VERSION=$(echo "$HEALTH_CHECK" | jq -r '.data.serverInfo.version' 2>/dev/null || echo 'unknown')
  echo "✅ Speckle GraphQL endpoint accessible (v$SERVER_VERSION)"
else
  echo "❌ ERROR: Speckle GraphQL endpoint not accessible at $GRAPHQL_ENDPOINT"
  echo "   Response: $HEALTH_CHECK"
  echo ""
  echo "Troubleshooting:"
  echo "  - Verify Speckle services are running: docker ps | grep speckle"
  echo "  - Check nginx routing: curl -I $SPECKLE_URL/graphql"
  echo "  - Review deployment logs: gh run list --workflow='Deploy Staging'"
  exit 1
fi

# Obtain ephemeral token via admin credentials (Five Why 2026-02-23 pattern)
echo "Authenticating with Speckle as $SPECKLE_ADMIN_EMAIL..."
LOGIN_REDIRECT=$(curl -s -o /dev/null -w "%{redirect_url}" \
  -X POST "$SPECKLE_URL/auth/local/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${SPECKLE_ADMIN_EMAIL}\",\"password\":\"${SPECKLE_ADMIN_PASSWORD}\"}")
ACCESS_CODE=$(echo "${LOGIN_REDIRECT}" | grep -oE "access_code=[^&]+" | cut -d= -f2)

if [ -z "$ACCESS_CODE" ]; then
  echo "❌ ERROR: Login failed — no access_code returned"
  echo "   Check SPECKLE_ADMIN_EMAIL and SPECKLE_ADMIN_PASSWORD"
  exit 1
fi

TOKEN_RESP=$(curl -sf "$SPECKLE_URL/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"appId\":\"spklwebapp\",\"appSecret\":\"spklwebapp\",\"accessCode\":\"${ACCESS_CODE}\",\"challenge\":\"${ACCESS_CODE}\"}")
SPECKLE_SERVER_TOKEN=$(echo "${TOKEN_RESP}" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "$SPECKLE_SERVER_TOKEN" ]; then
  echo "❌ ERROR: Token exchange failed — no token in response"
  echo "   Response: $TOKEN_RESP"
  exit 1
fi
echo "✅ Obtained ephemeral token: ${SPECKLE_SERVER_TOKEN:0:10}..."

# =============================================================================
# STEP 2: Create Speckle Project (Stream)
# =============================================================================

echo ""
echo "[2/5] Creating Speckle project..."

CREATE_STREAM_MUTATION=$(cat <<EOF
mutation {
  streamCreate(stream: {
    name: "$PROJECT_NAME",
    description: "Enterprise demo project for BIM viewer - $BUILDING_TYPE",
    isPublic: true
  }) {
    id
    name
  }
}
EOF
)

CREATE_STREAM_RESULT=$(curl -sSf -X POST "$GRAPHQL_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SPECKLE_SERVER_TOKEN" \
  -d "{\"query\":\"$(echo "$CREATE_STREAM_MUTATION" | tr '\n' ' ' | sed 's/"/\\"/g')\"}" 2>/dev/null || echo '{\"errors\":[{\"message\":\"create failed\"}]}')

if echo "$CREATE_STREAM_RESULT" | grep -q '"streamCreate"'; then
  STREAM_ID=$(echo "$CREATE_STREAM_RESULT" | jq -r '.data.streamCreate.id')
  echo "✅ Project created successfully"
  echo "   Stream ID: $STREAM_ID"
  echo "   Name: $PROJECT_NAME"
elif echo "$CREATE_STREAM_RESULT" | grep -q 'not valid'; then
  echo "❌ ERROR: API token invalid or expired"
  echo ""
  echo "The ephemeral token obtained from credentials was rejected."
  echo "  Check SPECKLE_ADMIN_EMAIL and SPECKLE_ADMIN_PASSWORD are correct."
  echo "  Ensure the admin user exists (bootstrap must have run successfully)."
  exit 1
else
  echo "❌ ERROR: Failed to create Speckle project"
  echo "   Response: $CREATE_STREAM_RESULT"
  exit 1
fi

# =============================================================================
# STEP 3: Upload IFC Model
# =============================================================================

echo ""
echo "[3/5] Uploading IFC model to project..."

UPLOAD_URL="$SPECKLE_URL/api/file/$STREAM_ID"
echo "📤 Upload endpoint: $UPLOAD_URL"

UPLOAD_RESULT=$(curl -sSf -X POST "$UPLOAD_URL" \
  -H "Authorization: Bearer $SPECKLE_SERVER_TOKEN" \
  -F "file=@$IFC_FILE" 2>/dev/null || echo '{\"error\":\"upload failed\"}')

# Try to extract object ID (Speckle API returns different field names)
OBJECT_ID=$(echo "$UPLOAD_RESULT" | jq -r '.objectId // .commitId // .versionId // .uploadId // empty' 2>/dev/null)

if [ -n "$OBJECT_ID" ]; then
  echo "✅ IFC model uploaded successfully"
  echo "   Object ID: $OBJECT_ID"
  echo "   File: $IFC_FILE ($FILE_SIZE_MB MB)"
else
  echo "⚠️  Upload response unclear, checking project status..."
  # Query stream to check if upload succeeded
  STREAM_CHECK=$(curl -sSf -X POST "$GRAPHQL_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SPECKLE_SERVER_TOKEN" \
    -d "{\"query\":\"{ stream(id: \\\"$STREAM_ID\\\") { commits { totalCount items { id referencedObject createdAt } } } }\"}" 2>/dev/null)

  COMMIT_COUNT=$(echo "$STREAM_CHECK" | jq -r '.data.stream.commits.totalCount // 0')
  if [ "$COMMIT_COUNT" -gt 0 ]; then
    OBJECT_ID=$(echo "$STREAM_CHECK" | jq -r '.data.stream.commits.items[0].referencedObject')
    echo "✅ Upload verified via stream query"
    echo "   Object ID: $OBJECT_ID (from latest commit)"
  else
    echo "❌ ERROR: Upload failed and no commits found"
    echo "   Upload response: $UPLOAD_RESULT"
    echo ""
    echo "Manual upload fallback:"
    echo "  1. Navigate to $SPECKLE_URL/streams/$STREAM_ID"
    echo "  2. Upload $IFC_FILE via Web UI"
    echo "  3. Copy Object/Commit ID from uploaded model"
    exit 1
  fi
fi

# =============================================================================
# STEP 4: Verify Model Processing
# =============================================================================

echo ""
echo "[4/5] Verifying model processing..."

# Query stream details to confirm model is ready
STREAM_DETAILS=$(curl -sSf -X POST "$GRAPHQL_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SPECKLE_SERVER_TOKEN" \
  -d "{\"query\":\"{ stream(id: \\\"$STREAM_ID\\\") { id name size commits { totalCount } } }\"}" 2>/dev/null)

COMMIT_COUNT=$(echo "$STREAM_DETAILS" | jq -r '.data.stream.commits.totalCount // 0')
STREAM_SIZE=$(echo "$STREAM_DETAILS" | jq -r '.data.stream.size // 0')

if [ "$COMMIT_COUNT" -gt 0 ]; then
  echo "✅ Model processing verified"
  echo "   Commits: $COMMIT_COUNT"
  echo "   Stream size: $STREAM_SIZE bytes"
else
  echo "⚠️  No commits found yet (model may still be processing)"
  echo "   This is normal for large IFC files (>10MB)"
  echo "   Model will be available in BIM viewer once processing completes"
fi

# =============================================================================
# STEP 5: Output Configuration
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ DEMO SETUP COMPLETE                            ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 CONFIGURATION FOR PHASE 4 DEPLOYMENT:"
echo ""
echo "Environment: $ENVIRONMENT"
echo "Building Type: $BUILDING_TYPE"
echo ""
echo "Stream ID:  $STREAM_ID"
echo "Object ID:  $OBJECT_ID"
echo "Token:      (ephemeral, obtained from credentials at runtime)"
echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""
echo "📝 NEXT STEPS:"
echo ""
echo "1. Add to docker-compose.$ENVIRONMENT.yml (web service build args):"
echo "   ────────────────────────────────────────────────────────"
echo "   REACT_APP_DEMO_STREAM_ID: '$STREAM_ID'"
echo "   REACT_APP_DEMO_OBJECT_ID: '$OBJECT_ID'"
echo "   ────────────────────────────────────────────────────────"
echo ""
echo "2. Commit and deploy:"
echo "   git add docker-compose.$ENVIRONMENT.yml"
echo "   git commit -m 'feat(bim-viewer): P0 ROOT CAUSE #62 PHASE 4 - Configure Demo: $BUILDING_TYPE'"
echo "   git push origin develop"
echo ""
echo "3. After deployment, validate BIM viewer:"
echo "   https://$ENVIRONMENT.ectropy.ai/dashboard/architect"
echo "   Expected: 3D model of $BUILDING_TYPE visible and interactive"
echo ""
echo "4. View project in Speckle (after frontend routing fix):"
echo "   $SPECKLE_URL/streams/$STREAM_ID"
echo ""
echo "─────────────────────────────────────────────────────────────────────"
echo ""
echo "🏗️  SCALABILITY: To add more building types:"
echo "   - Add IFC file to test-data/"
echo "   - Update BUILDING_FILES mapping in this script"
echo "   - Run: bash scripts/core/speckle-demo-setup.sh staging [new-building-type]"
echo ""
echo "🔐 SECURITY: Token stored in GitHub Secrets (not in repository)"
echo "📊 MONITORING: View project at $SPECKLE_URL/streams/$STREAM_ID"
echo "🎯 ENTERPRISE: Mirrors real user workflow (create → upload → view)"
echo ""
