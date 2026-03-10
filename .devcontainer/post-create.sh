#!/bin/bash
# .devcontainer/post-create.sh - Enterprise Development Environment Setup
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handling function
handle_error() {
    local exit_code=$?
    local line_number=$1
    log_error "Script failed at line $line_number with exit code $exit_code"
    log_info "Attempting graceful recovery..."
    # Continue with best effort rather than failing completely
    return 0
}

# Set up error handler
trap 'handle_error ${LINENO}' ERR

# Start setup
log_info "🚀 Starting Ectropy enterprise development environment setup..."

# Ensure workspace directory permissions
log_info "Setting up workspace permissions..."
# Use current user instead of assuming vscode user exists
sudo chown -R $(whoami):$(whoami) /workspace 2>/dev/null || sudo chown -R $(id -u):$(id -g) /workspace 2>/dev/null || true

# Environment file setup
log_info "Setting up environment configuration..."
if [ ! -f /workspace/.env ]; then
    if [ -f /workspace/.env.template ]; then
        cp /workspace/.env.template /workspace/.env
        log_success ".env file created from template"
    else
        log_warning "No .env.template found, creating minimal .env with placeholders (no secrets)"
        cat > /workspace/.env << 'EOF'
# Copy .devcontainer/.env.example and set secure values before use.
NODE_ENV=development
PORT=4000

# Set these environment variables with secure values:
# DATABASE_URL=postgresql://postgres:${POSTGRES_DEV_PASSWORD}@postgres:5432/construction_platform
# REDIS_URL=redis://:${REDIS_DEV_PASSWORD}@redis:6379
# POSTGRES_DEV_PASSWORD=CHANGE_ME_POSTGRES_PASSWORD
# REDIS_DEV_PASSWORD=CHANGE_ME_REDIS_PASSWORD

EOF
        log_info "Created placeholder .env (secrets left blank). See .devcontainer/.env.example"
    fi
else
    log_success ".env file already exists"
fi

# Validate Node.js toolchain
log_info "Validating Node.js toolchain..."

check_command() {
    local cmd=$1
    local expected_version=${2:-""}
    
    if command -v "$cmd" >/dev/null 2>&1; then
        local version
        version=$($cmd --version 2>/dev/null || echo "unknown")
        log_success "$cmd is available (version: $version)"
        
        if [ -n "$expected_version" ] && [[ ! "$version" =~ $expected_version ]]; then
            log_warning "$cmd version ($version) might not match expected ($expected_version)"
        fi
        return 0
    else
        log_error "$cmd is not available"
        # Don't fail completely, just log and continue
        return 1
    fi
}

# Check all required tools with graceful failure handling
log_info "Checking Node.js toolchain..."
check_command "node" "v20" || log_warning "Node.js check failed - continuing"
check_command "npm" || log_warning "npm check failed - continuing" 


# Install pnpm in user space - ALWAYS, regardless of detection
log_info "Installing pnpm in user space..."
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

# Remove any existing global pnpm
sudo npm uninstall -g pnpm 2>/dev/null || true

# Install pnpm locally
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Ensure PATH is updated
echo 'export PNPM_HOME="$HOME/.local/share/pnpm"' >> ~/.bashrc
echo 'export PATH="$PNPM_HOME:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Configure pnpm
pnpm config set store-dir "$HOME/.local/share/pnpm-store"
pnpm config set cache-dir "$HOME/.cache/pnpm"

log_success "pnpm installed in user space"

check_command "npx" || log_warning "npx check failed - continuing"
check_command "tsc" "5\."
check_command "ts-node"

# Verify pnpm configuration
log_info "Verifying pnpm configuration..."
pnpm config list | grep -E "(store-dir|cache-dir|registry)" || log_warning "pnpm configuration might not be optimal"

# Install dependencies if needed
if [ ! -d "/workspace/node_modules" ] || [ ! -f "/workspace/node_modules/.pnpm/lock.yaml" ]; then
    log_info "Installing project dependencies..."
    cd /workspace
    
    # Update lockfile if needed
    if ! pnpm install --frozen-lockfile 2>/dev/null; then
        log_warning "Lockfile update required, installing with --no-frozen-lockfile"
        pnpm install --no-frozen-lockfile
    fi
    
    log_success "Dependencies installed successfully"
else
    log_success "Dependencies already installed"
fi

# Validate TypeScript configuration
log_info "Validating TypeScript configuration..."
cd /workspace
if npx tsc --noEmit --project tsconfig.json >/dev/null 2>&1; then
    log_success "TypeScript configuration is valid"
else
    log_warning "TypeScript configuration has issues - this will be addressed in subsequent fixes"
fi

# Set up Git configuration if needed
if [ -z "$(git config --global user.name 2>/dev/null || true)" ]; then
    log_info "Setting up default Git configuration..."
    git config --global user.name "Ectropy Developer"
    git config --global user.email "dev@ectropy.platform"
    git config --global init.defaultBranch main
    git config --global core.autocrlf input
    log_success "Git configuration set up"
fi

# Validate database and services connectivity
log_info "Checking service connectivity..."

check_service() {
    local service=$1
    local host=$2
    local port=$3
    
    if timeout 5 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        log_success "$service is accessible at $host:$port"
    else
        log_warning "$service is not accessible at $host:$port (this is normal if services aren't started yet)"
    fi
}

check_service "PostgreSQL" "postgres" "5432"
check_service "Redis" "redis" "6379"

