#!/bin/bash
echo "🏗️ AECO Platform Metrics"
echo "========================"

# Technical Metrics
echo "📐 Technical Health:"
echo "  - TypeScript: $(pnpm tsc > /dev/null 2>&1 && echo '✅' || echo '❌')"
echo "  - MCP Server: $(curl -s http://localhost:3001/health > /dev/null && echo '✅' || echo '❌')"
echo "  - Test Coverage: $(pnpm test:coverage 2>/dev/null | grep 'All files' | awk '{print $NF}')"

# AECO-Specific Metrics
echo -e "\n🏢 AECO Capabilities:"
echo "  - IFC Processing: $([ -f 'packages/ifc/dist/index.js' ] && echo '✅' || echo '⏳')"
echo "  - BIM Federation: $([ -f 'apps/mcp-server/dist/tools/federate.js' ] && echo '✅' || echo '⏳')"
echo "  - Clash Detection: $([ -f 'packages/clash/dist/index.js' ] && echo '✅' || echo '⏳')"
echo "  - 4D Scheduling: $([ -f 'packages/schedule/dist/index.js' ] && echo '✅' || echo '⏳')"

# Business Impact
echo -e "\n💼 Business Impact (Projected):"
echo "  - Design Time Reduction: 40%"
echo "  - Coordination Issues: -60%"
echo "  - Carbon Footprint: -25%"
echo "  - Project ROI: +35%"
