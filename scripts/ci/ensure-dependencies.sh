#!/bin/bash
# Ensure Dependencies Script
# Ensures that all required dependencies are installed for the Ectropy platform
# Part of the enterprise CI/CD pipeline - can be run standalone or in workflows

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logging functions (consistent with other validation scripts)
log_info() { echo "🔍 $1"; }
log_success() { echo "✅ $1"; }
log_error() { echo "❌ $1" >&2; }
log_warning() { echo "⚠️ $1" >&2; }

# Check if dependencies are installed and install if needed
ensure_dependencies() {
    log_info "Ensuring dependencies are properly installed..."
    
    cd "$PROJECT_ROOT"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        log_warning "Dependencies not found - installing now..."
        
        # Verify pnpm is available
        if ! command -v pnpm >/dev/null 2>&1; then
            log_error "pnpm is required but not available"
            log_error "Please install pnpm: npm install -g pnpm"
            return 1
        fi
        
        # Install dependencies
        log_info "Installing dependencies with pnpm..."
        if ! pnpm install; then
            log_error "Failed to install dependencies"
            return 1
        fi
        
        log_success "Dependencies installed successfully"
    else
        log_success "Dependencies already installed"
    fi
    
    # Verify critical dependencies for MCP server
    log_info "Verifying critical dependencies..."
    
    if [ ! -d "node_modules/@types/node" ]; then
        log_warning "@types/node not found - installing..."
        pnpm install @types/node || {
            log_error "Failed to install @types/node"
            return 1
        }
        log_success "@types/node installed"
    else
        log_success "@types/node is available"
    fi
    
    # Quick functionality test
    log_info "Testing dependency functionality..."
    
    # Test TypeScript compiler
    if ! npx tsc --version >/dev/null 2>&1; then
        log_error "TypeScript compiler not working after dependency installation"
        return 1
    fi
    
    # Test Node.js types availability
    if ! node -e "const fs = require('fs'); console.log('Node.js runtime test passed');" >/dev/null 2>&1; then
        log_error "Node.js runtime test failed"
        return 1
    fi
    
    log_success "All dependencies are properly installed and functional"
    return 0
}

# Main execution
main() {
    log_info "Starting dependency check and installation..."
    
    if ensure_dependencies; then
        log_success "Dependency check completed successfully"
        exit 0
    else
        log_error "Dependency check failed"
        exit 1
    fi
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi