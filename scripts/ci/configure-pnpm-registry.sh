#!/bin/bash
# Configure pnpm with enhanced registry settings for self-hosted runners
# Addresses ERR_PNPM_ENOENT and network connectivity issues

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# ============================================================================
# ENTERPRISE BINARY AVAILABILITY PATTERN
# ============================================================================
# Defensive check: Verify pnpm is available BEFORE attempting any pnpm commands
# This pattern prevents exit code 127 ("command not found") errors
# Reference: docs/CURRENT_TRUTH.md - "pnpm Path Resolution Pattern"
# ============================================================================

if ! command -v pnpm &> /dev/null; then
    error "pnpm binary not found in PATH"
    echo ""
    log "PATH diagnostics:"
    echo "  PATH: $PATH"
    echo "  PNPM_HOME: ${PNPM_HOME:-not set}"
    echo ""
    log "Checking common pnpm locations:"
    ls -la /root/setup-pnpm/node_modules/.bin/ 2>/dev/null || echo "  /root/setup-pnpm/node_modules/.bin/ does not exist"
    which pnpm 2>/dev/null || echo "  'which pnpm' returned nothing"
    echo ""
    error "Cannot proceed without pnpm in PATH. Ensure pnpm/action-setup@v4 has run successfully."
    exit 1
fi

# Get the actual pnpm binary location for diagnostics
PNPM_BIN=$(command -v pnpm)
log "✅ pnpm binary available at: $PNPM_BIN"
log "✅ pnpm version: $(pnpm --version)"
echo ""

configure_pnpm_registry() {
    log "🔧 Configuring pnpm with enhanced registry settings..."
    
    # Primary registry configuration
    log "Setting primary registry..."
    pnpm config set registry "https://registry.npmjs.org/"
    
    # Network timeout settings (increased for slow/unstable connections)
    log "Configuring network timeouts..."
    pnpm config set network-timeout 120000  # 2 minutes (increased from default 60s)
    
    # Fetch retry settings (aggressive retry strategy)
    log "Configuring fetch retry strategy..."
    pnpm config set fetch-retries 5  # Increased from default 2
    pnpm config set fetch-retry-factor 2  # Exponential backoff
    pnpm config set fetch-retry-mintimeout 10000  # 10 seconds minimum
    pnpm config set fetch-retry-maxtimeout 120000  # 2 minutes maximum
    
    # Connection settings
    log "Configuring connection settings..."
    pnpm config set fetch-timeout 120000  # 2 minutes for individual requests
    pnpm config set network-concurrency 8  # Limit concurrent downloads to reduce load
    
    # Cache and store settings
    log "Configuring cache settings..."
    pnpm config set prefer-offline false  # Always try network first for CI
    pnpm config set strict-ssl true  # Enforce SSL (disable only if corporate proxy issues)
    
    # Registry-specific settings for common scopes
    log "Configuring scoped registries..."
    # Ensure all @types packages come from npm registry
    pnpm config set "@types:registry" "https://registry.npmjs.org/"
    
    # Logging for debugging
    log "Configuring logging..."
    pnpm config set loglevel "warn"  # Reduce noise but show warnings
    
    # Store configuration
    if [[ -n "${RUNNER_TEMP:-}" ]]; then
        # GitHub Actions runner
        log "Configuring for GitHub Actions runner..."
        pnpm config set store-dir "${HOME}/.pnpm-store"
        pnpm config set cache-dir "${HOME}/.pnpm-cache"
        pnpm config set state-dir "${HOME}/.pnpm-state"
    fi
    
    success "pnpm registry configuration completed"
    
    # Display final configuration
    log "Current pnpm configuration:"
    echo ""
    pnpm config get registry
    pnpm config get network-timeout
    pnpm config get fetch-retries
    pnpm config get fetch-retry-mintimeout
    pnpm config get fetch-retry-maxtimeout
    echo ""
}

# Test registry connectivity with configured settings
test_registry_connectivity() {
    log "🧪 Testing registry connectivity with pnpm..."
    
    # Create a temporary test directory
    local test_dir
    test_dir=$(mktemp -d)
    cd "$test_dir"
    
    # Create minimal package.json
    cat > package.json <<EOF
{
  "name": "registry-test",
  "version": "1.0.0",
  "private": true
}
EOF
    
    log "Testing package fetch (yallist@4.0.0 - known from error logs)..."
    if pnpm add yallist@4.0.0 --save-dev 2>&1 | tee /tmp/pnpm-test.log; then
        success "Package fetch successful!"
        cd - >/dev/null
        rm -rf "$test_dir"
        return 0
    else
        error "Package fetch failed!"
        warning "Showing pnpm error output:"
        tail -20 /tmp/pnpm-test.log || true
        cd - >/dev/null
        rm -rf "$test_dir"
        return 1
    fi
}

# Create .npmrc with registry settings
create_npmrc() {
    log "📝 Creating/updating .npmrc with registry settings..."
    
    local npmrc_path="${1:-.npmrc}"
    
    # Backup existing .npmrc if it exists
    if [[ -f "$npmrc_path" ]]; then
        cp "$npmrc_path" "${npmrc_path}.backup.$(date +%Y%m%d-%H%M%S)"
        log "Backed up existing .npmrc"
    fi
    
    # Create enhanced .npmrc
    cat > "$npmrc_path" <<'EOF'
# Enhanced npm/pnpm registry configuration for self-hosted runners
# Addresses ERR_PNPM_ENOENT and network connectivity issues

# Primary registry
registry=https://registry.npmjs.org/

# Network settings - increased timeouts for unstable connections
network-timeout=120000
fetch-timeout=120000

# Aggressive retry strategy
fetch-retries=5
fetch-retry-factor=2
fetch-retry-mintimeout=10000
fetch-retry-maxtimeout=120000

# Connection management
network-concurrency=8

# Cache settings
prefer-offline=false

# Security
strict-ssl=true
audit-level=moderate

# Behavior
fund=false
save-exact=true
loglevel=warn

# Ensure @types packages use npm registry
@types:registry=https://registry.npmjs.org/
EOF
    
    success "Created/updated $npmrc_path with enhanced registry settings"
}

# Main execution
main() {
    log "🚀 Starting pnpm registry configuration..."
    echo ""
    
    # Configure pnpm
    configure_pnpm_registry
    echo ""
    
    # Create .npmrc in current directory
    if [[ -n "${1:-}" ]] && [[ "$1" == "--create-npmrc" ]]; then
        create_npmrc ".npmrc"
        echo ""
    fi
    
    # Test connectivity
    if [[ -n "${1:-}" ]] && [[ "$1" == "--test" ]]; then
        test_registry_connectivity
        echo ""
    fi
    
    success "pnpm registry configuration complete! 🎉"
    log "Registry: https://registry.npmjs.org/"
    log "Retry strategy: 5 retries with exponential backoff (10s-120s)"
    log "Timeouts: 120s for network and fetch operations"
}

main "$@"
