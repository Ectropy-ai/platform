#!/bin/bash
clear
echo "🏗️ ECTROPY AECO PLATFORM - Progress Tracker"
echo "============================================"
date

echo -e "\n📈 ESM Migration:"
./scripts/esm-migration-status.sh | grep "Progress:"

echo -e "\n✅ Test Status:"
pnpm test --silent 2>/dev/null | tail -1

echo -e "\n🔒 Security:"
npm audit --audit-level=high 2>/dev/null | grep "found" || echo "  No high vulnerabilities"

echo -e "\n🚀 MCP Server:"
curl -s http://localhost:3001/health > /dev/null && echo "  Status: Running ✅" || echo "  Status: Stopped ❌"

echo -e "\n📊 Code Quality:"
echo "  TypeScript: $(pnpm tsc > /dev/null 2>&1 && echo 'Passing ✅' || echo 'Failing ❌')"
echo "  Test Coverage: $(pnpm test:coverage 2>/dev/null | grep 'All files' | awk '{print $NF}' || echo 'N/A')"

echo -e "\n🏢 AECO Features:"
[ -f "packages/ifc/src/processor.ts" ] && echo "  IFC Processing: ✅" || echo "  IFC Processing: ⏳"
[ -f "packages/clash/src/detector.ts" ] && echo "  Clash Detection: ✅" || echo "  Clash Detection: ⏳"
[ -f "apps/mcp-server/src/tools/aeco/intelligence.ts" ] && echo "  AI Intelligence: ✅" || echo "  AI Intelligence: ⏳"

echo -e "\n💡 Next Action:"
if ! curl -s http://localhost:3001/health > /dev/null; then
  echo "  → Start MCP Server: ./scripts/start-mcp.sh"
elif [ $(find . -name "*.ts" | xargs grep -l "require(" 2>/dev/null | wc -l) -gt 10 ]; then
  echo "  → Continue ESM migration"
else
  echo "  → Build AECO features"
fi
