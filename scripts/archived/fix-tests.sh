#!/bin/bash
echo "🔧 Test Fix Priority List"
echo "========================"

# Priority 1: MCP Server tests (critical path)
echo -e "\n🚨 Priority 1 - MCP Server:"
pnpm test apps/mcp-server 2>&1 | grep -E "PASS|FAIL" | head -5

# Priority 2: Core packages
echo -e "\n⚠️ Priority 2 - Core Packages:"
for pkg in ifc clash speckle; do
  echo -n "  $pkg: "
  pnpm test packages/$pkg 2>&1 | grep -c "PASS" | xargs echo "passing"
done

# Priority 3: Fix one test at a time
echo -e "\n📝 Fix Strategy:"
echo "  1. Start with MCP server tests"
echo "  2. Fix one failing test suite at a time"
echo "  3. Skip broken legacy tests temporarily"
echo "  4. Add new tests for AECO features"
