#!/bin/bash
# MCP Server Build Environment Validation Script
# Validates specific requirements for building the MCP (Model Context Protocol) server
# Part of the enterprise CI/CD pipeline for the Ectropy platform

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logging functions (consistent with enterprise validation scripts)
log_info() { echo "🔍 $1"; }
log_success() { echo "✅ $1"; }
log_error() { echo "❌ $1" >&2; }
log_warning() { echo "⚠️ $1" >&2; }

# Validate MCP server project structure
validate_mcp_project_structure() {
    log_info "Validating MCP server project structure..."
    
    cd "$PROJECT_ROOT"
    
    # Check MCP server project configuration
    if [ ! -f "apps/mcp-server/project.json" ]; then
        log_error "MCP server project configuration not found: apps/mcp-server/project.json"
        return 1
    fi
    
    # Check main server source file
    if [ ! -f "apps/mcp-server/src/server.ts" ]; then
        log_error "MCP server main source file not found: apps/mcp-server/src/server.ts"
        return 1
    fi
    
    # Check TypeScript configuration
    if [ ! -f "apps/mcp-server/tsconfig.json" ]; then
        log_error "MCP server TypeScript configuration not found: apps/mcp-server/tsconfig.json"
        return 1
    fi
    
    # Check Jest configuration for tests
    if [ ! -f "apps/mcp-server/jest.config.js" ]; then
        log_warning "MCP server Jest configuration not found (tests may not run correctly)"
    fi
    
    log_success "MCP server project structure is valid"
}

# Validate MCP build targets in Nx configuration
validate_mcp_build_targets() {
    log_info "Validating MCP server build targets..."
    
    cd "$PROJECT_ROOT"
    
    # Check if mcp-server build target exists
    if ! grep -q '"build":' "apps/mcp-server/project.json"; then
        log_error "MCP server missing build target in project.json"
        return 1
    fi
    
    # Check if mcp-server has test target
    if ! grep -q '"test":' "apps/mcp-server/project.json"; then
        log_error "MCP server missing test target in project.json"
        return 1
    fi
    
    # Check if test target has passWithNoTests
    if ! grep -q '"passWithNoTests": true' "apps/mcp-server/project.json"; then
        log_warning "MCP server test target may fail if no tests exist"
    fi
    
    # Check if mcp-server has type-check target
    if ! grep -q '"type-check":' "apps/mcp-server/project.json"; then
        log_warning "MCP server missing type-check target (type checking may not work optimally)"
    fi
    
    log_success "MCP server build targets are configured correctly"
}

# Validate Node.js and TypeScript environment for MCP server
validate_mcp_build_environment() {
    log_info "Validating MCP server build environment..."
    
    # Check Node.js version (already validated in workflow, but reinforce here)
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js runtime not available for MCP server build"
        return 1
    fi
    
    local node_version
    node_version=$(node --version)
    
    # Ensure Node.js 20 for MCP server compatibility
    if [[ "$node_version" != v20* ]]; then
        log_error "MCP server requires Node.js 20.x, got: $node_version"
        return 1
    fi
    
    # Check TypeScript compiler availability
    if ! command -v npx >/dev/null 2>&1; then
        log_error "npx not available for TypeScript compilation"
        return 1
    fi
    
    # Validate TypeScript configuration can be parsed
    cd "$PROJECT_ROOT"
    if ! npx tsc --showConfig --project apps/mcp-server/tsconfig.json >/dev/null 2>&1; then
        log_error "MCP server TypeScript configuration is invalid"
        return 1
    fi
    
    log_success "MCP server build environment is ready"
}

# Validate MCP server dependencies and package manager
validate_mcp_dependencies() {
    log_info "Validating MCP server dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Check if pnpm is available (critical for dependency management)
    if ! command -v pnpm >/dev/null 2>&1; then
        log_error "pnpm not available for MCP server dependency management"
        log_error "MCP server requires pnpm for proper workspace dependency resolution"
        return 1
    fi
    
    local pnpm_version
    pnpm_version=$(pnpm --version)
    log_info "Using pnpm version: $pnpm_version"
    
    # Check workspace configuration
    if [ ! -f "pnpm-workspace.yaml" ]; then
        log_error "pnpm workspace configuration not found"
        return 1
    fi
    
    # Validate that MCP server is included in workspace
    if ! grep -q "apps/\*\|apps/mcp-server" pnpm-workspace.yaml; then
        log_warning "MCP server may not be included in pnpm workspace configuration"
    else
        log_success "MCP server is included in pnpm workspace configuration"
    fi
    
    log_success "MCP server dependencies and package manager validated"
}

