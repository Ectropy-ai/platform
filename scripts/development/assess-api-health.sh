#!/bin/bash
# API Health Assessment Script
# Quick verification of all critical endpoints

BASE_URL="${BASE_URL:-http://localhost}"

echo "=== Ectropy API Health Assessment ==="
echo "Base URL: $BASE_URL"
echo ""

check_endpoint() {
  local name="$1"
  local path="$2"
  local expect_auth="${3:-false}"

  response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" 2>/dev/null)

  if [ "$expect_auth" = "true" ]; then
    if [ "$response" = "200" ] || [ "$response" = "302" ] || [ "$response" = "401" ]; then
      echo "✓ $name: $response (auth required)"
    else
      echo "✗ $name: $response (unexpected for auth endpoint)"
    fi
  else
    if [ "$response" = "200" ]; then
      echo "✓ $name: $response"
    elif [ "$response" = "404" ]; then
      echo "✗ $name: $response (NOT IMPLEMENTED)"
    else
      echo "⚠ $name: $response"
    fi
  fi
}

echo "--- Core Services ---"
check_endpoint "API Gateway Health" "/api/health"
check_endpoint "OAuth Health" "/api/auth/health"
check_endpoint "MCP Server Health" "/api/mcp/health"

echo ""
echo "--- BIM Services ---"
check_endpoint "IFC Processing Health" "/api/ifc/health"
check_endpoint "IFC Supported Types" "/api/ifc/supported-types"
check_endpoint "Speckle Integration" "/api/speckle/health"

echo ""
echo "--- Application APIs ---"
check_endpoint "Projects API" "/api/v1/projects" "true"
check_endpoint "Elements API" "/api/v1/elements" "true"

echo ""
echo "--- DAO Governance APIs ---"
check_endpoint "DAO Templates" "/api/v1/dao/templates" "true"
check_endpoint "DAO Proposals" "/api/v1/dao/proposals" "true"

echo ""
echo "--- Speckle Server Direct ---"
response=$(curl -s -X POST http://localhost:3333/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{serverInfo{version}}"}' | grep -o '"version":"[^"]*"')

if [ -n "$response" ]; then
  version=$(echo "$response" | sed 's/"version":"//;s/"//')
  echo "✓ Speckle Server: v$version (port 3333)"
else
  echo "✗ Speckle Server: No response (port 3333)"
fi

echo ""
echo "=== Assessment Complete ==="
