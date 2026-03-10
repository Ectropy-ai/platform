#!/bin/sh
set -e

echo "Starting MCP Server..."

# Wait for database to be ready
echo "Waiting for database..."
until pg_isready -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

# ENTERPRISE FIX (2026-01-16): START HTTP SERVERS FOR SEPPA TESTING
# ROOT CAUSE: nx serve only compiles code in watch mode, doesn't execute it
# PROBLEM: Express API (SEPPA backend) not available for testing
# SOLUTION: Build once, then run the server directly
# TRADE-OFF: Manual rebuild needed for code changes (acceptable for testing phase)

echo "Building MCP Server..."
pnpm nx build mcp-server --skip-nx-cache

echo "Starting MCP Server with HTTP APIs enabled..."
exec node /app/dist/apps/mcp-server/main.js
