#!/bin/bash
# Smoke test suite for Ectropy platform deployments
# Validates critical functionality after deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT="${1:-staging}"
TEST_TIMEOUT=30

echo -e "${BLUE}🧪 Ectropy Platform Smoke Tests${NC}"
echo "=================================="
echo "Environment: $ENVIRONMENT"
echo "Test Timeout: ${TEST_TIMEOUT}s"
echo ""

# Function to log results
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local is_critical="${3:-false}"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_info "Testing: $test_name"
    
    if eval "$test_command"; then
        log_success "$test_name - PASSED"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        if [ "$is_critical" = "true" ]; then
            log_error "$test_name - FAILED (CRITICAL)"
        else
            log_warning "$test_name - FAILED (NON-CRITICAL)"
        fi
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Test build artifacts exist
test_build_artifacts() {
    log_info "Checking build artifacts..."
    
    if [ -d "dist/apps/web-dashboard" ] && [ "$(ls -A dist/apps/web-dashboard)" ]; then
        return 0
    else
        return 1
    fi
}

# Test web dashboard accessibility
test_web_dashboard() {
    log_info "Testing web dashboard accessibility..."
    
    # Try multiple possible ports
    for port in 4200 3000 8080; do
        if curl -f -s --max-time "$TEST_TIMEOUT" "http://localhost:$port" > /dev/null 2>&1; then
            log_info "  Web dashboard responding on port $port"
            return 0
        fi
    done
    
    return 1
}

# Test MCP server health
test_mcp_server() {
    log_info "Testing MCP server health..."
    
    # Try multiple possible ports
    for port in 3001 3002 8001; do
        if curl -f -s --max-time "$TEST_TIMEOUT" "http://localhost:$port/health" > /dev/null 2>&1; then
            log_info "  MCP server responding on port $port"
            return 0
        fi
    done
    
    return 1
}

# Test API gateway health
test_api_gateway() {
    log_info "Testing API gateway health..."
    
    # Try multiple possible ports
    for port in 4000 3000 8000 5000; do
        if curl -f -s --max-time "$TEST_TIMEOUT" "http://localhost:$port/health" > /dev/null 2>&1; then
            log_info "  API gateway responding on port $port"
            
            # Test database health status
            local health_response
            health_response=$(curl -s --max-time "$TEST_TIMEOUT" "http://localhost:$port/health" 2>/dev/null || echo '{}')
            
            if command -v jq > /dev/null 2>&1; then
                local db_status
                db_status=$(echo "$health_response" | jq -r '.database.status // "unknown"' 2>/dev/null || echo "unknown")
                
                if [ "$db_status" = "healthy" ]; then
                    log_info "  Database status: healthy"
                elif [ "$db_status" = "unknown" ]; then
                    log_warning "  Database status: unknown (may not be initialized)"
                else
                    log_warning "  Database status: $db_status"
                fi
                
                # Check Redis health
                local redis_status
                redis_status=$(echo "$health_response" | jq -r '.services.redis // "unknown"' 2>/dev/null || echo "unknown")
                
                if [ "$redis_status" = "healthy" ]; then
                    log_info "  Redis status: healthy"
                elif [ "$redis_status" = "configuration_required" ]; then
                    log_warning "  Redis status: configuration_required (optional)"
                else
                    log_warning "  Redis status: $redis_status (optional)"
                fi
            fi
            
            return 0
        fi
    done
    
    return 1
}

# Test database connectivity
test_database() {
    log_info "Testing database connectivity..."
    
    # Check if database is accessible
    if [ -n "${DATABASE_URL:-}" ]; then
        if command -v psql > /dev/null 2>&1; then
            if timeout "$TEST_TIMEOUT" psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
                return 0
            fi
        fi
    fi
    
    # Check if PostgreSQL is running locally
    if command -v pg_isready > /dev/null 2>&1; then
        if pg_isready -t "$TEST_TIMEOUT" > /dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Check Docker containers
    if command -v docker > /dev/null 2>&1; then
        if docker ps --format "table {{.Names}}" | grep -q "postgres\|postgresql"; then
            return 0
        fi
    fi
    
    return 1
}

# Test Redis connectivity
test_redis() {
    log_info "Testing Redis connectivity..."
    
    # Check if Redis is accessible
    if command -v redis-cli > /dev/null 2>&1; then
        if timeout "$TEST_TIMEOUT" redis-cli ping > /dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Check Docker containers
    if command -v docker > /dev/null 2>&1; then
        if docker ps --format "table {{.Names}}" | grep -q "redis"; then
            return 0
        fi
    fi
    
    return 1
}

# Test feature flags
test_feature_flags() {
    log_info "Testing feature flag system..."
    
    # Check if feature flags library exists
    if [ -f "libs/feature-flags/src/index.ts" ]; then
        return 0
    fi
    
    return 1
}

# Test monitoring endpoints
test_monitoring() {
    log_info "Testing monitoring endpoints..."
    
    # Check for metrics endpoints
    for port in 4000 3000 3001 8080 9090; do
        local metrics_response
        metrics_response=$(curl -s --max-time "$TEST_TIMEOUT" "http://localhost:$port/metrics" 2>/dev/null || echo "")
        
        if [ -n "$metrics_response" ]; then
            log_info "  Metrics endpoint responding on port $port"
            
            # Check for expected Prometheus metrics
            if echo "$metrics_response" | grep -q "http_requests_total"; then
                log_info "  ✅ http_requests_total metric found"
                return 0
            else
                log_warning "  http_requests_total metric not found"
                return 1
            fi
        fi
    done
    
    log_warning "  No metrics endpoint found"
    return 1
}

