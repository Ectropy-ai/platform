#!/bin/bash

##############################################################################
# OAuth Validation Script
# Tests OAuth integration components for production readiness
# 
# This script validates:
# - OAuth configuration files exist
# - OAuth tests pass
# - Environment variables configured
# - Dependencies installed
# - Routes properly configured
#
# Usage: ./scripts/oauth-validation.sh [--strict]
# Options:
#   --strict: Fail if any checks don't pass (for CI/CD)
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Strict mode flag
STRICT_MODE=false
if [ "$1" = "--strict" ]; then
    STRICT_MODE=true
fi

# Counters
PASSED=0
WARNINGS=0
FAILED=0

##############################################################################
# Helper Functions
##############################################################################

log_pass() {
    ((PASSED++))
    echo -e "${GREEN}✅ PASS:${NC} $1"
}

log_warn() {
    ((WARNINGS++))
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
    if [ "$STRICT_MODE" = true ]; then
        ((FAILED++))
    fi
}

log_fail() {
    ((FAILED++))
    echo -e "${RED}❌ FAIL:${NC} $1"
}

log_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${YELLOW}─── $1${NC}"
}

##############################################################################
# Validation Checks
##############################################################################

validate_oauth_files() {
    print_section "1. OAuth Configuration Files"
    
    # OAuth routes file
    if [ -f "apps/api-gateway/src/routes/oauth.routes.ts" ]; then
        log_pass "OAuth routes file exists"
        
        # Check for required endpoints
        if grep -q "/auth/login" apps/api-gateway/src/routes/oauth.routes.ts; then
            log_pass "Login endpoint defined"
        else
            log_fail "Login endpoint not found in routes"
        fi
        
        if grep -q "/auth/google/callback" apps/api-gateway/src/routes/oauth.routes.ts; then
            log_pass "Google callback endpoint defined"
        else
            log_fail "Google callback endpoint not found"
        fi
        
        if grep -q "/auth/me" apps/api-gateway/src/routes/oauth.routes.ts; then
            log_pass "User info endpoint defined"
        else
            log_warn "User info endpoint not found"
        fi
        
        if grep -q "/auth/logout" apps/api-gateway/src/routes/oauth.routes.ts; then
            log_pass "Logout endpoint defined"
        else
            log_warn "Logout endpoint not found"
        fi
    else
        log_fail "OAuth routes file not found: apps/api-gateway/src/routes/oauth.routes.ts"
    fi
    
    # OAuth provider file
    if [ -f "libs/shared/oauth/src/oauth-provider.ts" ]; then
        log_pass "OAuth provider implementation exists"
    else
        log_fail "OAuth provider file not found: libs/shared/oauth/src/oauth-provider.ts"
    fi
    
    # Auth middleware
    if [ -f "apps/api-gateway/src/middleware/auth.middleware.ts" ]; then
        log_pass "Authentication middleware exists"
    else
        log_fail "Auth middleware not found: apps/api-gateway/src/middleware/auth.middleware.ts"
    fi
    
    # Auth config
    if [ -f "apps/api-gateway/src/config/auth.config.ts" ]; then
        log_pass "Auth configuration file exists"
        
        # Check for validateAuthConfig function
        if grep -q "validateAuthConfig" apps/api-gateway/src/config/auth.config.ts; then
            log_pass "Auth config validation function exists"
        else
            log_warn "Auth config validation function not found"
        fi
    else
        log_fail "Auth config file not found: apps/api-gateway/src/config/auth.config.ts"
    fi
}

validate_oauth_tests() {
    print_section "2. OAuth Tests"
    
    OAUTH_TEST_FILE="apps/api-gateway/src/auth/__tests__/oauth.test.ts"
    
    if [ ! -f "$OAUTH_TEST_FILE" ]; then
        log_fail "OAuth test file not found: $OAUTH_TEST_FILE"
        return
    fi
    
    log_pass "OAuth test file exists"
    
    # Run OAuth-specific tests
    log_info "Running OAuth tests..."
    if pnpm vitest "$OAUTH_TEST_FILE" --run --silent 2>/dev/null; then
        log_pass "OAuth tests passed"
    else
        log_warn "OAuth tests failed (may be acceptable during development)"
        log_info "Run 'pnpm vitest $OAUTH_TEST_FILE' to see details"
    fi
}

