#!/bin/bash
################################################################################
# COMPREHENSIVE OAUTH VALIDATION SCRIPT
# Validates OAuth fix deployment on staging.ectropy.ai
#
# Usage: ./comprehensive-oauth-validation.sh
#
# Validates:
#   1. API Gateway health and routing
#   2. MCP Server health and routing
#   3. OAuth callback routes (Google and GitHub)
#   4. Security headers
#   5. Response times
#
# Created: 2025-12-09 (OAuth path fix validation)
################################################################################

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STAGING_URL="https://staging.ectropy.ai"
TIMEOUT=10
TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS_COUNT++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL_COUNT++))
}

start_test() {
    ((TEST_COUNT++))
    log_test "$TEST_COUNT. $1"
}

# Test functions
test_api_gateway_health() {
    start_test "API Gateway Health Endpoint"

    local response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$STAGING_URL/api/health" --max-time $TIMEOUT)
    local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    local body=$(echo "$response" | grep -v "HTTP_CODE:")

    if [ "$http_code" == "200" ]; then
        log_pass "API Gateway is healthy (HTTP $http_code)"
        echo "   Response: ${body:0:100}"
        return 0
    else
        log_fail "API Gateway unhealthy (HTTP $http_code)"
        echo "   Response: ${body:0:100}"
        return 1
    fi
}

test_mcp_server_health() {
    start_test "MCP Server Health Endpoint"

    local response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$STAGING_URL/api/mcp/health" --max-time $TIMEOUT)
    local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    local body=$(echo "$response" | grep -v "HTTP_CODE:")

    if [ "$http_code" == "200" ]; then
        log_pass "MCP Server is healthy (HTTP $http_code)"
        echo "   Response: ${body:0:100}"
        return 0
    else
        log_fail "MCP Server unhealthy (HTTP $http_code)"
        echo "   Response: ${body:0:100}"
        return 1
    fi
}

test_google_oauth_callback() {
    start_test "Google OAuth Callback Route (P0 CRITICAL FIX)"

    # Test /api/auth/google/callback (FIXED path)
    local response=$(curl -sI "$STAGING_URL/api/auth/google/callback" --max-time $TIMEOUT)
    local http_code=$(echo "$response" | grep "HTTP/" | awk '{print $2}')

    # Expected: NOT 404 (route should exist)
    # Acceptable: 302 (redirect), 400 (missing code), 401 (unauthorized)
    if [ "$http_code" != "404" ] && [ "$http_code" != "502" ]; then
        log_pass "Google OAuth callback route exists (HTTP $http_code)"
        echo "   This validates the OAuth path fix is deployed"
        return 0
    elif [ "$http_code" == "404" ]; then
        log_fail "Google OAuth callback route NOT FOUND (HTTP 404)"
        echo "   OAuth path fix may not be deployed"
        return 1
    else
        log_warn "Google OAuth callback route unreachable (HTTP $http_code)"
        echo "   Service may still be starting"
        return 1
    fi
}

test_github_oauth_callback() {
    start_test "GitHub OAuth Callback Route"

    local response=$(curl -sI "$STAGING_URL/api/auth/github/callback" --max-time $TIMEOUT)
    local http_code=$(echo "$response" | grep "HTTP/" | awk '{print $2}')

    if [ "$http_code" != "404" ] && [ "$http_code" != "502" ]; then
        log_pass "GitHub OAuth callback route exists (HTTP $http_code)"
        return 0
    elif [ "$http_code" == "404" ]; then
        log_fail "GitHub OAuth callback route NOT FOUND (HTTP 404)"
        return 1
    else
        log_warn "GitHub OAuth callback route unreachable (HTTP $http_code)"
        return 1
    fi
}

test_security_headers() {
    start_test "Security Headers Configuration"

    local response=$(curl -sI "$STAGING_URL" --max-time $TIMEOUT)

    local has_csp=$(echo "$response" | grep -i "content-security-policy" || echo "")
    local has_xframe=$(echo "$response" | grep -i "x-frame-options" || echo "")
    local has_nosniff=$(echo "$response" | grep -i "x-content-type-options: nosniff" || echo "")
    local has_xss=$(echo "$response" | grep -i "x-xss-protection" || echo "")

    local header_count=0
    [ -n "$has_csp" ] && ((header_count++)) && echo "   ✓ Content-Security-Policy present"
    [ -n "$has_xframe" ] && ((header_count++)) && echo "   ✓ X-Frame-Options present"
    [ -n "$has_nosniff" ] && ((header_count++)) && echo "   ✓ X-Content-Type-Options: nosniff present"
    [ -n "$has_xss" ] && ((header_count++)) && echo "   ✓ X-XSS-Protection present"

    if [ $header_count -ge 3 ]; then
        log_pass "Security headers configured ($header_count/4 headers found)"
        return 0
    else
        log_warn "Insufficient security headers ($header_count/4 headers found)"
        return 1
    fi
}

