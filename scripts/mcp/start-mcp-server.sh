#!/bin/bash
echo "Starting MCP Server..."

cd apps/mcp-server

# Load environment
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Use ts-node with ESM support
node --import tsx \
      --experimental-specifier-resolution=node \
      --no-warnings \
      src/server.ts
