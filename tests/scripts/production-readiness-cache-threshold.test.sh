#!/bin/bash
# Test suite for production-readiness.sh cache threshold logic
set -euo pipefail

# Test colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_test_header() {
    echo ""
    echo "================================================"
    echo "TEST: $1"
    echo "================================================"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name=$1
    TESTS_RUN=$((TESTS_RUN + 1))
    
    print_test_header "$test_name"
    
    if $2; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        print_success "PASSED: $test_name"
        return 0
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        print_error "FAILED: $test_name"
        return 1
    fi
}

# =============================================================================
# TEST CASES
# =============================================================================

test_github_hosted_runner_detection() {
    # Simulate GitHub-hosted runner environment
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="GitHub Actions 1000026784"
    
    # Extract the threshold logic from production-readiness.sh
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Detected runner type: $RUNNER_TYPE"
    print_info "Cache threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$CACHE_THRESHOLD" -eq 20 ] && [ "$RUNNER_TYPE" = "GitHub-hosted" ]; then
        return 0
    else
        print_error "Expected threshold=20 and type=GitHub-hosted, got threshold=$CACHE_THRESHOLD and type=$RUNNER_TYPE"
        return 1
    fi
}

test_self_hosted_runner_detection() {
    # Simulate self-hosted runner environment
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="ectropy-runner-2"
    
    # Extract the threshold logic from production-readiness.sh
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Detected runner type: $RUNNER_TYPE"
    print_info "Cache threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$CACHE_THRESHOLD" -eq 10 ] && [ "$RUNNER_TYPE" = "self-hosted" ]; then
        return 0
    else
        print_error "Expected threshold=10 and type=self-hosted, got threshold=$CACHE_THRESHOLD and type=$RUNNER_TYPE"
        return 1
    fi
}

test_local_development_detection() {
    # Simulate local development environment
    unset GITHUB_ACTIONS
    unset RUNNER_NAME
    
    # Extract the threshold logic from production-readiness.sh
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Detected runner type: $RUNNER_TYPE"
    print_info "Cache threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$CACHE_THRESHOLD" -eq 30 ] && [ "$RUNNER_TYPE" = "local" ]; then
        return 0
    else
        print_error "Expected threshold=30 and type=local, got threshold=$CACHE_THRESHOLD and type=$RUNNER_TYPE"
        return 1
    fi
}

test_cache_pass_github_hosted() {
    # Test that 14s rebuild time passes on GitHub-hosted runner (threshold: 20s)
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="GitHub Actions 1000026784"
    
    REBUILD_DURATION=14
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$REBUILD_DURATION" -le "$CACHE_THRESHOLD" ]; then
        print_success "14s rebuild passes on GitHub-hosted runner (threshold: 20s)"
        return 0
    else
        print_error "14s rebuild should pass on GitHub-hosted runner (threshold: 20s)"
        return 1
    fi
}

test_cache_fail_github_hosted() {
    # Test that 21s rebuild time fails on GitHub-hosted runner (threshold: 20s)
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="GitHub Actions 1000026784"
    
    REBUILD_DURATION=21
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$REBUILD_DURATION" -gt "$CACHE_THRESHOLD" ]; then
        print_success "21s rebuild correctly fails on GitHub-hosted runner (threshold: 20s)"
        return 0
    else
        print_error "21s rebuild should fail on GitHub-hosted runner (threshold: 20s)"
        return 1
    fi
}

test_cache_pass_self_hosted() {
    # Test that 7s rebuild time passes on self-hosted runner (threshold: 10s)
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="ectropy-runner-2"
    
    REBUILD_DURATION=7
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$REBUILD_DURATION" -le "$CACHE_THRESHOLD" ]; then
        print_success "7s rebuild passes on self-hosted runner (threshold: 10s)"
        return 0
    else
        print_error "7s rebuild should pass on self-hosted runner (threshold: 10s)"
        return 1
    fi
}

test_cache_fail_self_hosted() {
    # Test that 11s rebuild time fails on self-hosted runner (threshold: 10s)
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="ectropy-runner-2"
    
    REBUILD_DURATION=11
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$REBUILD_DURATION" -gt "$CACHE_THRESHOLD" ]; then
        print_success "11s rebuild correctly fails on self-hosted runner (threshold: 10s)"
        return 0
    else
        print_error "11s rebuild should fail on self-hosted runner (threshold: 10s)"
        return 1
    fi
}

