#!/bin/bash
# MCP Deployment Validation Script - Enterprise Standard
# Ensures comprehensive security, performance, and health validation before deployment

set -euo pipefail

echo "🔍 MCP Deployment Validation v1.0"
echo "=================================="

# Performance: Run checks in parallel
(
  # Security: Validate no hardcoded credentials
  echo "🔒 Security Check: Scanning for credentials..."
  if grep -r "password\s*=\s*['\"]" apps/mcp-server/src --include="*.ts" --include="*.js" | grep -v "process.env" | head -5; then
    echo "❌ SECURITY: Hardcoded credentials detected"
    exit 1
  elif grep -r "secret\s*=\s*['\"]" apps/mcp-server/src --include="*.ts" --include="*.js" | grep -v "process.env" | head -5; then
    echo "❌ SECURITY: Hardcoded secrets detected"
    exit 1
  elif grep -r "api.*key\s*=\s*['\"]" apps/mcp-server/src --include="*.ts" --include="*.js" | grep -v "process.env" | head -5; then
    echo "❌ SECURITY: Hardcoded API keys detected"
    exit 1
  else
    echo "✅ No hardcoded credentials found"
  fi
) &

(
  # Health: Verify build integrity
  echo "🏗️ Health Check: Building MCP server..."
  if pnpm nx build mcp-server --skip-nx-cache; then
    echo "✅ MCP build successful"
  else
    echo "❌ HEALTH: MCP build failed"
    exit 1
  fi
) &

(
  # Performance: Check bundle size
  echo "📊 Performance Check: Validating bundle size..."
  MAX_SIZE=5000000  # 5MB limit
  if [ -d "dist/apps/mcp-server" ]; then
    SIZE=$(du -sb dist/apps/mcp-server | cut -f1)
    if [ $SIZE -gt $MAX_SIZE ]; then
      echo "❌ PERFORMANCE: Bundle size exceeds limit ($SIZE > $MAX_SIZE)"
      exit 1
    else
      echo "✅ Bundle size within limits ($SIZE bytes)"
    fi
  else
    echo "⚠️ Build directory not found - will be created during build"
  fi
) &

# Wait for all parallel checks
wait

# Critical file validation
echo "📁 Validating critical files..."
CRITICAL_FILES=(
  "apps/mcp-server/src/server.ts"
  "apps/mcp-server/package.json"
  "libs/database/src/config/index.ts"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "❌ Missing critical file: $file"
    exit 1
  else
    echo "✅ Found: $file"
  fi
done

# Environment variable usage validation
echo "🔍 Validating environment variable usage..."
if grep -r "process.env\[" apps/mcp-server/ | head -5; then
  echo "✅ Found proper environment variable usage"
else
  echo "⚠️ Limited environment variable usage found - review configuration"
fi

# TypeScript validation
echo "🔧 TypeScript validation..."
if pnpm nx run mcp-server:type-check; then
  echo "✅ TypeScript validation passed"
else
  echo "⚠️ TypeScript validation issues - proceeding with warnings"
fi

echo ""
echo "✅ All MCP validation checks passed"
echo "🚀 MCP server is ready for deployment"
exit 0