# Validate MCP server can be built (syntax check only, no full build)
validate_mcp_buildability() {
    log_info "Validating MCP server buildability (syntax check)..."
    
    cd "$PROJECT_ROOT"
    
    # Enhanced dependency check with better error messaging
    if [ ! -d "node_modules" ]; then
        log_error "Dependencies not installed - TypeScript compilation will fail"
        log_error "This indicates a CI environment issue, not a source code problem"
        log_error "Expected: Dependencies should be installed before MCP validation"
        log_error "Solution: Ensure 'pnpm install' runs successfully before this validation"
        log_error ""
        log_error "To reproduce this issue locally:"
        log_error "  1. rm -rf node_modules"
        log_error "  2. Run this validation script"
        log_error ""
        log_error "To fix this issue locally:"
        log_error "  1. pnpm install"
        log_error "  2. Run this validation script again"
        return 1
    fi
    
    # Check if @types/node is available (common cause of TypeScript errors)
    if [ ! -d "node_modules/@types/node" ]; then
        log_error "@types/node package not found in node_modules"
        log_error "This indicates incomplete dependency installation"
        log_error "Common causes:"
        log_error "  - Interrupted 'pnpm install' process"
        log_error "  - Corrupted package cache" 
        log_error "  - Missing @types/node in package.json dependencies"
        log_error ""
        log_error "Recommended fixes:"
        log_error "  1. pnpm install --force"
        log_error "  2. Check that @types/node is listed in package.json devDependencies"
        return 1
    fi
    
    # Basic TypeScript syntax check with enhanced error reporting
    log_info "Running TypeScript syntax check..."
    if ! npx tsc --noEmit --project apps/mcp-server/tsconfig.json 2>/tmp/tsc-error.log; then
        log_error "MCP server TypeScript compilation failed"
        log_error "This could indicate either:"
        log_error "  1. Missing dependencies (most common in CI)"
        log_error "  2. TypeScript syntax errors in source code"
        log_error "  3. Invalid TypeScript configuration"
        log_error ""
        log_error "TypeScript error details:"
        if [ -f "/tmp/tsc-error.log" ]; then
            while IFS= read -r line; do
                log_error "  $line"
            done < /tmp/tsc-error.log
        fi
        log_error ""
        log_error "If the error mentions 'Cannot find type definition file for 'node'':"
        log_error "  -> This is a missing dependencies issue (not source code)"
        log_error "  -> Run 'pnpm install' to fix"
        log_error ""
        log_error "If the error mentions source file issues:"
        log_error "  -> Check that apps/mcp-server/src/server.ts exists"
        log_error "  -> Check TypeScript syntax in the source files"
        log_error ""
        return 1
    fi
    log_success "MCP server TypeScript syntax check passed"
    
    # Check if Nx can resolve the MCP server project (works without node_modules)
    if command -v npx >/dev/null 2>&1; then
        if ! npx nx show project mcp-server >/dev/null 2>&1; then
            log_warning "Nx cannot resolve MCP server project (may require dependencies)"
        else
            log_success "Nx can resolve MCP server project"
        fi
    fi
    
    log_success "MCP server passes buildability checks"
}

# Validate MCP server environment variables and configuration
validate_mcp_configuration() {
    log_info "Validating MCP server configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Check if MCP server has environment configuration
    if [ -f "apps/mcp-server/.env" ]; then
        log_info "MCP server environment configuration found"
        
        # Basic validation that .env file is readable
        if [ ! -r "apps/mcp-server/.env" ]; then
            log_error "MCP server .env file is not readable"
            return 1
        fi
    else
        log_info "No MCP server .env file found (may use defaults or environment variables)"
    fi
    
    # Check for any MCP-specific configuration requirements
    # This could be expanded based on actual MCP server requirements
    
    log_success "MCP server configuration validated"
}

# Main validation function
main() {
    log_info "Starting MCP server build environment validation..."
    log_info "Project root: $PROJECT_ROOT"
    
    validate_mcp_project_structure
    validate_mcp_build_targets
    validate_mcp_build_environment
    validate_mcp_dependencies
    validate_mcp_buildability
    validate_mcp_configuration
    
    log_success "All MCP server build environment validations passed!"
    log_info "MCP server is ready for build and deployment processes"
}

# Execute main function
main "$@"