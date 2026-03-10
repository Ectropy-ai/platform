#!/bin/bash
echo "🚀 Starting MCP Server..."

cd apps/mcp-server

# Try TypeScript version first
echo "Attempting TypeScript server..."
timeout 5 node --import tsx --experimental-specifier-resolution=node src/server.ts
TS_STATUS=$?

# If that fails, use fallback
if [ $TS_STATUS -ne 0 ]; then
  echo "⚠️ TypeScript server failed, using JavaScript fallback..."
  sleep 1
  node src/server-simple.js
fi