test_response_times() {
    start_test "Response Time Performance"

    local start_time=$(date +%s%N)
    curl -s "$STAGING_URL/api/health" --max-time $TIMEOUT > /dev/null
    local end_time=$(date +%s%N)

    local elapsed_ms=$(( (end_time - start_time) / 1000000 ))

    echo "   Response time: ${elapsed_ms}ms"

    if [ $elapsed_ms -lt 1000 ]; then
        log_pass "Excellent response time (< 1s)"
        return 0
    elif [ $elapsed_ms -lt 3000 ]; then
        log_pass "Good response time (< 3s)"
        return 0
    elif [ $elapsed_ms -lt 5000 ]; then
        log_warn "Acceptable response time (< 5s)"
        return 1
    else
        log_fail "Poor response time (>= 5s)"
        return 1
    fi
}

test_landing_page() {
    start_test "Landing Page Accessibility"

    local response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$STAGING_URL" --max-time $TIMEOUT)
    local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)

    if [ "$http_code" == "200" ]; then
        log_pass "Landing page accessible (HTTP $http_code)"
        return 0
    else
        log_fail "Landing page not accessible (HTTP $http_code)"
        return 1
    fi
}

test_oauth_simulation() {
    start_test "OAuth Flow Simulation (callback with mock parameters)"

    # Simulate OAuth callback with parameters that previously triggered the bug
    # These parameters contain "/" and "--" which triggered SQL injection patterns
    local mock_state="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    local mock_code="4/0ATX87lM-fake--mock-code-wnNDUKrwbWQ"

    local callback_url="$STAGING_URL/api/auth/google/callback?state=$mock_state&code=$mock_code"
    local response=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$callback_url" --max-time $TIMEOUT)
    local http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    local body=$(echo "$response" | grep -v "HTTP_CODE:")

    # Check if we get "Security violation" error (the bug we fixed)
    if echo "$body" | grep -q "Security violation" || echo "$body" | grep -q "Malicious input detected"; then
        log_fail "OAuth callback blocked by security middleware (BUG NOT FIXED)"
        echo "   Error: OAuth parameters still triggering injection protection"
        echo "   Response: ${body:0:200}"
        return 1
    elif [ "$http_code" == "400" ] || [ "$http_code" == "401" ] || [ "$http_code" == "302" ]; then
        log_pass "OAuth callback processed by auth handler (NOT blocked by security middleware)"
        echo "   HTTP $http_code indicates auth validation (expected with mock parameters)"
        echo "   OAuth path fix is working correctly"
        return 0
    else
        log_warn "Unexpected OAuth callback response (HTTP $http_code)"
        echo "   Response: ${body:0:200}"
        return 1
    fi
}

# Main execution
main() {
    echo ""
    log_info "========================================================"
    log_info "COMPREHENSIVE OAUTH VALIDATION - STAGING ENVIRONMENT"
    log_info "Target: $STAGING_URL"
    log_info "Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    log_info "========================================================"
    echo ""

    # Wait for services to be ready
    log_info "Checking service availability..."
    local max_wait=60
    local elapsed=0

    while [ $elapsed -lt $max_wait ]; do
        if curl -s "$STAGING_URL/api/health" --max-time 5 > /dev/null 2>&1; then
            log_info "Services are ready!"
            break
        fi
        echo "   Waiting for services to start... ($elapsed/$max_wait seconds)"
        sleep 5
        ((elapsed+=5))
    done

    if [ $elapsed -ge $max_wait ]; then
        log_error "Services did not become ready within $max_wait seconds"
        exit 1
    fi

    echo ""
    log_info "Running validation tests..."
    echo ""

    # Run all tests (don't exit on failure, collect results)
    test_landing_page || true
    test_api_gateway_health || true
    test_mcp_server_health || true
    test_google_oauth_callback || true
    test_github_oauth_callback || true
    test_oauth_simulation || true
    test_security_headers || true
    test_response_times || true

    # Summary
    echo ""
    log_info "========================================================"
    log_info "VALIDATION SUMMARY"
    log_info "========================================================"
    log_info "Total Tests:  $TEST_COUNT"
    log_info "Passed:       $PASS_COUNT"
    log_info "Failed:       $FAIL_COUNT"

    local pass_rate=$((PASS_COUNT * 100 / TEST_COUNT))
    echo ""

    if [ $FAIL_COUNT -eq 0 ]; then
        log_info "✅ ALL TESTS PASSED - OAuth fix validated successfully"
        log_info "Pass Rate: 100%"
        exit 0
    elif [ $pass_rate -ge 75 ]; then
        log_warn "⚠️ PARTIAL SUCCESS - Most tests passed ($pass_rate%)"
        log_warn "Review failures above for issues"
        exit 0
    else
        log_error "❌ VALIDATION FAILED - Multiple tests failed ($pass_rate% pass rate)"
        log_error "OAuth fix may not be deployed correctly"
        exit 1
    fi
}

# Run main function
main