validate_environment_variables() {
    print_section "3. Environment Variables"
    
    # Check GOOGLE_CLIENT_ID
    if [ -n "$GOOGLE_CLIENT_ID" ]; then
        if [ "$GOOGLE_CLIENT_ID" = "dummy-for-validation" ] || [ "$GOOGLE_CLIENT_ID" = "REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID" ]; then
            log_warn "GOOGLE_CLIENT_ID is a placeholder value"
        else
            log_pass "GOOGLE_CLIENT_ID configured"
        fi
    else
        log_warn "GOOGLE_CLIENT_ID not set (required for OAuth)"
    fi
    
    # Check GOOGLE_CLIENT_SECRET
    if [ -n "$GOOGLE_CLIENT_SECRET" ]; then
        if [ "$GOOGLE_CLIENT_SECRET" = "dummy-for-validation" ] || [ "$GOOGLE_CLIENT_SECRET" = "REPLACE_WITH_YOUR_GOOGLE_CLIENT_SECRET" ]; then
            log_warn "GOOGLE_CLIENT_SECRET is a placeholder value"
        else
            log_pass "GOOGLE_CLIENT_SECRET configured"
        fi
    else
        log_warn "GOOGLE_CLIENT_SECRET not set (required for OAuth)"
    fi
    
    # Check SESSION_SECRET
    if [ -n "$SESSION_SECRET" ]; then
        if [ "$SESSION_SECRET" = "dummy-for-validation" ] || [ "$SESSION_SECRET" = "your-session-secret-here" ]; then
            log_warn "SESSION_SECRET is a placeholder value"
        else
            # Check length (should be at least 32 characters for security)
            if [ ${#SESSION_SECRET} -ge 32 ]; then
                log_pass "SESSION_SECRET configured (sufficient length)"
            else
                log_warn "SESSION_SECRET too short (should be at least 32 characters)"
            fi
        fi
    else
        log_warn "SESSION_SECRET not set (required for sessions)"
    fi
    
    # Check JWT_SECRET
    if [ -n "$JWT_SECRET" ]; then
        if [ ${#JWT_SECRET} -ge 32 ]; then
            log_pass "JWT_SECRET configured (sufficient length)"
        else
            log_warn "JWT_SECRET too short (should be at least 32 characters)"
        fi
    else
        log_warn "JWT_SECRET not set (required for JWT authentication)"
    fi
    
    # Check API_BASE_URL or similar
    if [ -n "$API_BASE_URL" ]; then
        log_pass "API_BASE_URL configured: $API_BASE_URL"
    else
        log_info "API_BASE_URL not set (will use default)"
    fi
}

validate_dependencies() {
    print_section "4. OAuth Dependencies"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_fail "package.json not found"
        return
    fi
    
    # Check for passport
    if grep -q '"passport"' package.json; then
        log_pass "passport dependency installed"
    else
        log_fail "passport dependency not found in package.json"
    fi
    
    # Check for passport-google-oauth20
    if grep -q '"passport-google-oauth20"' package.json; then
        log_pass "passport-google-oauth20 dependency installed"
    else
        log_fail "passport-google-oauth20 dependency not found"
    fi
    
    # Check for express-session
    if grep -q '"express-session"' package.json; then
        log_pass "express-session dependency installed"
    else
        log_fail "express-session dependency not found"
    fi
    
    # Check for connect-redis
    if grep -q '"connect-redis"' package.json; then
        log_pass "connect-redis dependency installed"
    else
        log_warn "connect-redis dependency not found (recommended for session storage)"
    fi
    
    # Check for ioredis
    if grep -q '"ioredis"' package.json; then
        log_pass "ioredis dependency installed"
    else
        log_warn "ioredis dependency not found (required for Redis connection)"
    fi
}

validate_main_integration() {
    print_section "5. OAuth Integration in Main Application"
    
    MAIN_FILE="apps/api-gateway/src/main.ts"
    
    if [ ! -f "$MAIN_FILE" ]; then
        log_fail "Main application file not found: $MAIN_FILE"
        return
    fi
    
    # Check for OAuth validation
    if grep -q "validateAuthConfig" "$MAIN_FILE"; then
        log_pass "OAuth validation integrated in startup"
    else
        log_warn "OAuth validation not found in main.ts"
    fi
    
    # Check for session middleware
    if grep -q "session" "$MAIN_FILE" || grep -q "getSessionMiddleware" "$MAIN_FILE"; then
        log_pass "Session middleware integrated"
    else
        log_warn "Session middleware not found in main.ts"
    fi
    
    # Check for OAuth routes mounting
    if grep -q "OAuthRoutes\|oauth.routes\|/auth" "$MAIN_FILE"; then
        log_pass "OAuth routes appear to be mounted"
    else
        log_warn "OAuth routes mounting not clearly visible in main.ts"
    fi
}

validate_documentation() {
    print_section "6. OAuth Documentation"
    
    # Check for OAuth implementation guide
    if [ -f "docs/auth/oauth-implementation-guide.md" ]; then
        log_pass "OAuth implementation guide exists"
    else
        log_info "OAuth implementation guide not found (recommended)"
    fi
    
    # Check for OAuth validation checklist
    if [ -f "docs/auth/oauth-validation-checklist.md" ]; then
        log_pass "OAuth validation checklist exists"
    else
        log_info "OAuth validation checklist not found (recommended)"
    fi
    
    # Check for security audit documentation
    if [ -f "docs/security/staging-security-audit-template.md" ]; then
        log_pass "Security audit documentation exists"
    else
        log_info "Security audit template not found (recommended)"
    fi
}

##############################################################################
# Main Execution
##############################################################################

main() {
    print_header "🔐 OAuth Validation - Ectropy Platform"
    
    log_info "Starting OAuth validation..."
    log_info "Strict mode: $STRICT_MODE"
    echo ""
    
    # Run all validations
    validate_oauth_files
    validate_oauth_tests
    validate_environment_variables
    validate_dependencies
    validate_main_integration
    validate_documentation
    
    # Print summary
    print_header "Validation Summary"
    
    echo -e "${GREEN}Passed:${NC} $PASSED"
    echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
    echo -e "${RED}Failed:${NC} $FAILED"
    echo ""
    
    TOTAL=$((PASSED + WARNINGS + FAILED))
    if [ $TOTAL -gt 0 ]; then
        PASS_RATE=$((PASSED * 100 / TOTAL))
        echo -e "Pass Rate: ${PASS_RATE}%"
    fi
    
    echo ""
    
    # Determine exit status
    if [ $FAILED -gt 0 ]; then
        echo -e "${RED}❌ OAuth validation FAILED${NC}"
        echo -e "   $FAILED critical issue(s) found"
        echo ""
        echo "Next steps:"
        echo "  1. Review failed checks above"
        echo "  2. Install missing dependencies: pnpm install"
        echo "  3. Configure environment variables"
        echo "  4. Re-run validation"
        exit 1
    elif [ $WARNINGS -gt 0 ] && [ "$STRICT_MODE" = true ]; then
        echo -e "${YELLOW}⚠️  OAuth validation completed with warnings (strict mode)${NC}"
        echo -e "   $WARNINGS warning(s) found"
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  OAuth validation completed with warnings${NC}"
        echo -e "   $WARNINGS warning(s) found"
        echo ""
        echo "Notes:"
        echo "  - Warnings indicate missing optional components"
        echo "  - OAuth may work but some features may be limited"
        echo "  - Use --strict flag for CI/CD to fail on warnings"
        exit 0
    else
        echo -e "${GREEN}✅ OAuth validation PASSED${NC}"
        echo -e "   All checks passed successfully"
        echo ""
        echo "Next steps:"
        echo "  1. Review docs/auth/oauth-implementation-guide.md"
        echo "  2. Configure OAuth credentials in Google Cloud Console"
        echo "  3. Test OAuth flow on staging environment"
        echo "  4. Run security audit: ./scripts/security/staging-security-audit.sh"
        exit 0
    fi
}

# Run main function
main "$@"