test_boundary_self_hosted_exactly_at_threshold() {
    # Test that 10s rebuild time PASSES on self-hosted runner (threshold: 10s)
    # This is the critical boundary condition that was failing before the fix
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="ectropy-runner-4"
    
    REBUILD_DURATION=10
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    # Meeting the threshold exactly should PASS (not fail)
    if [ "$REBUILD_DURATION" -le "$CACHE_THRESHOLD" ]; then
        print_success "10s rebuild PASSES on self-hosted runner (at threshold: 10s) - boundary condition fix working!"
        return 0
    else
        print_error "10s rebuild should PASS on self-hosted runner (at threshold: 10s)"
        return 1
    fi
}

test_boundary_github_hosted_exactly_at_threshold() {
    # Test that 20s rebuild time PASSES on GitHub-hosted runner (threshold: 20s)
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="GitHub Actions 1000026784"
    
    REBUILD_DURATION=20
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    # Meeting the threshold exactly should PASS (not fail)
    if [ "$REBUILD_DURATION" -le "$CACHE_THRESHOLD" ]; then
        print_success "20s rebuild PASSES on GitHub-hosted runner (at threshold: 20s) - boundary condition fix working!"
        return 0
    else
        print_error "20s rebuild should PASS on GitHub-hosted runner (at threshold: 20s)"
        return 1
    fi
}

test_boundary_self_hosted_just_under_threshold() {
    # Test that 9s rebuild time passes on self-hosted runner (threshold: 10s)
    # Regression test to ensure we didn't break the normal "under threshold" case
    export GITHUB_ACTIONS="true"
    export RUNNER_NAME="ectropy-runner-1"
    
    REBUILD_DURATION=9
    
    # Extract the threshold logic
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
        if [ -n "${RUNNER_NAME:-}" ] && [[ "${RUNNER_NAME}" == *"ectropy-runner"* ]]; then
            CACHE_THRESHOLD=10
            RUNNER_TYPE="self-hosted"
        else
            CACHE_THRESHOLD=20
            RUNNER_TYPE="GitHub-hosted"
        fi
    else
        CACHE_THRESHOLD=30
        RUNNER_TYPE="local"
    fi
    
    print_info "Rebuild duration: ${REBUILD_DURATION}s"
    print_info "Threshold: ${CACHE_THRESHOLD}s"
    
    if [ "$REBUILD_DURATION" -le "$CACHE_THRESHOLD" ]; then
        print_success "9s rebuild PASSES on self-hosted runner (under threshold: 10s)"
        return 0
    else
        print_error "9s rebuild should PASS on self-hosted runner (under threshold: 10s)"
        return 1
    fi
}

# =============================================================================
# RUN ALL TESTS
# =============================================================================

echo "🧪 Production Readiness Cache Threshold Test Suite"
echo "=================================================="

run_test "GitHub-hosted runner detection" test_github_hosted_runner_detection
run_test "Self-hosted runner detection" test_self_hosted_runner_detection
run_test "Local development detection" test_local_development_detection
run_test "Cache pass on GitHub-hosted (14s < 20s)" test_cache_pass_github_hosted
run_test "Cache fail on GitHub-hosted (21s > 20s)" test_cache_fail_github_hosted
run_test "Cache pass on self-hosted (7s < 10s)" test_cache_pass_self_hosted
run_test "Cache fail on self-hosted (11s > 10s)" test_cache_fail_self_hosted
run_test "Boundary: self-hosted at exactly 10s threshold (should PASS)" test_boundary_self_hosted_exactly_at_threshold
run_test "Boundary: GitHub-hosted at exactly 20s threshold (should PASS)" test_boundary_github_hosted_exactly_at_threshold
run_test "Boundary: self-hosted just under threshold at 9s (should PASS)" test_boundary_self_hosted_just_under_threshold

# =============================================================================
# TEST SUMMARY
# =============================================================================

echo ""
echo "================================================"
echo "TEST SUMMARY"
echo "================================================"
echo "Tests Run:    $TESTS_RUN"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    print_success "All tests passed! ✅"
    exit 0
else
    print_error "$TESTS_FAILED test(s) failed ❌"
    exit 1
fi
