#!/bin/bash
echo "🚀 Development Momentum"
echo "======================"
echo "Today: $(date +%A)"

# Commits today
echo -n "Commits today: "
git log --since="midnight" --oneline 2>/dev/null | wc -l

# Lines changed
echo -n "Lines changed: +"
git diff --stat HEAD~1 2>/dev/null | tail -1 | awk '{print $4}'

# Features added
echo "Features added:"
[ -f "packages/ifc/src/processor.ts" ] && echo "  ✅ IFC Processor"
[ -f "packages/clash/src/detector.ts" ] && echo "  ✅ Clash Detection"
[ -f "scripts/start-mcp.sh" ] && echo "  ✅ MCP Launcher"

# Next milestone
echo -e "\n🎯 Next Milestone:"
if [ $(pnpm test 2>&1 | grep -c "PASS") -lt 20 ]; then
  echo "  Fix 20 tests to pass"
else
  echo "  Complete AECO core features"
fi