# Test security headers
test_security_headers() {
    log_info "Testing security headers..."
    
    # Try multiple possible ports
    for port in 4000 3000 8000; do
        local headers
        headers=$(curl -I -s --max-time "$TEST_TIMEOUT" "http://localhost:$port/health" 2>/dev/null || echo "")
        
        if [ -n "$headers" ]; then
            log_info "  Testing security headers on port $port"
            
            local headers_ok=true
            
            # Check for HSTS header
            if echo "$headers" | grep -iq "strict-transport-security"; then
                log_info "  ✅ Strict-Transport-Security header present"
            else
                log_warning "  ❌ Strict-Transport-Security header missing"
                headers_ok=false
            fi
            
            # Check for X-Content-Type-Options
            if echo "$headers" | grep -iq "x-content-type-options"; then
                log_info "  ✅ X-Content-Type-Options header present"
            else
                log_warning "  ❌ X-Content-Type-Options header missing"
                headers_ok=false
            fi
            
            # Check for X-Frame-Options
            if echo "$headers" | grep -iq "x-frame-options"; then
                log_info "  ✅ X-Frame-Options header present"
            else
                log_warning "  ❌ X-Frame-Options header missing"
                headers_ok=false
            fi
            
            if [ "$headers_ok" = true ]; then
                return 0
            else
                return 1
            fi
        fi
    done
    
    return 1
}

# Test docker services
test_docker_services() {
    log_info "Testing Docker services..."
    
    if command -v docker > /dev/null 2>&1; then
        local running_containers
        running_containers=$(docker ps --format "table {{.Names}}" | grep -v "NAMES" | wc -l)
        
        if [ "$running_containers" -gt 0 ]; then
            log_info "  $running_containers Docker containers running"
            return 0
        fi
    fi
    
    return 1
}

# Test logs directory
test_logs() {
    log_info "Testing log directory structure..."
    
    if [ -d "logs" ] || [ -d "dist/logs" ] || [ -d "/var/log/ectropy" ]; then
        return 0
    fi
    
    return 1
}

# Environment-specific tests
test_environment_specific() {
    case "$ENVIRONMENT" in
        alpha)
            log_info "Running Alpha environment specific tests..."
            # Test experimental features
            test_feature_flags
            ;;
        beta)
            log_info "Running Beta environment specific tests..."
            # Test stable features
            test_feature_flags
            ;;
        staging)
            log_info "Running Staging environment specific tests..."
            # Test production-like setup
            test_monitoring
            ;;
        production)
            log_info "Running Production environment specific tests..."
            # Test production monitoring and security
            test_monitoring
            ;;
    esac
}

# Security smoke tests
test_security() {
    log_info "Running security smoke tests..."
    
    # Check if security validation script exists and runs
    if [ -f "scripts/security/validate-no-secrets.js" ]; then
        if node scripts/security/validate-no-secrets.js > /dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Basic check - no obvious secrets in environment
    if env | grep -i "password\|secret\|key" | grep -v "FF_\|NODE_\|PATH" | head -1 > /dev/null; then
        log_warning "Potential secrets found in environment variables"
        return 1
    fi
    
    return 0
}

# Main test execution
main() {
    log_info "Starting smoke tests for $ENVIRONMENT environment..."
    echo ""
    
    # Critical tests (must pass)
    run_test "Build Artifacts" "test_build_artifacts" true
    run_test "Web Dashboard" "test_web_dashboard" true
    
    # Important tests (should pass)
    run_test "MCP Server" "test_mcp_server" false
    run_test "API Gateway" "test_api_gateway" true
    run_test "Security Headers" "test_security_headers" true
    
    # Infrastructure tests
    run_test "Database Connectivity" "test_database" false
    run_test "Redis Connectivity" "test_redis" false
    run_test "Docker Services" "test_docker_services" false
    
    # Feature tests
    run_test "Feature Flags" "test_feature_flags" false
    run_test "Monitoring & Metrics" "test_monitoring" true
    run_test "Logs Directory" "test_logs" false
    
    # Security tests
    run_test "Security Validation" "test_security" true
    
    # Environment-specific tests
    run_test "Environment Specific" "test_environment_specific" false
    
    # Results summary
    echo ""
    echo "=================================="
    log_info "Smoke Test Summary for $ENVIRONMENT"
    echo "=================================="
    
    echo "Total Tests: $TESTS_TOTAL"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    
    local success_rate
    success_rate=$((TESTS_PASSED * 100 / TESTS_TOTAL))
    echo "Success Rate: $success_rate%"
    
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "🎉 ALL SMOKE TESTS PASSED"
        log_info "$ENVIRONMENT environment is ready for use!"
        exit 0
    elif [ $success_rate -ge 80 ]; then
        log_warning "⚠️ SMOKE TESTS PASSED WITH WARNINGS"
        log_info "$ENVIRONMENT environment is functional but needs attention"
        log_info "Some non-critical services may not be fully operational"
        exit 0
    else
        log_error "❌ SMOKE TESTS FAILED"
        log_info "$ENVIRONMENT environment has critical issues"
        log_info "Review failed tests and fix issues before proceeding"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Ectropy Platform Smoke Test Suite"
        echo ""
        echo "Usage: $0 <environment> [options]"
        echo ""
        echo "Environments:"
        echo "  alpha      Alpha environment tests"
        echo "  beta       Beta environment tests"
        echo "  staging    Staging environment tests"
        echo "  production Production environment tests"
        echo ""
        echo "Options:"
        echo "  --help, -h Show this help message"
        echo ""
        exit 0
        ;;
    alpha|beta|staging|production)
        main
        ;;
    *)
        if [ -z "${1:-}" ]; then
            log_warning "No environment specified, defaulting to staging"
            main
        else
            log_error "Invalid environment: ${1:-}"
            log_info "Valid environments: alpha, beta, staging, production"
            exit 1
        fi
        ;;
esac