#!/bin/bash
set -e

echo "🚀 Bootstrapping MCP Server for GitHub Actions..."

# Detect environment
if [ -n "$GITHUB_WORKSPACE" ]; then
  WORKSPACE_DIR="$GITHUB_WORKSPACE"
  echo "✅ Detected GitHub Actions environment"
  echo "   GITHUB_WORKSPACE: $GITHUB_WORKSPACE"
elif [ -d "/workspace" ]; then
  WORKSPACE_DIR="/workspace"
  echo "✅ Detected Codespaces environment"
else
  echo "❌ Unknown environment - cannot determine workspace directory"
  echo "   GITHUB_WORKSPACE: ${GITHUB_WORKSPACE:-not set}"
  echo "   /workspace exists: $([ -d "/workspace" ] && echo "yes" || echo "no")"
  exit 1
fi

echo "📂 Working directory: $WORKSPACE_DIR"
cd "$WORKSPACE_DIR"

# Install pnpm if not available
if ! command -v pnpm &> /dev/null; then
  echo "📥 Installing pnpm..."
  npm install -g pnpm@10.11.0
  echo "✅ pnpm installed: $(pnpm --version)"
else
  echo "✅ pnpm already installed: $(pnpm --version)"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  pnpm install --frozen-lockfile || pnpm install
else
  echo "✅ Dependencies already installed"
fi

# Generate Prisma client if needed
if [ ! -d "node_modules/.prisma" ] && [ -f "prisma/schema.prisma" ]; then
  echo "📦 Generating Prisma client..."
  pnpm prisma generate
else
  echo "✅ Prisma client already generated or schema not found"
fi

# No build required - using source file directly
echo "✅ Using source file apps/mcp-server/src/server-simple.js (no build needed)"


# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found - cannot start services"
  exit 1
fi

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
else
  echo "❌ docker-compose not found"
  exit 1
fi

# Start required services for MCP
echo "🗄️ Starting PostgreSQL and Redis..."
$DOCKER_COMPOSE -f docker-compose.test.yml up -d postgres redis

# Wait for PostgreSQL
echo "⏳ Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker exec ectropy-postgres-test pg_isready -U postgres 2>/dev/null; do sleep 1; done' || {
  echo "❌ PostgreSQL failed to start within 60 seconds"
  echo "Checking container logs:"
  docker logs ectropy-postgres-test 2>&1 | tail -20
  exit 1
}
echo "✅ PostgreSQL is ready"

# Wait for Redis
echo "⏳ Waiting for Redis to be ready..."
timeout 60 bash -c 'until docker exec ectropy-redis-test redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done' || {
  echo "❌ Redis failed to start within 60 seconds"
  echo "Checking container logs:"
  docker logs ectropy-redis-test 2>&1 | tail -20
  exit 1
}
echo "✅ Redis is ready"

# Run Prisma migrations
if [ -f "prisma/schema.prisma" ]; then
  echo "🔄 Running database migrations..."
  export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ectropy_test"
  pnpm prisma migrate deploy || {
    echo "⚠️ Migrations failed or already applied"
    # Try to create database if it doesn't exist
    pnpm prisma db push --skip-generate || echo "⚠️ Database push failed"
  }
else
  echo "⚠️ No Prisma schema found, skipping migrations"
fi

# Start MCP server in background
echo "🚀 Starting MCP server..."
export NODE_ENV=development
export MCP_PORT=3001
export API_GATEWAY_HOST=localhost
export API_GATEWAY_PORT=4000
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ectropy_test"
export REDIS_HOST=localhost
export REDIS_PORT=6379
export VALIDATION_ONLY=true

# Kill any existing MCP server process
if [ -f /tmp/mcp-server.pid ]; then
  OLD_PID=$(cat /tmp/mcp-server.pid)
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚠️ Stopping existing MCP server (PID: $OLD_PID)"
    kill "$OLD_PID" || true
    sleep 2
  fi
fi

# Start MCP server (using source file directly - no build required)
node apps/mcp-server/src/server-simple.js > /tmp/mcp-server.log 2>&1 &
MCP_PID=$!
echo "$MCP_PID" > /tmp/mcp-server.pid

echo "   MCP server started with PID: $MCP_PID"
echo "   Logs: /tmp/mcp-server.log"

# Wait for MCP server to be ready
echo "⏳ Waiting for MCP server to be ready..."
for i in {1..60}; do
  if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ MCP server is healthy"
    echo ""
    echo "📋 MCP Server Information:"
    echo "   URL: http://localhost:3001"
    echo "   Health: http://localhost:3001/health"
    echo "   Tools: http://localhost:3001/api/tools"
    echo "   Agent Status: http://localhost:3001/api/mcp/health"
    echo ""
    exit 0
  fi
  sleep 1
done

echo "❌ MCP server failed to start within 60 seconds"
echo ""
echo "📋 MCP server logs (last 50 lines):"
tail -50 /tmp/mcp-server.log
echo ""
echo "📋 Process status:"
if kill -0 "$MCP_PID" 2>/dev/null; then
  echo "   Process is still running (PID: $MCP_PID)"
else
  echo "   Process has exited"
fi
exit 1
