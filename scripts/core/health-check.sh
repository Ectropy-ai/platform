#!/bin/bash
echo "🏥 System Health Check"
echo "====================="

# MCP Server
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "✅ MCP Server: HEALTHY"
else
  echo "❌ MCP Server: DOWN"
fi

# TypeScript
TS_ERRORS=$(pnpm tsc --noEmit 2>&1 | grep -c "error TS" || echo "0")
if [ "$TS_ERRORS" -eq 0 ]; then
  echo "✅ TypeScript: CLEAN"
else
  echo "⚠️  TypeScript: $TS_ERRORS errors"
fi

# CommonJS
CJS_COUNT=$(find . -name "*.js" -not -path "*/node_modules/*" -exec grep -l "require\|module.exports" {} \; | wc -l)
if [ "$CJS_COUNT" -eq 0 ]; then
  echo "✅ ESM Migration: COMPLETE"
else
  echo "⚠️  CommonJS Files: $CJS_COUNT remaining"
fi

# Security
if [ -f .env ]; then
  echo "⚠️  Security: .env file exists (should use templates)"
else
  echo "✅ Security: No .env in repo"
fi

echo "====================="
echo "Overall Status: $([ "$TS_ERRORS" -eq 0 ] && [ "$CJS_COUNT" -eq 0 ] && echo "✅ HEALTHY" || echo "⚠️  NEEDS ATTENTION")"
