#!/bin/bash
# Start API Gateway for Demo

set -euo pipefail

cd "$(dirname "$0")/.."

# Load demo environment
source "demo-environment/.env.demo"

echo "🚀 Starting API Gateway for Demo..."
echo "JWT_SECRET configured: ${JWT_SECRET:0:10}..."
echo "Environment: $NODE_ENV"

# Check if build exists
if [ ! -f "dist/apps/api-gateway/main.js" ]; then
  echo "❌ API Gateway build not found. Run: pnpm nx run api-gateway:build"
  exit 1
fi

echo "✅ Starting API Gateway on port 4000..."
exec node dist/apps/api-gateway/main.js
