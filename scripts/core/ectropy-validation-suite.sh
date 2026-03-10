#!/bin/bash
echo "🏗️ Ectropy Construction Platform Validation Suite"
echo "================================================"

# Core infrastructure
echo "1. Testing Jest infrastructure..."
pnpm test --passWithNoTests && echo "✅ Jest" || echo "❌ Jest"

# MCP Server
echo "2. Starting MCP server..."
./scripts/mcp-quick-start.sh && echo "✅ MCP Startup" || echo "❌ MCP Startup"

# AECO functionality
echo "3. Testing construction AI capabilities..."
./scripts/test-aeco-functionality.sh && echo "✅ AECO" || echo "❌ AECO"

# CI pipeline
echo "4. Validating CI workflow..."
./scripts/test-ci-workflow.sh | tail -5

# Production readiness
echo "5. Production validation..."
./scripts/validate-mcp-production.sh | grep "Success Rate"


echo "================================================"
echo "🎯 Ectropy Platform Status Complete"
