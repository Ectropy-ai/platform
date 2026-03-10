#!/bin/bash
# MCP Server Build Troubleshooting Script
# Helps diagnose and resolve common MCP server build issues in CI/CD environments
# Can be run locally to simulate CI conditions and identify problems

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logging functions
log_info() { echo "🔍 $1"; }
log_success() { echo "✅ $1"; }
log_error() { echo "❌ $1" >&2; }
log_warning() { echo "⚠️ $1" >&2; }

# Check system resources
check_system_resources() {
    log_info "Checking system resources..."
    
    echo "💾 Memory:"
    free -h 2>/dev/null || echo "  Memory info not available"
    
    echo "💽 Disk space:"
    df -h . 2>/dev/null || echo "  Disk info not available"
    
    echo "🖥️  CPU info:"
    nproc 2>/dev/null || echo "  CPU info not available"
    
    log_success "System resources checked"
}

# Simulate CI environment
simulate_ci_environment() {
    log_info "Simulating CI environment conditions..."
    
    cd "$PROJECT_ROOT"
    
    # Set CI-like environment variables
    export CI=true
    export NODE_ENV=test
    export NX_CLOUD_DISTRIBUTED_EXECUTION=false
    export NX_SKIP_NX_CACHE=true
    
    log_info "Set CI environment variables"
    log_success "CI environment simulation ready"
}

# Clean workspace
clean_workspace() {
    log_info "Cleaning workspace..."
    
    cd "$PROJECT_ROOT"
    
    # Remove build artifacts
    rm -rf dist/
    rm -rf .nx/cache/
    rm -rf node_modules/.cache/
    
    # Clear any local caches
    if command -v pnpm >/dev/null 2>&1; then
        pnpm store prune || log_warning "pnpm store prune failed"
    fi
    
    log_success "Workspace cleaned"
}

# Test build with verbose output
test_build_verbose() {
    log_info "Testing build with verbose output..."
    
    cd "$PROJECT_ROOT"
    
    # Run validation first
    ./scripts/ci/validate-mcp-build-environment.sh
    
    # Run build with detailed output
    echo "🔧 Starting verbose build..."
    set -x  # Enable command tracing
    npm run build:mcp-server:ci
    set +x  # Disable command tracing
    
    log_success "Verbose build test completed"
}

# Diagnose common issues
diagnose_common_issues() {
    log_info "Diagnosing common build issues..."
    
    cd "$PROJECT_ROOT"
    
    # Check for TypeScript issues
    echo "📝 TypeScript compilation test:"
    if npx tsc --noEmit --project apps/mcp-server/tsconfig.json; then
        log_success "TypeScript compilation OK"
    else
        log_error "TypeScript compilation failed"
        echo "Run 'npx tsc --noEmit --project apps/mcp-server/tsconfig.json' for details"
    fi
    
    # Check for missing dependencies
    echo "📦 Dependency check:"
    if [ -d "node_modules/@nx/js" ] && [ -d "node_modules/typescript" ]; then
        log_success "Core dependencies present"
    else
        log_error "Missing core dependencies"
        echo "Run 'pnpm install --frozen-lockfile' to install dependencies"
    fi
    
    # Check for Nx configuration issues
    echo "⚙️  Nx configuration check:"
    if pnpm nx show project mcp-server >/dev/null 2>&1; then
        log_success "Nx project configuration OK"
    else
        log_error "Nx project configuration issue"
        echo "Run 'pnpm nx show project mcp-server' for details"
    fi
    
    log_success "Common issues diagnosis completed"
}

# Generate troubleshooting report
generate_report() {
    log_info "Generating troubleshooting report..."
    
    local report_file="mcp-build-troubleshooting-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# MCP Server Build Troubleshooting Report

Generated: $(date)
Project: $(pwd)

## System Information

- Node.js: $(node --version 2>/dev/null || echo "Not available")
- pnpm: $(pnpm --version 2>/dev/null || echo "Not available")
- Operating System: $(uname -a 2>/dev/null || echo "Not available")

## Build Environment

- CI: ${CI:-false}
- NODE_ENV: ${NODE_ENV:-not set}
- PWD: $(pwd)

## Project Status

### Files Present
- apps/mcp-server/src/server.ts: $([ -f "apps/mcp-server/src/server.ts" ] && echo "✅" || echo "❌")
- apps/mcp-server/project.json: $([ -f "apps/mcp-server/project.json" ] && echo "✅" || echo "❌")
- package.json: $([ -f "package.json" ] && echo "✅" || echo "❌")
- nx.json: $([ -f "nx.json" ] && echo "✅" || echo "❌")

### Build Outputs
- dist/apps/mcp-server/: $([ -d "dist/apps/mcp-server" ] && echo "✅" || echo "❌")
- dist/apps/mcp-server/src/server.js: $([ -f "dist/apps/mcp-server/src/server.js" ] && echo "✅" || echo "❌")

### Dependencies
- node_modules/: $([ -d "node_modules" ] && echo "✅" || echo "❌")
- @nx/js: $([ -d "node_modules/@nx/js" ] && echo "✅" || echo "❌")
- typescript: $([ -d "node_modules/typescript" ] && echo "✅" || echo "❌")

## Recommended Actions

1. If dependencies are missing: \`pnpm install --frozen-lockfile\`
2. If TypeScript issues: \`npx tsc --noEmit --project apps/mcp-server/tsconfig.json\`
3. If Nx issues: \`pnpm nx show project mcp-server\`
4. For clean build: \`npm run build:mcp-server:ci\`
5. For environment validation: \`./scripts/ci/validate-mcp-build-environment.sh\`

## Contact

For additional support, refer to the repository documentation or open an issue.
EOF

    log_success "Troubleshooting report generated: $report_file"
}

# Main function
main() {
    echo "🚀 MCP Server Build Troubleshooting"
    echo "==================================="
    
    check_system_resources
    echo ""
    
    simulate_ci_environment
    echo ""
    
    clean_workspace
    echo ""
    
    diagnose_common_issues
    echo ""
    
    test_build_verbose
    echo ""
    
    generate_report
    echo ""
    
    log_success "Troubleshooting completed successfully!"
    echo ""
    echo "Summary:"
    echo "- System resources checked"
    echo "- CI environment simulated"
    echo "- Workspace cleaned"
    echo "- Common issues diagnosed"
    echo "- Build tested with verbose output"
    echo "- Troubleshooting report generated"
    echo ""
    echo "If issues persist, check the generated troubleshooting report."
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "MCP Server Build Troubleshooting Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --clean-only   Only clean workspace, don't run full troubleshooting"
        echo "  --check-only   Only run checks, don't clean or build"
        echo ""
        echo "This script helps diagnose and resolve MCP server build issues."
        echo "It simulates CI environment conditions and runs comprehensive tests."
        ;;
    --clean-only)
        clean_workspace
        ;;
    --check-only)
        check_system_resources
        diagnose_common_issues
        ;;
    *)
        main
        ;;
esac