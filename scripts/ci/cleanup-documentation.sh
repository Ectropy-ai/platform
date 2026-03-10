#!/bin/bash

# Documentation Cleanup Script
# Identifies and removes documentation violations

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "📄 Documentation Bloat Detection"
echo "================================="
echo ""

# Check if MCP server is running
MCP_URL="http://localhost:3002"
if ! curl -s -f "${MCP_URL}/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ Error: MCP server not running on port 3002${NC}"
  echo ""
  echo "Please start the MCP server first:"
  echo "  pnpm nx serve mcp-server"
  echo ""
  exit 1
fi

# Query documentation report
echo "Scanning repository for documentation violations..."
echo ""

RESPONSE=$(curl -s "${MCP_URL}/api/mcp/documentation-report")

# Parse response
TOTAL=$(echo "$RESPONSE" | jq -r '.analysis.totalMarkdownFiles // 0')
VIOLATIONS_JSON=$(echo "$RESPONSE" | jq -r '.analysis.violationFiles // []')
VIOLATION_COUNT=$(echo "$VIOLATIONS_JSON" | jq 'length')
SCORE=$(echo "$RESPONSE" | jq -r '.analysis.score // 0')

echo "Scan Results:"
echo "-------------"
echo "Total Markdown files: $TOTAL"
echo "Violations found: $VIOLATION_COUNT"
echo "Documentation score: $SCORE/100"
echo ""

# Display violations if any
if [ "$VIOLATION_COUNT" -eq 0 ]; then
  echo -e "${GREEN}✅ No documentation violations detected!${NC}"
  echo ""
  echo "All documentation follows the inline policy."
  exit 0
fi

echo -e "${YELLOW}⚠️  Documentation violations detected:${NC}"
echo ""

# Display violation files
echo "$VIOLATIONS_JSON" | jq -r '.[]' | while read -r file; do
  echo "  - $file"
done

echo ""
echo "Policy: Use inline documentation in CURRENT_TRUTH.md instead of separate files"
echo ""

# Ask for confirmation
read -p "Do you want to remove these files? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo ""
  echo "Cleanup cancelled. No files were removed."
  exit 0
fi

echo ""
echo "Removing violation files..."
echo ""

# Remove each violation file
REMOVED_COUNT=0
echo "$VIOLATIONS_JSON" | jq -r '.[]' | while read -r file; do
  if [ -f "$file" ]; then
    echo "  Removing: $file"
    git rm -f "$file" 2>/dev/null || rm -f "$file"
    REMOVED_COUNT=$((REMOVED_COUNT + 1))
  else
    echo "  Skipped (not found): $file"
  fi
done

echo ""
echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review the changes: git status"
echo "2. Commit the cleanup: git commit -m 'docs: remove documentation violations'"
echo "3. Push changes: git push"
echo ""
echo "Suggested commit message:"
echo "---"
echo "docs: remove documentation violations"
echo ""
echo "Following inline documentation policy:"
echo "- All documentation now in CURRENT_TRUTH.md"
echo "- Removed $VIOLATION_COUNT violation file(s)"
echo "- Documentation score: $SCORE/100"
echo "---"
