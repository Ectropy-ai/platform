#!/bin/bash
# Start MCP Server for Demo

set -euo pipefail

cd "$(dirname "$0")/.."

# Load demo environment
source "demo-environment/.env.demo"

echo "🤖 Starting MCP Server for Demo..."
echo "Environment: $NODE_ENV"

# Check if build exists
if [ ! -f "dist/apps/mcp-server/main.js" ]; then
  echo "❌ MCP Server build not found. Run: pnpm nx run mcp-server:build"
  exit 1
fi

echo "✅ Starting MCP Server on port 3001..."
exec node dist/apps/mcp-server/main.js
