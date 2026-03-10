#!/bin/bash

# Pre-Commit Validation Script
# Validates staged changes against anti-pattern detection rules

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔍 Pre-Commit Validation"
echo "========================"
echo ""

# Check if MCP server is running
MCP_URL="http://localhost:3002"
if ! curl -s -f "${MCP_URL}/health" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Warning: MCP server not running on port 3002${NC}"
  echo "   Validation skipped - commit allowed"
  echo ""
  echo "   To enable validation:"
  echo "   1. Start MCP server: pnpm nx serve mcp-server"
  echo "   2. Commit again"
  echo ""
  exit 0
fi

# Get staged changes as diff
DIFF=$(git diff --cached)

if [ -z "$DIFF" ]; then
  echo "No staged changes detected"
  exit 0
fi

# Send diff to MCP validation endpoint
RESPONSE=$(curl -s -X POST "${MCP_URL}/api/mcp/validate-commit" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS:%{http_code}" \
  --data-binary @- <<EOF
{
  "diff": $(echo "$DIFF" | jq -Rs .)
}
EOF
)

# Extract HTTP status
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d':' -f2)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

# Parse response
RECOMMENDATION=$(echo "$RESPONSE_BODY" | jq -r '.recommendation // "error"')
SCORE=$(echo "$RESPONSE_BODY" | jq -r '.score // 0')
VIOLATIONS=$(echo "$RESPONSE_BODY" | jq -r '.violations // []')

echo "Analysis Results:"
echo "----------------"
echo "Score: $SCORE/100"
echo "Recommendation: $RECOMMENDATION"
echo ""

# Display violations if any
VIOLATION_COUNT=$(echo "$VIOLATIONS" | jq 'length')
if [ "$VIOLATION_COUNT" -gt 0 ]; then
  echo "Violations Found: $VIOLATION_COUNT"
  echo ""
  
  echo "$VIOLATIONS" | jq -r '.[] | "  [\(.severity | ascii_upcase)] \(.category): \(.description)\n  File: \(.file)\n  Evidence: \(.evidence)\n  Suggestion: \(.suggestion)\n"'
fi

# Decision based on recommendation
case "$RECOMMENDATION" in
  "reject")
    echo -e "${RED}❌ COMMIT BLOCKED${NC}"
    echo "   Critical violations detected"
    echo ""
    echo "   Next steps:"
    echo "   1. Fix the violations listed above"
    echo "   2. Stage the fixes: git add <files>"
    echo "   3. Commit again"
    echo ""
    echo "   Emergency bypass (use sparingly):"
    echo "   git commit --no-verify"
    echo ""
    exit 1
    ;;
  
  "review")
    echo -e "${YELLOW}⚠️  COMMIT ALLOWED WITH WARNINGS${NC}"
    echo "   Please review violations before proceeding"
    echo ""
    exit 0
    ;;
  
  "approve")
    echo -e "${GREEN}✅ COMMIT APPROVED${NC}"
    echo "   No violations detected"
    echo ""
    exit 0
    ;;
  
  *)
    echo -e "${YELLOW}⚠️  Validation endpoint error${NC}"
    echo "   Allowing commit to proceed"
    echo ""
    exit 0
    ;;
esac
