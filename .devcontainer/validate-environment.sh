#!/bin/bash
# .devcontainer/validate-environment.sh
# Comprehensive validation script for dev container health

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Validation counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

validate_check() {
    local name="$1"
    local command="$2"
    local expected_pattern="${3:-}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_info "Validating: $name"
    
    if eval "$command" >/dev/null 2>&1; then
        if [[ -n "$expected_pattern" ]]; then
            local output
            output=$(eval "$command" 2>/dev/null || echo "")
            if [[ "$output" =~ $expected_pattern ]]; then
                log_success "$name: ✓ ($output)"
                PASSED_CHECKS=$((PASSED_CHECKS + 1))
                return 0
            else
                log_warning "$name: Unexpected output ($output)"
                WARNING_CHECKS=$((WARNING_CHECKS + 1))
                return 1
            fi
        else
            log_success "$name: ✓"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            return 0
        fi
    else
        log_error "$name: ✗"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

validate_file() {
    local name="$1"
    local file_path="$2"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_info "Validating file: $name"
    
    if [[ -f "$file_path" ]]; then
        log_success "$name: ✓ (exists)"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        log_error "$name: ✗ (missing: $file_path)"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        return 1
    fi
}

validate_service() {
    local name="$1"
    local host="$2"
    local port="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_info "Validating service: $name"
    
    if command -v nc >/dev/null 2>&1; then
        if nc -z "$host" "$port" 2>/dev/null; then
            log_success "$name: ✓ (reachable at $host:$port)"
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
            return 0
        else
            log_warning "$name: ⚠ (not reachable at $host:$port - may not be started yet)"
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
            return 1
        fi
    else
        log_warning "$name: ⚠ (nc not available for testing)"
        WARNING_CHECKS=$((WARNING_CHECKS + 1))
        return 1
    fi
}

log_info "🔍 Starting comprehensive dev container validation..."
echo

# Core system validation
log_info "=== Core System ==="
validate_check "Node.js" "node --version" "v20"
validate_check "npm" "npm --version"
validate_check "npx" "npx --version"

# Try to validate pnpm, install if missing
if ! validate_check "pnpm" "pnpm --version" "10\."; then
    log_info "Attempting to install pnpm..."
    npm install -g pnpm@10.11.0 >/dev/null 2>&1 || true
    validate_check "pnpm (retry)" "pnpm --version" "10\."
fi

validate_check "TypeScript" "tsc --version"
validate_check "Git" "git --version"
echo

# File system validation
log_info "=== File System ==="
WORKSPACE_ROOT="${WORKSPACE:-/workspace}"
if [[ ! -d "$WORKSPACE_ROOT" ]]; then
    WORKSPACE_ROOT="$(pwd)"
fi

validate_file "package.json" "$WORKSPACE_ROOT/package.json"
validate_file "tsconfig.json" "$WORKSPACE_ROOT/tsconfig.json"
validate_file ".env.dev" "$WORKSPACE_ROOT/.devcontainer/.env.dev"
validate_file "docker-compose.yml" "$WORKSPACE_ROOT/.devcontainer/docker-compose.yml"
validate_file "Dockerfile.dev" "$WORKSPACE_ROOT/.devcontainer/Dockerfile.dev"
echo

# Environment validation
log_info "=== Environment ==="
export NODE_ENV=${NODE_ENV:-development}
validate_check "NODE_ENV" "echo \$NODE_ENV"
validate_check "PNPM_HOME" "echo \${PNPM_HOME:-/usr/local/share/pnpm}"
validate_check "Workspace permissions" "test -w \"$WORKSPACE_ROOT\""
echo

# Service validation (optional - may not be running)
log_info "=== Services (optional) ==="
validate_service "PostgreSQL" "postgres" "5432"
validate_service "Redis" "redis" "6379"
echo

# Generate report
log_info "=== Validation Summary ==="
echo "Total checks: $TOTAL_CHECKS"
echo "Passed: $PASSED_CHECKS"
echo "Warnings: $WARNING_CHECKS" 
echo "Failed: $FAILED_CHECKS"
echo

if [[ $FAILED_CHECKS -eq 0 ]]; then
    if [[ $WARNING_CHECKS -eq 0 ]]; then
        log_success "🎉 All validations passed! Environment is fully ready."
        exit 0
    else
        log_warning "⚠️  Environment is mostly ready but has $WARNING_CHECKS warnings."
        exit 0
    fi
else
    log_error "❌ Environment has $FAILED_CHECKS critical issues that need attention."
    exit 1
fi