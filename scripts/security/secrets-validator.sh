#!/bin/bash
# 🔐 ECTROPY SECRETS VALIDATOR - THE ONLY TEST YOU NEED
# 
# This script validates ALL secrets configuration for the Ectropy platform
# Tests against the definitive guide: docs/SECRETS_DEFINITIVE_GUIDE.md
# 
# Usage: ./scripts/secrets-validator.sh [environment]
# Environment: local, staging, production (default: auto-detect)

set -eo pipefail  # Use less strict mode for better error handling

# Colors for clear output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Pretty print functions
print_header() { echo -e "\n${BOLD}${BLUE}🔐 $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_fix() { echo -e "${YELLOW}🔧 FIX: $1${NC}"; }

# Global counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNING_TESTS=0
MISSING_SECRETS=()
WEAK_SECRETS=()

# Detect environment
ENVIRONMENT="${1:-auto}"
IS_CI_ENVIRONMENT=false
IS_LOCAL_ENVIRONMENT=false
IS_GITHUB_CODESPACES=false

if [ "$ENVIRONMENT" = "auto" ]; then
    if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${CI:-}" = "true" ]; then
        ENVIRONMENT="ci"
        IS_CI_ENVIRONMENT=true
    elif [ "${CODESPACES:-}" = "true" ]; then
        ENVIRONMENT="codespaces"
        IS_GITHUB_CODESPACES=true
        IS_LOCAL_ENVIRONMENT=true
    else
        ENVIRONMENT="local"
        IS_LOCAL_ENVIRONMENT=true
    fi
elif [ "$ENVIRONMENT" = "local" ]; then
    IS_LOCAL_ENVIRONMENT=true
elif [ "$ENVIRONMENT" = "ci" ] || [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "production" ]; then
    IS_CI_ENVIRONMENT=true
elif [ "$ENVIRONMENT" = "codespaces" ]; then
    IS_GITHUB_CODESPACES=true
    IS_LOCAL_ENVIRONMENT=true
fi

# Create logs directory
LOG_DIR="logs/secrets-validation"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/secrets-validation-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"; }

echo -e "${BOLD}🔐 ECTROPY SECRETS VALIDATOR${NC}"
echo "=================================="
echo "Environment: $ENVIRONMENT"
echo "Log file: $LOG_FILE"
echo ""

# Test function
# Test function - simplified and robust
test_secret() {
    local secret_name="$1"
    local description="$2"
    local is_required="$3"
    local min_length="$4"
    local secret_type="${5:-password}"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Get secret value safely
    local secret_value=""
    
    # Try environment variable first
    secret_value=$(printenv "$secret_name" 2>/dev/null || echo "")
    
    # If not found and we're in local environment, check dev file
    if [ -z "$secret_value" ] && [ "$IS_LOCAL_ENVIRONMENT" = "true" ] && [ -f ".devcontainer/.env.dev" ]; then
        secret_value=$(grep "^$secret_name=" .devcontainer/.env.dev 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    fi
    
    # Log the test
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Testing $secret_name: $([ -n "$secret_value" ] && echo "SET (${#secret_value} chars)" || echo "NOT SET")" >> "$LOG_FILE" 2>/dev/null || true
    
    if [ -n "$secret_value" ]; then
        local length=${#secret_value}
        
        # Check length requirement
        if [ "$length" -ge "$min_length" ]; then
            # Check for weak patterns
            if echo "$secret_value" | grep -qE "^(password|secret|default|admin|test|123|changeme|your_.*_here|placeholder)$" || \
               echo "$secret_value" | grep -q "password\|changeme\|placeholder"; then
                print_error "$description contains weak/placeholder value"
                print_fix "Regenerate with: openssl rand -hex $((min_length/2))"
                WEAK_SECRETS+=("$secret_name")
                FAILED_TESTS=$((FAILED_TESTS + 1))
            else
                print_success "$description ($length characters)"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            fi
        else
            if [ "$is_required" = "true" ]; then
                print_error "$description is too short ($length chars, need $min_length+)"
                print_fix "Regenerate with: openssl rand -hex $((min_length/2))"
                WEAK_SECRETS+=("$secret_name")
                FAILED_TESTS=$((FAILED_TESTS + 1))
            else
                print_warning "$description is too short but optional ($length chars, recommend $min_length+)"
                WARNING_TESTS=$((WARNING_TESTS + 1))
            fi
        fi
    else
        if [ "$is_required" = "true" ]; then
            print_error "$description is not configured"
            if [ "$IS_CI_ENVIRONMENT" = "true" ]; then
                print_fix "Add $secret_name to GitHub repository secrets"
                print_fix "Go to: https://github.com/luhtech/Ectropy/settings/secrets/actions"
            else
                print_fix "Set environment variable: export $secret_name=\$(openssl rand -hex $((min_length/2)))"
            fi
            MISSING_SECRETS+=("$secret_name")
            FAILED_TESTS=$((FAILED_TESTS + 1))
        else
            print_warning "$description is not configured (optional)"
            WARNING_TESTS=$((WARNING_TESTS + 1))
        fi
    fi
}

# Test Docker Compose configuration
test_docker_compose() {
    local compose_file="$1"
    local environment_name="$2"
    
    print_header "Testing $environment_name Docker Compose Configuration"
    
    if [ ! -f "$compose_file" ]; then
        print_error "Docker Compose file not found: $compose_file"
        ((FAILED_TESTS++))
        return
    fi
    
    ((TOTAL_TESTS++))
    
    # Test if compose file is valid
    if docker compose -f "$compose_file" config --quiet 2>/dev/null; then
        print_success "Docker Compose configuration is valid"
        ((PASSED_TESTS++))
        log "PASSED: $compose_file config valid"
    else
        print_error "Docker Compose configuration is invalid"
        print_fix "Run: docker compose -f $compose_file config"
        ((FAILED_TESTS++))
        log "FAILED: $compose_file config invalid"
        return
    fi
    
    # Test for hardcoded secrets in compose file
    ((TOTAL_TESTS++))
    if grep -E "(password|secret|key).*=.*(password|admin|123|changeme|default)" "$compose_file" >/dev/null 2>&1; then
        print_error "Found hardcoded weak passwords in $compose_file"
        print_fix "Replace hardcoded values with variables: \${SECRET_NAME}"
        ((FAILED_TESTS++))
        log "FAILED: $compose_file has hardcoded secrets"
    else
        print_success "No hardcoded secrets found in compose file"
        ((PASSED_TESTS++))
        log "PASSED: $compose_file no hardcoded secrets"
    fi
}

# Test GitHub workflow configuration
test_github_workflows() {
    print_header "Testing GitHub Workflows Configuration"
    
    local workflows_dir=".github/workflows"
    if [ ! -d "$workflows_dir" ]; then
        print_warning "GitHub workflows directory not found"
        return
    fi
    
    # Test staging workflow
    local staging_workflow="$workflows_dir/staging-deploy.yml"
    if [ -f "$staging_workflow" ]; then
        ((TOTAL_TESTS++))
        
        # Check if workflow uses secrets properly (either secrets. or secrets: inherit)
        if grep -q "secrets\." "$staging_workflow" || grep -q "secrets: inherit" "$staging_workflow"; then
            print_success "Staging workflow uses GitHub secrets"
            ((PASSED_TESTS++))
            log "PASSED: staging workflow uses secrets"
        else
            print_error "Staging workflow doesn't use GitHub secrets"
            print_fix "Update workflow to use \${{ secrets.SECRET_NAME }} syntax"
            ((FAILED_TESTS++))
            log "FAILED: staging workflow missing secrets usage"
        fi
    else
        print_warning "Staging workflow not found: $staging_workflow"
    fi
    
    # Also test check-staging-secrets.yml which definitely should use secrets
    local check_secrets_workflow="$workflows_dir/check-staging-secrets.yml"
    if [ -f "$check_secrets_workflow" ]; then
        ((TOTAL_TESTS++))
        
        if grep -q "secrets\." "$check_secrets_workflow" || grep -q "secrets: inherit" "$check_secrets_workflow"; then
            print_success "Check-staging-secrets workflow uses GitHub secrets"
            ((PASSED_TESTS++))
            log "PASSED: check-staging-secrets workflow uses secrets"
        else
            print_error "Check-staging-secrets workflow doesn't use GitHub secrets"
            ((FAILED_TESTS++))
            log "FAILED: check-staging-secrets workflow missing secrets usage"
        fi
    fi
}

# Main validation function
run_validation() {
    print_header "Starting Comprehensive Secrets Validation"
    print_info "Environment: $ENVIRONMENT"
    print_info "CI Environment: $IS_CI_ENVIRONMENT"
    print_info "Local Environment: $IS_LOCAL_ENVIRONMENT"
    print_info "GitHub Codespaces: $IS_GITHUB_CODESPACES"
    echo ""
    
    # Test core infrastructure secrets (REQUIRED)
    print_header "Core Infrastructure Secrets (REQUIRED)"
    test_secret "POSTGRES_PASSWORD" "PostgreSQL database password" true 24 "password"
    test_secret "REDIS_PASSWORD" "Redis cache password" true 24 "password"
    test_secret "JWT_SECRET" "JWT signing secret" true 64 "secret"
    
    # Test BIM/Speckle secrets (REQUIRED for full functionality)
    print_header "BIM/Speckle Service Secrets (REQUIRED)"
    test_secret "SPECKLE_POSTGRES_PASSWORD" "Speckle database password" true 24 "password"
    test_secret "SPECKLE_REDIS_PASSWORD" "Speckle cache password" true 24 "password"
    test_secret "SPECKLE_SESSION_SECRET" "Speckle session secret" true 64 "secret"
    
    # Test optional secrets
    print_header "Optional Secrets (RECOMMENDED)"
    test_secret "JWT_REFRESH_SECRET" "JWT refresh token secret" false 64 "secret"
    test_secret "GF_SECURITY_ADMIN_PASSWORD" "Grafana admin password" false 16 "password"
    
    # Test configuration files
    if [ "$IS_LOCAL_ENVIRONMENT" = "true" ]; then
        print_header "Local Development Configuration"
        
        # Check development environment file
        if [ -f ".devcontainer/.env.dev" ]; then
            print_success "Development environment file exists"
        else
            print_warning "Development environment file not found"
            print_fix "Copy from template: cp .env.template .devcontainer/.env.dev"
        fi
    fi
    
    # Test Docker Compose configurations
    if [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "ci" ]; then
        test_docker_compose "docker-compose.staging.yml" "Staging"
    elif [ "$ENVIRONMENT" = "production" ]; then
        test_docker_compose "docker-compose.production.yml" "Production"
    else
        # Test all available compose files
        if [ -f "docker-compose.staging.yml" ]; then
            test_docker_compose "docker-compose.staging.yml" "Staging"
        fi
        if [ -f "docker-compose.production.yml" ]; then
            test_docker_compose "docker-compose.production.yml" "Production"
        fi
    fi
    
    # Test GitHub workflows
    test_github_workflows
}

# Generate fix commands
generate_fix_commands() {
    print_header "Quick Fix Commands"
    
    if [ ${#MISSING_SECRETS[@]} -gt 0 ] || [ ${#WEAK_SECRETS[@]} -gt 0 ]; then
        echo "Run these commands to generate secure secrets:"
        echo ""
        
        # Combine missing and weak secrets
        local all_problem_secrets=("${MISSING_SECRETS[@]}" "${WEAK_SECRETS[@]}")
        # Remove duplicates
        local unique_secrets=($(printf "%s\n" "${all_problem_secrets[@]}" | sort -u))
        
        for secret in "${unique_secrets[@]}"; do
            case "$secret" in
                *PASSWORD*)
                    echo "export $secret=\$(openssl rand -hex 32)"
                    ;;
                *SECRET*)
                    echo "export $secret=\$(openssl rand -hex 64)"
                    ;;
                *)
                    echo "export $secret=\$(openssl rand -hex 32)"
                    ;;
            esac
        done
        
        echo ""
        if [ "$IS_CI_ENVIRONMENT" = "true" ]; then
            print_fix "Add these to GitHub repository secrets:"
            print_fix "https://github.com/luhtech/Ectropy/settings/secrets/actions"
        else
            print_fix "Set these environment variables in your shell or .env file"
        fi
    fi
}

# Print final report
print_final_report() {
    echo ""
    echo "=================================="
    print_header "VALIDATION SUMMARY"
    echo "Total Tests: $TOTAL_TESTS"
    echo "Passed: $PASSED_TESTS"
    echo "Failed: $FAILED_TESTS"
    echo "Warnings: $WARNING_TESTS"
    echo ""
    
    if [ $FAILED_TESTS -gt 0 ]; then
        print_error "VALIDATION FAILED - $FAILED_TESTS critical issues found"
        echo ""
        print_error "Critical Issues:"
        
        if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
            echo "Missing secrets: ${MISSING_SECRETS[*]}"
        fi
        
        if [ ${#WEAK_SECRETS[@]} -gt 0 ]; then
            echo "Weak/invalid secrets: ${WEAK_SECRETS[*]}"
        fi
        
        echo ""
        generate_fix_commands
        echo ""
        print_error "❌ SECRETS VALIDATION FAILED"
        print_fix "Fix the issues above and run this script again"
        
        log "VALIDATION FAILED: $FAILED_TESTS failures, $WARNING_TESTS warnings"
        return 1
    elif [ $WARNING_TESTS -gt 0 ]; then
        print_warning "VALIDATION PASSED WITH WARNINGS - $WARNING_TESTS non-critical issues"
        print_success "✅ All required secrets are configured"
        print_warning "Consider addressing the warnings above for better security"
        
        log "VALIDATION PASSED: $PASSED_TESTS passed, $WARNING_TESTS warnings"
        return 0
    else
        print_success "✅ SECRETS VALIDATION PASSED PERFECTLY"
        print_success "All secrets are properly configured for secure deployment"
        
        log "VALIDATION PASSED: $PASSED_TESTS passed, 0 warnings"
        return 0
    fi
}

# Main execution
main() {
    # Initialize log file
    echo "Ectropy Secrets Validation - $(date)" > "$LOG_FILE"
    log "Starting validation in environment: $ENVIRONMENT"
    
    # Run validation
    run_validation
    
    # Print final report and exit with appropriate code
    print_final_report
}

# Run main function and preserve exit code
main "$@"
exit_code=$?

echo ""
print_info "Detailed logs saved to: $LOG_FILE"
print_info "For complete guidance, see: docs/SECRETS_DEFINITIVE_GUIDE.md"

exit $exit_code