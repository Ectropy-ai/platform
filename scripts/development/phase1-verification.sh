#!/bin/bash
# Phase 1: Verify Local - 30 minutes
# This script performs the local verification steps from the honest staging readiness assessment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to log results
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Phase 1: Local Verification${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Test 1: Verify test count
echo -e "${BLUE}Test 1: Verify test count${NC}"
echo "Running: pnpm vitest run apps/api-gateway/tests/ --reporter=verbose"
TEST_OUTPUT=$(pnpm vitest run apps/api-gateway/tests/ --reporter=verbose 2>&1)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -E "Tests.*passed" | grep -oE "[0-9]+ passed" | head -1 | grep -oE "[0-9]+")

if [ "$TEST_COUNT" = "50" ]; then
    log_success "Test count verified: 50/50 tests passing"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log_error "Test count mismatch: Expected 50, got $TEST_COUNT"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 2: Run smoke test
echo -e "${BLUE}Test 2: Run smoke test${NC}"
log_info "NOTE: Smoke test requires running server"
log_info "Server must be started separately: node dist/apps/api-gateway/main.js &"
log_warning "Skipping smoke test - requires built server to be running"
echo ""

# Test 3: Verify indexes in use (requires database)
echo -e "${BLUE}Test 3: Verify indexes in use${NC}"
log_info "Checking if PostgreSQL container is running..."
if docker ps | grep -q postgres; then
    POSTGRES_CONTAINER=$(docker ps | grep postgres | awk '{print $1}')
    log_info "PostgreSQL container found: $POSTGRES_CONTAINER"
    
    # Check if database exists and has indexes
    INDEX_COUNT=$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d ectropy_dev -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';" 2>&1 | tr -d ' ')
    
    if [ "$INDEX_COUNT" = "28" ]; then
        log_success "Database indexes verified: 28 performance indexes active"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Verify index usage on email column
        EXPLAIN_OUTPUT=$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d ectropy_dev -c "EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';" 2>&1 || true)
        if echo "$EXPLAIN_OUTPUT" | grep -q "Index Scan"; then
            log_success "Index usage verified: Using Index Scan on email queries"
        else
            log_warning "Could not verify index usage (may need test data)"
        fi
    else
        log_warning "Database indexes not found: Expected 28, found $INDEX_COUNT"
        log_info "Run: docker compose -f docker-compose.development.yml up -d postgres"
        log_info "Then apply migrations from database/migrations/"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    log_warning "PostgreSQL container not running"
    log_info "Run: docker compose -f docker-compose.development.yml up -d postgres"
    log_info "Then apply migrations from database/migrations/"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 4: Verify metrics endpoint (requires running server)
echo -e "${BLUE}Test 4: Verify metrics endpoint${NC}"
log_info "Checking if API Gateway is running on port 4000..."
if curl -s --max-time 2 http://localhost:4000/health > /dev/null 2>&1; then
    METRICS_OUTPUT=$(curl -s http://localhost:4000/metrics)
    if echo "$METRICS_OUTPUT" | grep -q "http_requests_total"; then
        log_success "Metrics endpoint verified: http_requests_total metric present"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_error "Metrics endpoint missing http_requests_total"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    log_warning "API Gateway not running on port 4000"
    log_info "Start server: node dist/apps/api-gateway/main.js &"
    log_info "Wait 10 seconds, then run this script again"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Summary
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Phase 1 Verification Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    log_success "✅ ALL LOCAL VERIFICATION TESTS PASSED"
    echo ""
    log_info "Next Steps:"
    echo "1. Review Phase 2 in STAGING_READINESS_COMPLETE.md"
    echo "2. Provision staging infrastructure (AWS/GCP/Azure)"
    echo "3. Deploy to staging environment"
    echo "4. Run Phase 3 validation"
    exit 0
elif [ $TESTS_PASSED -gt 0 ]; then
    log_warning "⚠️ SOME TESTS PASSED, SOME FAILED"
    echo ""
    log_info "Fix failed tests before proceeding:"
    echo "- Build the application: pnpm nx run api-gateway:build"
    echo "- Start Docker services: docker compose -f docker-compose.development.yml up -d"
    echo "- Apply migrations: See database/migrations/"
    echo "- Start server: node dist/apps/api-gateway/main.js &"
    exit 1
else
    log_error "❌ ALL TESTS FAILED"
    echo ""
    log_info "Setup required:"
    echo "1. Install dependencies: pnpm install"
    echo "2. Build application: pnpm nx run api-gateway:build"
    echo "3. Start services: docker compose -f docker-compose.development.yml up -d"
    echo "4. Apply migrations"
    echo "5. Start server"
    exit 1
fi
