#!/bin/bash
# .devcontainer/integration-test.sh
set -e

log_info() { echo "🔄 [INTEGRATION] $1"; }
log_success() { echo "✅ [INTEGRATION] $1"; }
log_error() { echo "❌ [INTEGRATION] $1"; }

log_info "Running complete Ectropy integration test..."

# Run all validation scripts
log_info "Running health check..."
bash /workspace/.devcontainer/health-check.sh

log_info "Running security validation..."
bash /workspace/.devcontainer/security-hardening.sh

log_info "Running performance optimization..."
bash /workspace/.devcontainer/optimize-performance.sh

log_info "Running MCP server validation..."
bash /workspace/.devcontainer/validate-mcp-server.sh

# Final integration test
log_info "Testing complete development workflow..."
cd /workspace

su - vscode -c "
  export PNPM_HOME='/home/vscode/.local/share/pnpm'
  export PATH='\$PNPM_HOME:\$PATH'
  cd /workspace
  
  # Test dependency installation
  pnpm install
  
  # Test building
  pnpm nx build mcp-server
  
  # Test starting MCP server
  pnpm start:mcp > /tmp/integration-test.log 2>&1 &
  MCP_PID=\$!
  
  sleep 10
  
  # Test MCP health
  curl -f http://localhost:3001/health
  
  # Test MCP functionality
  curl -X POST http://localhost:3001/api/tools/call \
    -H 'Content-Type: application/json' \
    -d '{\"tool\":\"health_check\",\"parameters\":{}}'
  
  # Cleanup
  kill \$MCP_PID 2>/dev/null || true
"

log_success "🎉 Complete integration test passed!"
log_success "Ectropy development environment is ready for use!"