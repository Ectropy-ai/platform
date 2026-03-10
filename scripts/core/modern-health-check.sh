#!/bin/bash

# Modern Repository Health Check for Ectropy Platform
# Validates enterprise standards and development environment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((CHECKS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((CHECKS_WARNING++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((CHECKS_FAILED++))
}

check_command() {
    if command -v "$1" &> /dev/null; then
        log_success "$1 is available"
        return 0
    else
        log_error "$1 is not available"
        return 1
    fi
}

check_file() {
    if [[ -f "$1" ]]; then
        log_success "File exists: $1"
        return 0
    else
        log_error "File missing: $1"
        return 1
    fi
}

check_directory() {
    if [[ -d "$1" ]]; then
        log_success "Directory exists: $1"
        return 0
    else
        log_error "Directory missing: $1"
        return 1
    fi
}

# Main health checks
main() {
    echo "🩺 Ectropy Platform Health Check"
    echo "================================="
    echo

    # System requirements
    log_info "Checking system requirements..."
    check_command "node"
    check_command "pnpm"
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        if [[ "${NODE_VERSION}" == v2[0-9]* ]]; then
            log_success "Node.js version is supported: ${NODE_VERSION}"
        else
            log_warning "Node.js version may not be optimal: ${NODE_VERSION} (recommended: 20+)"
        fi
    fi

    # Project structure
    log_info "Checking project structure..."
    check_file "package.json"
    check_file "tsconfig.json"
    check_file "jest.config.js"
    check_directory "apps"
    check_directory "libs"
    check_directory "scripts"
    check_directory "docs"

    # Dependencies
    log_info "Checking dependencies..."
    if [[ -d "node_modules" ]]; then
        log_success "Dependencies are installed"
    else
        log_warning "Dependencies not installed - run 'pnpm install'"
    fi

    # Configuration files
    log_info "Checking configuration files..."
    check_file "nx.json"
    check_file "eslint.config.js"
    check_file ".prettierrc"

    # TypeScript compilation
    log_info "Checking TypeScript compilation..."
    if pnpm run type-check --silent > /dev/null 2>&1; then
        log_success "TypeScript compilation passes"
    else
        log_error "TypeScript compilation has errors"
    fi

    # Build system
    log_info "Checking build system..."
    if command -v npx &> /dev/null && npx nx --help > /dev/null 2>&1; then
        log_success "Nx build system is available"
    else
        log_warning "Nx build system may not be properly configured"
    fi

    # Security
    log_info "Checking security configuration..."
    check_file ".env.template"
    check_file ".gitignore"
    
    if [[ -f ".env" ]]; then
        log_warning "Local .env file exists (ensure it's not committed)"
    else
        log_success "No local .env file found (good for security)"
    fi

    # Documentation
    log_info "Checking documentation..."
    check_file "README.md"
    check_file "CONTRIBUTING.md"
    check_file "LICENSE"
    check_file "PLATFORM_STATUS.md"

    # Docker configuration
    log_info "Checking Docker configuration..."
    check_file "docker-compose.yml"
    check_file "Dockerfile"

    # Test configuration
    log_info "Checking test configuration..."
    check_file "jest.setup.js"
    if [[ -d "__tests__" ]] || find . -name "*.test.*" -o -name "*.spec.*" | grep -q .; then
        log_success "Test files are present"
    else
        log_warning "No test files found"
    fi

    # Enterprise standards
    log_info "Checking enterprise standards..."
    if [[ -f "tsconfig.enterprise-standard.json" ]]; then
        log_success "Enterprise TypeScript configuration exists"
    else
        log_warning "Enterprise TypeScript configuration missing"
    fi

    # Archive cleanup
    log_info "Checking for archived content..."
    if [[ -d "archive/milestones" ]]; then
        log_success "Milestone documentation properly archived"
    else
        log_warning "Milestone documentation may need archiving"
    fi

    # Summary
    echo
    echo "🏥 Health Check Summary"
    echo "======================="
    echo -e "${GREEN}✅ Passed: ${CHECKS_PASSED}${NC}"
    echo -e "${YELLOW}⚠️  Warnings: ${CHECKS_WARNING}${NC}"
    echo -e "${RED}❌ Failed: ${CHECKS_FAILED}${NC}"
    echo

    # Overall health score
    TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_WARNING + CHECKS_FAILED))
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        HEALTH_SCORE=$(( (CHECKS_PASSED * 100) / TOTAL_CHECKS ))
        
        if [[ $HEALTH_SCORE -ge 90 ]]; then
            echo -e "${GREEN}🎯 Repository Health: EXCELLENT (${HEALTH_SCORE}%)${NC}"
        elif [[ $HEALTH_SCORE -ge 75 ]]; then
            echo -e "${YELLOW}🎯 Repository Health: GOOD (${HEALTH_SCORE}%)${NC}"
        elif [[ $HEALTH_SCORE -ge 60 ]]; then
            echo -e "${YELLOW}🎯 Repository Health: FAIR (${HEALTH_SCORE}%)${NC}"
        else
            echo -e "${RED}🎯 Repository Health: NEEDS ATTENTION (${HEALTH_SCORE}%)${NC}"
        fi
    fi

    echo
    if [[ $CHECKS_FAILED -gt 0 ]]; then
        echo "❗ Some critical issues need attention before development"
        exit 1
    elif [[ $CHECKS_WARNING -gt 3 ]]; then
        echo "⚠️  Consider addressing warnings for optimal development experience"
        exit 0
    else
        echo "🚀 Repository is ready for development!"
        exit 0
    fi
}

# Run main function
main "$@"