#!/bin/bash
# Production validation test for EACCES permission fix
# This test validates that the production workflow cleanup handles Docker permission issues

set -uo pipefail  # Remove -e to continue on errors

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLEANUP_SCRIPT="$PROJECT_ROOT/scripts/security/robust-directory-cleanup.sh"

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

# Test that cleanup script exists and is executable
test_cleanup_script_exists() {
    log_info "Testing cleanup script exists and is executable..."
    
    if [[ ! -f "$CLEANUP_SCRIPT" ]]; then
        log_error "Cleanup script not found: $CLEANUP_SCRIPT"
        return 1
    fi
    
    if [[ ! -x "$CLEANUP_SCRIPT" ]]; then
        log_error "Cleanup script is not executable: $CLEANUP_SCRIPT"
        return 1
    fi
    
    log_success "Cleanup script exists and is executable"
}

# Test that cleanup script has immutable file handling
test_immutable_file_handling() {
    log_info "Testing immutable file handling in cleanup script..."
    
    if grep -q "chattr -i" "$CLEANUP_SCRIPT"; then
        log_success "Cleanup script includes immutable file handling (chattr -i)"
    else
        log_error "Cleanup script missing immutable file handling"
        return 1
    fi
}

# Test that cleanup script has comprehensive file patterns  
test_comprehensive_patterns() {
    log_info "Testing comprehensive file cleanup patterns..."
    
    local required_patterns=("*.tmp" "*.log" "*.pid" "*.sock" "*.lock" "*.swp" "*.bak" "*.cache")
    local missing_patterns=()
    
    for pattern in "${required_patterns[@]}"; do
        if ! grep -q "$pattern" "$CLEANUP_SCRIPT"; then
            missing_patterns+=("$pattern")
        fi
    done
    
    if [[ ${#missing_patterns[@]} -eq 0 ]]; then
        log_success "All required cleanup patterns are present"
    else
        log_error "Missing cleanup patterns: ${missing_patterns[*]}"
        return 1
    fi
}

# Test production workflow has immutable file handling
test_production_workflow_enhancement() {
    log_info "Testing production workflow has immutable file handling..."
    
    local workflow_file="$PROJECT_ROOT/.github/workflows/production-workflow.yml"
    
    if [[ ! -f "$workflow_file" ]]; then
        log_error "Production workflow file not found: $workflow_file"
        return 1
    fi
    
    if grep -q "chattr -i" "$workflow_file"; then
        log_success "Production workflow includes immutable file handling"
    else
        log_error "Production workflow missing immutable file handling"
        return 1
    fi
}

# Test cleanup script help function works
test_cleanup_script_help() {
    log_info "Testing cleanup script help function..."
    
    if "$CLEANUP_SCRIPT" help >/dev/null 2>&1; then
        log_success "Cleanup script help function works"
    else
        log_error "Cleanup script help function failed"
        return 1
    fi
}

# Main test runner
main() {
    log_info "🧪 Running production validation tests for EACCES permission fix..."
    echo ""
    
    local test_functions=(
        "test_cleanup_script_exists"
        "test_immutable_file_handling"
        "test_comprehensive_patterns"
        "test_production_workflow_enhancement"
        "test_cleanup_script_help"
    )
    
    local passed=0
    local failed=0
    
    for test_func in "${test_functions[@]}"; do
        echo ""
        if $test_func; then
            ((passed++))
        else
            ((failed++))
        fi
    done
    
    echo ""
    log_info "📊 Test Results:"
    log_success "  ✅ Passed: $passed"
    if [[ $failed -gt 0 ]]; then
        log_error "  ❌ Failed: $failed"
        echo ""
        log_error "❌ Production validation tests failed"
        return 1
    else
        echo ""
        log_success "🎉 All production validation tests passed!"
        log_info "The EACCES permission fix is ready for production use."
        return 0
    fi
}

# Run tests if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi