#!/bin/bash
# .devcontainer/health-check.sh
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️ [HEALTH] $1${NC}"; }
log_success() { echo -e "${GREEN}✅ [HEALTH] $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ [HEALTH] $1${NC}"; }
log_error() { echo -e "${RED}❌ [HEALTH] $1${NC}"; }

HEALTH_SCORE=0
MAX_SCORE=0

check_component() {
  local name="$1"
  local command="$2"
  local expected="$3"
  
  MAX_SCORE=$((MAX_SCORE + 1))
  
  if eval "$command" > /dev/null 2>&1; then
    if [ -n "$expected" ]; then
      if eval "$command" | grep -q "$expected"; then
        log_success "$name: Working correctly"
        HEALTH_SCORE=$((HEALTH_SCORE + 1))
      else
        log_warning "$name: Running but unexpected output"
      fi
    else
      log_success "$name: Working correctly"
      HEALTH_SCORE=$((HEALTH_SCORE + 1))
    fi
  else
    log_error "$name: Not working"
  fi
}

log_info "🏥 Ectropy Enterprise Health Check"
echo "=================================================="

# User and permissions
log_info "👤 User & Permissions"
echo "Current user: $(whoami)"
echo "Workspace permissions: $(ls -ld /workspace | awk '{print $1, $3, $4}')"

# PNPM Configuration
log_info "📦 PNPM Configuration"
export PNPM_HOME="/home/vscode/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

echo "PNPM_HOME: $PNPM_HOME"
echo "PNPM store: $(pnpm config get store-dir 2>/dev/null || echo 'Not configured')"
echo "PNPM cache: $(pnpm config get cache-dir 2>/dev/null || echo 'Not configured')"

check_component "PNPM Installation" "pnpm --version" "10\."
check_component "PNPM Permissions" "pnpm config get store-dir" "/home/vscode"

# Development Tools
log_info "🛠️ Development Tools"
check_component "Node.js" "node --version" "v20\."
check_component "TypeScript" "tsc --version" "Version"
check_component "Git" "git --version" "git version"

# Workspace Dependencies
log_info "📋 Workspace Dependencies"
cd /workspace
check_component "Package.json" "test -f package.json"
check_component "Node Modules" "test -d node_modules"
check_component "PNPM Lockfile" "test -f pnpm-lock.yaml"

# Database Services
log_info "🗄️ Database Services"
check_component "PostgreSQL" "nc -z localhost 5432"
check_component "Redis" "nc -z localhost 6379"

# MCP Server
log_info "🤖 MCP Server"
check_component "MCP Server Process" "pgrep -f 'mcp-server'"
check_component "MCP Health Endpoint" "curl -f http://localhost:3001/health"

# Network and Ports
log_info "🌐 Network & Ports"
check_component "Port 3001 (MCP)" "nc -z localhost 3001"
check_component "Port 5432 (PostgreSQL)" "nc -z localhost 5432"
check_component "Port 6379 (Redis)" "nc -z localhost 6379"

# Security Check
log_info "🔐 Security Check"
check_component "No sudo required for pnpm" "su - vscode -c 'pnpm --version'"
check_component "Workspace ownership" "test -O /workspace"

# Performance Check
log_info "⚡ Performance Check"
check_component "Available Memory" "test $(free -m | awk '/^Mem:/{print $7}') -gt 500"
check_component "Available Disk" "test $(df /workspace | awk 'NR==2{print $4}') -gt 1000000"

# Calculate health percentage
HEALTH_PERCENTAGE=$((HEALTH_SCORE * 100 / MAX_SCORE))

echo "=================================================="
log_info "📊 Health Summary"
echo "Health Score: $HEALTH_SCORE/$MAX_SCORE ($HEALTH_PERCENTAGE%)"

if [ $HEALTH_PERCENTAGE -ge 90 ]; then
  log_success "🎉 Excellent health! Ready for development."
elif [ $HEALTH_PERCENTAGE -ge 75 ]; then
  log_warning "⚠️ Good health with minor issues."
elif [ $HEALTH_PERCENTAGE -ge 50 ]; then
  log_warning "🔧 Moderate health - some components need attention."
else
  log_error "🚨 Poor health - significant issues need resolution."
fi

echo "=================================================="