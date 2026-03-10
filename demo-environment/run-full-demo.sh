#!/bin/bash
# Full Demo Environment Orchestration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() { echo -e "${BLUE}==== $1 ====${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_info() { echo -e "ℹ️ $1"; }

print_header "Enterprise Demo Environment"
print_info "Starting full demo environment..."

# Cleanup function
cleanup() {
  echo ""
  print_info "Shutting down demo environment..."
  
  # Kill background processes
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [ -n "${MCP_PID:-}" ]; then
    kill "$MCP_PID" 2>/dev/null || true
  fi
  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  
  print_success "Demo environment stopped"
  exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

cd "$(dirname "$0")/.."

# Load demo environment
source "demo-environment/.env.demo"

# Start services in background
print_info "Starting API Gateway..."
"demo-environment/start-api-gateway.sh" &
API_PID=$!

print_info "Starting MCP Server..."  
"demo-environment/start-mcp-server.sh" &
MCP_PID=$!

# Wait for services to be ready
sleep 5

print_info "Starting Web Dashboard..."
"demo-environment/start-web-dashboard.sh" &
WEB_PID=$!

# Wait for all services
sleep 10

print_header "Demo Ready!"
print_success "🌟 Enterprise Demo Environment is running!"
echo ""
print_info "Access Points:"
print_info "  🌐 Web Dashboard: http://localhost:4200"
print_info "  🔗 API Gateway:   http://localhost:4000"
print_info "  🤖 MCP Server:    http://localhost:3001"
echo ""
print_info "Demo Accounts:"
print_info "  👨‍💼 Architect:   architect@demo.com  / demo123"
print_info "  👩‍🔧 Engineer:    engineer@demo.com   / demo123"
print_info "  👷‍♂️ Contractor:  contractor@demo.com / demo123"
print_info "  👩‍💼 Owner:       owner@demo.com      / demo123"
echo ""
print_info "Press Ctrl+C to stop the demo environment"

# Keep running until interrupted
while true; do
  sleep 10
  
  # Health check (optional)
  if ! kill -0 "$API_PID" 2>/dev/null; then
    print_info "API Gateway stopped, restarting..."
    "demo-environment/start-api-gateway.sh" &
    API_PID=$!
  fi
  
  if ! kill -0 "$MCP_PID" 2>/dev/null; then
    print_info "MCP Server stopped, restarting..."
    "demo-environment/start-mcp-server.sh" &
    MCP_PID=$!
  fi
done