# If the optional wait-for-services helper exists, use it to block until services are healthy.
if [ -x "/workspace/.devcontainer/wait-for-services.sh" ]; then
    log_info "Using wait-for-services.sh to wait for DB and cache readiness..."
    # Export environment vars for the helper to consume from .env
    if [ -f /workspace/.env ]; then
        # shellcheck disable=SC1091
        set -a; source /workspace/.env; set +a
    fi
    /workspace/.devcontainer/wait-for-services.sh || log_warning "wait-for-services.sh reported services not ready"
else
    log_info "No wait-for-services helper found; continuing without blocking on services"
fi

# Create useful aliases
log_info "Setting up development aliases..."
cat >> ~/.bashrc << 'EOF'
# Ectropy Development Aliases
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# Enterprise DevContainer Commands (Step 8)
alias ectropy-dev='cd /workspace && pnpm run dev'
alias ectropy-build='cd /workspace && pnpm nx run web-dashboard:build'
alias ectropy-test='cd /workspace && pnpm run test'
alias ectropy-lint='cd /workspace && pnpm run lint'
alias ectropy-health='cd /workspace && bash .devcontainer/health-check.sh'
alias ectropy-clean='cd /workspace && rm -rf node_modules dist && pnpm install'

# Daily Workflow Commands
alias ectropy-morning='cd /workspace && bash .devcontainer/preflight-check.sh && docker compose -f .devcontainer/docker-compose.yml up -d && bash .devcontainer/validate-environment.sh'
alias ectropy-status='cd /workspace && docker compose -f .devcontainer/docker-compose.yml ps && bash .devcontainer/monitor.sh summary'
alias ectropy-logs='cd /workspace && docker compose -f .devcontainer/docker-compose.yml logs -f'
alias ectropy-restart='cd /workspace && bash .devcontainer/startup-orchestrator.sh restart'
alias ectropy-recovery='cd /workspace && bash .devcontainer/recovery.sh'
alias ectropy-monitor='cd /workspace && bash .devcontainer/monitor.sh monitor'
alias ectropy-cleanup='cd /workspace && docker compose -f .devcontainer/docker-compose.yml down && docker system prune -f'

# Environment helpers
alias show-env='printenv | grep -E "(NODE|PNPM|PATH)" | sort'
alias show-versions='echo "Node: $(node --version)"; echo "NPM: $(npm --version)"; echo "PNPM: $(pnpm --version)"; echo "TypeScript: $(tsc --version)"'
alias show-docker='echo "Docker: $(docker --version)"; echo "Compose: $(docker compose version)"'

# Enterprise shortcuts
alias preflight='bash .devcontainer/preflight-check.sh'
alias validate-env='bash .devcontainer/validate-environment.sh'
alias health='bash .devcontainer/health-check.sh'
alias monitor='bash .devcontainer/monitor.sh'
alias recovery='bash .devcontainer/recovery.sh'
alias orchestrate='bash .devcontainer/startup-orchestrator.sh'
EOF

# Final validation
log_info "Running comprehensive environment validation..."
cd /workspace

# Use our new comprehensive validation script
if bash /workspace/.devcontainer/validate-environment.sh; then
    log_success "✅ Dev container setup completed successfully!"
    log_info "Environment is ready for development."
else
    log_warning "⚠️  Dev container setup completed with warnings."
    log_info "Some optional components may not be fully configured."
    log_info "Run 'bash .devcontainer/validate-environment.sh' for details."
fi

# Display summary
echo ""
log_success "🎉 Ectropy development environment setup completed!"
echo ""
log_info "📋 Environment Summary:"
echo "  Node.js: $(node --version 2>/dev/null || echo 'Not available')"
echo "  NPM: $(npm --version 2>/dev/null || echo 'Not available')" 
echo "  PNPM: $(pnpm --version 2>/dev/null || echo 'Not available')"
echo "  TypeScript: $(tsc --version 2>/dev/null || echo 'Not available')"
echo "  Workspace: /workspace"
echo ""
log_info "🚀 Enterprise Daily Workflow Commands:"
echo "  ectropy-morning   - Complete morning startup routine"
echo "  ectropy-dev       - Start development servers"
echo "  ectropy-build     - Build web dashboard (working component)"
echo "  ectropy-test      - Run all tests"
echo "  ectropy-health    - Check system health"
echo "  ectropy-status    - Show service status and monitoring summary"
echo "  ectropy-restart   - Restart all services with orchestration"
echo "  ectropy-cleanup   - End-of-day cleanup"
echo ""
log_info "🔧 Enterprise Troubleshooting Commands:"
echo "  preflight         - Run pre-flight checks"
echo "  validate-env      - Validate environment configuration"
echo "  health            - Run comprehensive health check"
echo "  monitor           - Start monitoring dashboard"
echo "  recovery          - Run automated recovery procedures"
echo "  orchestrate       - Manual service orchestration"
echo ""
log_info "🛠️ Common Workflows:"
echo "  Morning: ectropy-morning"
echo "  Development: ectropy-dev"
echo "  Build & Test: ectropy-build && ectropy-test"
echo "  Troubleshoot: health && recovery"
echo "  End of Day: ectropy-cleanup"
echo ""
log_info "📚 Documentation:"
echo "  Troubleshooting: .devcontainer/TROUBLESHOOTING.md"
echo "  Health Checks: bash .devcontainer/health-check.sh"
echo "  Monitoring: bash .devcontainer/monitor.sh summary"
echo ""
