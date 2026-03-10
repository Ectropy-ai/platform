#!/bin/bash
set -e

echo "🚀 Quick MCP Server Start for Construction AI"

# Kill any existing MCP processes
pkill -f "mcp-server" || true
sleep 2

# Start with minimal configuration
cd apps/mcp-server
export NODE_ENV=development
export MCP_PORT=3001
export MCP_HOST=0.0.0.0

# Use direct node execution (bypass build issues)
npx tsx src/server.ts &
MCP_PID=$!
echo "MCP Server PID: $MCP_PID"

# Wait for startup with better timeout handling
for i in {1..30}; do
  if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ MCP Server operational on port 3001"
    exit 0
  fi
  echo "Waiting for MCP startup... ($i/30)"
  sleep 2
done

echo "❌ MCP Server failed to start within 60 seconds"
kill $MCP_PID 2>/dev/null || true
exit 1
