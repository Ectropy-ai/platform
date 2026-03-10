#!/bin/bash
# MCP Platform Validation Demo
# Purpose: Demonstrate how to use MCP server as single source of truth
# This replaces the old validate-platform-state.sh script

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  MCP Server Platform Validation                              ║"
echo "║  Single Source of Truth for Platform Health                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if MCP server is running
echo "📡 Checking MCP Server..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ MCP Server is running"
else
    echo "❌ MCP Server is not running"
    echo ""
    echo "To start MCP server:"
    echo "  1. pnpm nx build mcp-server"
    echo "  2. pnpm nx serve mcp-server"
    echo ""
    echo "Or use quick start:"
    echo "  ./scripts/mcp-quick-start.sh"
    echo ""
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Platform Health Score"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
curl -s http://localhost:3001/health | jq '.'
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Repository Truth (Updates CURRENT_TRUTH.md)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Fetching truth data..."
TRUTH_RESPONSE=$(curl -s http://localhost:3001/truth)
if echo "$TRUTH_RESPONSE" | jq -e '.status == "success"' > /dev/null 2>&1; then
    echo "✅ Truth data retrieved successfully"
    echo ""
    echo "Timestamp: $(echo "$TRUTH_RESPONSE" | jq -r '.timestamp')"
    echo ""
    echo "Note: This endpoint runs scripts/truth-baseline.sh to update docs/CURRENT_TRUTH.md"
else
    echo "⚠️  Truth generation had issues"
    echo "$TRUTH_RESPONSE" | jq '.'
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Build Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

for app in "web-dashboard" "api-gateway" "mcp-server"; do
    echo "🔨 Validating $app..."
    curl -s "http://localhost:3001/validate?app=$app" | jq -c '{app, status}'
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Auto-Monitor Health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
curl -s http://localhost:3001/monitor/health | jq '.'
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ MCP Validation Complete                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Available MCP Endpoints:"
echo "  • GET  /health          - Platform health score (0-100)"
echo "  • GET  /truth           - Generate & return current truth"
echo "  • GET  /validate?app=X  - Validate specific app build"
echo "  • GET  /monitor/health  - Auto-monitor status"
echo "  • POST /monitor/start   - Start auto-monitoring"
echo "  • POST /monitor/stop    - Stop auto-monitoring"
echo ""
echo "For more info: docs/CURRENT_TRUTH.md"
echo ""
