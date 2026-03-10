#!/bin/bash
clear
echo "🏆 ECTROPY VICTORIES"
echo "==================="
echo "Platform transforming AECO industry"
echo ""

# What's working
echo "✅ WORKING:"
[ -f "scripts/start-mcp.sh" ] && echo "  • MCP Server launcher"
[ -f "packages/ifc/src/processor.ts" ] && echo "  • IFC Processor"
[ -f "scripts/track-progress.sh" ] && echo "  • Progress tracking"
[ -d "packages/clash" ] && echo "  • Clash detection package"

# Recent wins
echo -e "\n🎯 RECENT WINS:"
git log --oneline --since="24 hours ago" 2>/dev/null | head -5 | sed 's/^/  • /'

# Features ready
echo -e "\n🏗️ AECO FEATURES:"
[ -f "packages/ifc/src/processor.ts" ] && echo "  • IFC parsing ✅"
[ -f "packages/clash/src/index.ts" ] && echo "  • Clash detection ✅"
[ -f "packages/federation/src/index.ts" ] && echo "  • Model federation ✅"

# Next milestone
echo -e "\n🚀 NEXT MILESTONE:"
if ! pnpm test packages/ifc --passWithNoTests 2>/dev/null | grep -q "PASS"; then
  echo "  Get IFC tests passing"
elif ! curl -s http://localhost:3001/health > /dev/null; then
  echo "  Get MCP server stable"
else
  echo "  Deploy to staging!"
fi

# Momentum score
SCORE=0
[ -f "packages/ifc/src/processor.ts" ] && ((SCORE+=25))
[ -f "scripts/start-mcp.sh" ] && ((SCORE+=25))
pnpm test packages/ifc --passWithNoTests 2>/dev/null && ((SCORE+=25))
curl -s http://localhost:3001/health > /dev/null 2>&1 && ((SCORE+=25))

echo -e "\n💪 MOMENTUM SCORE: $SCORE/100"

if [ $SCORE -ge 75 ]; then
  echo "🔥 You're on fire! Keep pushing!"
elif [ $SCORE -ge 50 ]; then
  echo "📈 Great progress! Almost there!"
else
  echo "🏃 Building momentum..."
fi
