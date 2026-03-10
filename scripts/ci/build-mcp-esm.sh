#!/bin/bash
# MCP Server Build and Deploy Script
# Implements the enterprise solution for ESM compatibility

set -e

echo "🔧 Building MCP server with externalized dependencies..."
pnpm nx build mcp-server

echo "📦 Preparing deployment package.json..."
pnpm nx prepare mcp-server

echo "✅ MCP server build completed. To deploy:"
echo "   cd dist/apps/mcp-server"
echo "   npm install --production"
echo "   node -r dotenv/config main.js"