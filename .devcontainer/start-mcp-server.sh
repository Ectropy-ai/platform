#!/bin/bash
# .devcontainer/start-mcp-server.sh
set -e

log_info() { echo "🔵 [MCP] $1"; }
log_success() { echo "✅ [MCP] $1"; }
log_error() { echo "❌ [MCP] $1"; }

log_info "Starting MCP server for Ectropy development..."

# Wait for services to be ready
log_info "Waiting for database services..."
timeout 60 bash -c '
  until nc -z localhost 5432; do sleep 1; done
  until nc -z localhost 6379; do sleep 1; done
'

# Switch to workspace and start MCP server
cd /workspace

# Ensure proper permissions
chown -R vscode:vscode /workspace

# Start MCP server as vscode user
su - vscode -c "
  export PNPM_HOME='/home/vscode/.local/share/pnpm'
  export PATH='\$PNPM_HOME:\$PATH'
  export NODE_ENV=development
  export MCP_PORT=3001
  
  cd /workspace
  
  # Build MCP server first
  log_info 'Building MCP server...'
  pnpm nx build mcp-server
  
  # Start MCP server
  log_info 'Starting MCP server on port 3001...'
  pnpm start:mcp > /tmp/mcp-server.log 2>&1 &
  MCP_PID=\$!
  
  # Wait for server to start
  sleep 10
  
  # Test health endpoint
  if curl -f http://localhost:3001/health; then
    log_success 'MCP server started successfully!'
    echo \$MCP_PID > /tmp/mcp-server.pid
  else
    log_error 'MCP server failed to start'
    cat /tmp/mcp-server.log
    exit 1
  fi
"

log_success "MCP server startup completed!"