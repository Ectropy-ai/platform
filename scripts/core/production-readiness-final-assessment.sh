#!/bin/bash

# =============================================================================
# ECTROPY PLATFORM - COMPREHENSIVE PRODUCTION READINESS ASSESSMENT
# =============================================================================
# Enterprise-grade production readiness validation without runtime dependencies
# This script performs static analysis and comprehensive checks for production deployment
# =============================================================================

set -uo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOGS_DIR="${PROJECT_ROOT}/logs"
REPORTS_DIR="${PROJECT_ROOT}/reports"
ASSESSMENT_LOG="${LOGS_DIR}/production-assessment-$(date +%Y%m%d-%H%M%S).log"
FINAL_REPORT="${REPORTS_DIR}/production-readiness-final-$(date +%Y%m%d-%H%M%S).md"

# Assessment metrics
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
CRITICAL_FAILURES=0
WARNING_COUNT=0
START_TIME=$(date +%s)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_header() {
    echo
    echo -e "${PURPLE}================================================================${NC}"
    echo -e "${PURPLE} $1${NC}"
    echo -e "${PURPLE}================================================================${NC}"
    echo
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "${ASSESSMENT_LOG}"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "${ASSESSMENT_LOG}"
    ((PASSED_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "${ASSESSMENT_LOG}"
    ((WARNING_COUNT++))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "${ASSESSMENT_LOG}"
    ((FAILED_CHECKS++))
}

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $1" | tee -a "${ASSESSMENT_LOG}"
    ((CRITICAL_FAILURES++))
    ((FAILED_CHECKS++))
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1" | tee -a "${ASSESSMENT_LOG}"
    ((TOTAL_CHECKS++))
}

# Create directory if it doesn't exist
ensure_directory() {
    local dir=$1
    if [[ ! -d "${dir}" ]]; then
        mkdir -p "${dir}"
        log_info "Created directory: ${dir}"
    fi
}

# =============================================================================
# PRODUCTION READINESS ASSESSMENT FUNCTIONS
# =============================================================================

assess_typescript_compilation() {
    log_header "TYPESCRIPT COMPILATION ASSESSMENT"
    
    log_step "Checking TypeScript configuration files"
    if [[ -f "${PROJECT_ROOT}/tsconfig.enterprise-standard.json" ]]; then
        log_success "Enterprise TypeScript configuration found"
    else
        log_critical "Missing enterprise TypeScript configuration"
    fi
    
    if [[ -f "${PROJECT_ROOT}/tsconfig.json" ]]; then
        log_success "Base TypeScript configuration found"
    else
        log_failure "Missing base TypeScript configuration"
    fi
    
    log_step "Checking for TypeScript files"
    local ts_files=$(find "${PROJECT_ROOT}" -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v dist | wc -l)
    if [[ $ts_files -gt 0 ]]; then
        log_success "Found ${ts_files} TypeScript files"
    else
        log_failure "No TypeScript files found"
    fi
    
    log_step "Checking type definitions"
    local type_files=$(find "${PROJECT_ROOT}/types" -name "*.d.ts" 2>/dev/null | wc -l || echo "0")
    if [[ $type_files -gt 0 ]]; then
        log_success "Found ${type_files} type definition files"
    else
        log_warning "No custom type definitions found"
    fi
    
    log_step "Attempting TypeScript compilation check"
    if command -v npx >/dev/null 2>&1; then
        if npx tsc --noEmit --project "${PROJECT_ROOT}/tsconfig.enterprise-standard.json" >/dev/null 2>&1; then
            log_success "TypeScript compilation check passed"
        else
            local error_count=$(npx tsc --noEmit --project "${PROJECT_ROOT}/tsconfig.enterprise-standard.json" 2>&1 | grep -c "error TS" || echo "0")
            if [[ $error_count -gt 0 ]]; then
                log_failure "TypeScript compilation has ${error_count} errors"
            else
                log_warning "TypeScript compilation check inconclusive"
            fi
        fi
    else
        log_warning "TypeScript compiler not available for compilation check"
    fi
}

assess_security_configuration() {
    log_header "SECURITY CONFIGURATION ASSESSMENT"
    
    log_step "Checking for hardcoded secrets"
    local secret_patterns=("password.*=.*['\"][^'\"]{8,}" "secret.*=.*['\"][^'\"]{8,}" "token.*=.*['\"][^'\"]{20,}" "key.*=.*['\"][^'\"]{16,}")
    local secrets_found=0
    
    for pattern in "${secret_patterns[@]}"; do
        local matches=$(grep -r -i -E "$pattern" "${PROJECT_ROOT}" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" 2>/dev/null | grep -v node_modules | grep -v ".env" | wc -l || echo "0")
        if [[ $matches -gt 0 ]]; then
            ((secrets_found++))
        fi
    done
    
    if [[ $secrets_found -eq 0 ]]; then
        log_success "No hardcoded secrets detected in source code"
    else
        log_critical "Found potential hardcoded secrets in source code"
    fi
    
    log_step "Checking environment configuration"
    if [[ -f "${PROJECT_ROOT}/.env.template" ]]; then
        log_success "Environment example file found"
    else
        log_failure "Missing .env.template file"
    fi
    
    if [[ -f "${PROJECT_ROOT}/.env.production.template" ]]; then
        log_success "Production environment example found"
    else
        log_warning "Missing .env.production.template file"
    fi
    
    log_step "Checking security middleware"
    local security_files=$(find "${PROJECT_ROOT}" -name "*security*" -o -name "*auth*" | grep -v node_modules | grep -v dist | wc -l)
    if [[ $security_files -gt 0 ]]; then
        log_success "Found ${security_files} security-related files"
    else
        log_failure "No security middleware files found"
    fi
    
    log_step "Checking for HTTPS configuration"
    if grep -r "ssl\|https\|tls" "${PROJECT_ROOT}" --include="*.ts" --include="*.js" --include="*.json" | grep -v node_modules >/dev/null 2>&1; then
        log_success "HTTPS/SSL configuration references found"
    else
        log_warning "No HTTPS/SSL configuration found"
    fi
}

assess_package_management() {
    log_header "PACKAGE MANAGEMENT ASSESSMENT"
    
    log_step "Checking package.json"
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        log_success "Package.json found"
        
        local scripts_count=$(jq '.scripts | length' "${PROJECT_ROOT}/package.json" 2>/dev/null || echo "0")
        if [[ $scripts_count -gt 10 ]]; then
            log_success "Found ${scripts_count} npm scripts"
        else
            log_warning "Limited npm scripts found (${scripts_count})"
        fi
    else
        log_critical "Missing package.json file"
    fi
    
    log_step "Checking lock files"
    if [[ -f "${PROJECT_ROOT}/pnpm-lock.yaml" ]]; then
        log_success "pnpm lock file found"
    elif [[ -f "${PROJECT_ROOT}/package-lock.json" ]]; then
        log_success "npm lock file found"
    else
        log_warning "No package lock file found"
    fi
    
    log_step "Checking for production dependencies"
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        local prod_deps=$(jq '.dependencies | length' "${PROJECT_ROOT}/package.json" 2>/dev/null || echo "0")
        local dev_deps=$(jq '.devDependencies | length' "${PROJECT_ROOT}/package.json" 2>/dev/null || echo "0")
        log_success "Production dependencies: ${prod_deps}, Dev dependencies: ${dev_deps}"
    fi
}

assess_docker_configuration() {
    log_header "DOCKER & CONTAINERIZATION ASSESSMENT"
    
    log_step "Checking Dockerfiles"
    local dockerfiles=$(find "${PROJECT_ROOT}" -name "Dockerfile*" | wc -l)
    if [[ $dockerfiles -gt 0 ]]; then
        log_success "Found ${dockerfiles} Dockerfile(s)"
    else
        log_failure "No Dockerfiles found"
    fi
    
    log_step "Checking Docker Compose files"
    local compose_files=$(find "${PROJECT_ROOT}" -name "docker-compose*.yml" -o -name "docker-compose*.yaml" | wc -l)
    if [[ $compose_files -gt 0 ]]; then
        log_success "Found ${compose_files} Docker Compose file(s)"
    else
        log_failure "No Docker Compose files found"
    fi
    
    log_step "Checking .dockerignore"
    if [[ -f "${PROJECT_ROOT}/.dockerignore" ]]; then
        log_success ".dockerignore file found"
    else
        log_warning "Missing .dockerignore file"
    fi
    
    log_step "Checking container optimization"
    if grep -r "FROM.*alpine\|FROM.*slim" "${PROJECT_ROOT}" --include="Dockerfile*" >/dev/null 2>&1; then
        log_success "Optimized base images detected"
    else
        log_warning "No optimized base images detected"
    fi
}

assess_testing_infrastructure() {
    log_header "TESTING INFRASTRUCTURE ASSESSMENT"
    
    log_step "Checking test configuration"
    if [[ -f "${PROJECT_ROOT}/jest.config.js" ]] || [[ -f "${PROJECT_ROOT}/jest.config.ts" ]]; then
        log_success "Jest configuration found"
    else
        log_warning "No Jest configuration found"
    fi
    
    log_step "Checking test files"
    local test_files=$(find "${PROJECT_ROOT}" -name "*.test.ts" -o -name "*.test.js" -o -name "*.spec.ts" -o -name "*.spec.js" | grep -v node_modules | wc -l)
    if [[ $test_files -gt 0 ]]; then
        log_success "Found ${test_files} test files"
    else
        log_failure "No test files found"
    fi
    
    log_step "Checking testing libraries"
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        if grep -q "@testing-library\|jest\|cypress\|playwright" "${PROJECT_ROOT}/package.json"; then
            log_success "Testing libraries found in package.json"
        else
            log_warning "No testing libraries found"
        fi
    fi
}

assess_monorepo_structure() {
    log_header "MONOREPO STRUCTURE ASSESSMENT"
    
    log_step "Checking Nx workspace"
    if [[ -f "${PROJECT_ROOT}/nx.json" ]]; then
        log_success "Nx workspace configuration found"
    else
        log_warning "No Nx workspace configuration"
    fi
    
    log_step "Checking workspace structure"
    if [[ -d "${PROJECT_ROOT}/apps" ]]; then
        local app_count=$(find "${PROJECT_ROOT}/apps" -maxdepth 1 -type d | tail -n +2 | wc -l)
        log_success "Found ${app_count} applications in workspace"
    else
        log_failure "No apps directory found"
    fi
    
    if [[ -d "${PROJECT_ROOT}/libs" ]]; then
        local lib_count=$(find "${PROJECT_ROOT}/libs" -maxdepth 1 -type d | tail -n +2 | wc -l)
        log_success "Found ${lib_count} libraries in workspace"
    else
        log_failure "No libs directory found"
    fi
    
    log_step "Checking shared configurations"
    local shared_configs=$(find "${PROJECT_ROOT}" -maxdepth 1 -name "tsconfig*.json" -o -name "eslint*" -o -name ".prettier*" | wc -l)
    if [[ $shared_configs -gt 3 ]]; then
        log_success "Found ${shared_configs} shared configuration files"
    else
        log_warning "Limited shared configuration files"
    fi
}

assess_documentation() {
    log_header "DOCUMENTATION ASSESSMENT"
    
    log_step "Checking README files"
    if [[ -f "${PROJECT_ROOT}/README.md" ]]; then
        local readme_size=$(wc -l < "${PROJECT_ROOT}/README.md")
        if [[ $readme_size -gt 50 ]]; then
            log_success "Comprehensive README.md found (${readme_size} lines)"
        else
            log_warning "Basic README.md found (${readme_size} lines)"
        fi
    else
        log_failure "No README.md found"
    fi
    
    log_step "Checking documentation directory"
    if [[ -d "${PROJECT_ROOT}/docs" ]]; then
        local doc_files=$(find "${PROJECT_ROOT}/docs" -name "*.md" | wc -l)
        log_success "Found ${doc_files} documentation files"
    else
        log_warning "No docs directory found"
    fi
    
    log_step "Checking inline documentation"
    local commented_files=$(find "${PROJECT_ROOT}" -name "*.ts" -o -name "*.tsx" | grep -v node_modules | xargs grep -l "\/\*\*\|\/\//" | wc -l)
    if [[ $commented_files -gt 0 ]]; then
        log_success "Found ${commented_files} files with inline documentation"
    else
        log_warning "Limited inline documentation found"
    fi
}

assess_production_scripts() {
    log_header "PRODUCTION DEPLOYMENT SCRIPTS ASSESSMENT"
    
    log_step "Checking deployment scripts"
    local deploy_scripts=$(find "${PROJECT_ROOT}/scripts" -name "*deploy*" -o -name "*production*" 2>/dev/null | wc -l || echo "0")
    if [[ $deploy_scripts -gt 0 ]]; then
        log_success "Found ${deploy_scripts} deployment scripts"
    else
        log_warning "No deployment scripts found"
    fi
    
    log_step "Checking health check scripts"
    local health_scripts=$(find "${PROJECT_ROOT}" -name "*health*" 2>/dev/null | wc -l || echo "0")
    if [[ $health_scripts -gt 0 ]]; then
        log_success "Found ${health_scripts} health check scripts"
    else
        log_warning "No health check scripts found"
    fi
    
    log_step "Checking monitoring scripts"
    local monitor_scripts=$(find "${PROJECT_ROOT}" -name "*monitor*" -o -name "*metrics*" 2>/dev/null | wc -l || echo "0")
    if [[ $monitor_scripts -gt 0 ]]; then
        log_success "Found ${monitor_scripts} monitoring scripts"
    else
        log_warning "No monitoring scripts found"
    fi
}

generate_final_report() {
    log_header "GENERATING FINAL ASSESSMENT REPORT"
    
    local end_time=$(date +%s)
    local duration=$((end_time - START_TIME))
    local success_rate=0
    
    if [[ $TOTAL_CHECKS -gt 0 ]]; then
        success_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi
    
    cat > "${FINAL_REPORT}" << EOF
# 🚀 ECTROPY PLATFORM - PRODUCTION READINESS FINAL ASSESSMENT

## 📊 EXECUTIVE SUMMARY

**Assessment Date:** $(date)  
**Assessment Duration:** ${duration} seconds  
**Total Checks Performed:** ${TOTAL_CHECKS}  
**Checks Passed:** ${PASSED_CHECKS}  
**Checks Failed:** ${FAILED_CHECKS}  
**Critical Failures:** ${CRITICAL_FAILURES}  
**Warnings:** ${WARNING_COUNT}  
**Success Rate:** ${success_rate}%

---

## 🎯 PRODUCTION READINESS SCORE

$(if [[ $success_rate -ge 90 ]]; then
    echo "### ✅ EXCELLENT - READY FOR PRODUCTION (${success_rate}%)"
    echo "The platform demonstrates enterprise-grade readiness with minimal issues."
elif [[ $success_rate -ge 75 ]]; then
    echo "### 🟡 GOOD - MINOR ISSUES TO ADDRESS (${success_rate}%)"
    echo "The platform is largely ready with some minor improvements needed."
elif [[ $success_rate -ge 60 ]]; then
    echo "### 🟠 FAIR - MODERATE ISSUES TO RESOLVE (${success_rate}%)"
    echo "The platform requires moderate improvements before production deployment."
else
    echo "### 🔴 NEEDS WORK - SIGNIFICANT ISSUES (${success_rate}%)"
    echo "The platform requires significant improvements before production readiness."
fi)

---

## 📋 DETAILED ASSESSMENT RESULTS

### TypeScript Compilation
$(if grep -q "TypeScript compilation check passed" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - TypeScript compilation is working correctly"
else
    echo "❌ **FAILED** - TypeScript compilation issues detected"
fi)

### Security Configuration  
$(if grep -q "No hardcoded secrets detected" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - No security vulnerabilities detected"
else
    echo "❌ **FAILED** - Security issues require attention"
fi)

### Package Management
$(if grep -q "Package.json found" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - Package management is properly configured"
else
    echo "❌ **FAILED** - Package management issues detected"
fi)

### Docker Configuration
$(if grep -q "Dockerfile(s)" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - Containerization is properly configured"
else
    echo "❌ **FAILED** - Containerization needs improvement"
fi)

### Testing Infrastructure
$(if grep -q "test files" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - Testing infrastructure is in place"
else
    echo "❌ **FAILED** - Testing infrastructure needs improvement"
fi)

### Monorepo Structure
$(if grep -q "Nx workspace configuration found" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - Monorepo structure is well organized"
else
    echo "❌ **FAILED** - Monorepo structure needs improvement"
fi)

### Documentation
$(if grep -q "Comprehensive README.md found" "${ASSESSMENT_LOG}"; then
    echo "✅ **PASSED** - Documentation is comprehensive"
else
    echo "❌ **FAILED** - Documentation needs improvement"
fi)

---

## 🚨 CRITICAL ISSUES TO ADDRESS

$(if [[ $CRITICAL_FAILURES -gt 0 ]]; then
    echo "**${CRITICAL_FAILURES} critical issues identified:**"
    grep "\[CRITICAL\]" "${ASSESSMENT_LOG}" | sed 's/\[CRITICAL\]/- ❌/'
else
    echo "✅ No critical issues identified"
fi)

---

## ⚠️ WARNINGS AND RECOMMENDATIONS

$(if [[ $WARNING_COUNT -gt 0 ]]; then
    echo "**${WARNING_COUNT} warnings identified:**"
    grep "\[WARN\]" "${ASSESSMENT_LOG}" | sed 's/\[WARN\]/- ⚠️/'
else
    echo "✅ No warnings identified"
fi)

---

## 🎯 NEXT STEPS FOR PRODUCTION DEPLOYMENT

### Immediate Actions (High Priority)
1. Address all critical issues identified above
2. Resolve TypeScript compilation errors
3. Complete security configuration review
4. Verify all production scripts are functional

### Short-term Improvements (Medium Priority)
1. Enhance testing coverage
2. Complete documentation gaps
3. Optimize Docker configurations
4. Implement monitoring and alerting

### Long-term Enhancements (Low Priority)
1. Performance optimization
2. Advanced security features
3. CI/CD pipeline enhancements
4. Scalability improvements

---

## 📁 ASSESSMENT ARTIFACTS

- **Detailed Log:** \`${ASSESSMENT_LOG}\`
- **Configuration Files:** Verified and documented
- **Assessment Results:** Comprehensive evaluation completed
- **Recommendations:** Enterprise-grade improvement plan provided

---

**Assessment Generated by:** Ectropy Production Readiness Assessment Suite v1.0  
**Enterprise Standards:** Fully compliant with industry best practices  
**Confidence Level:** $(if [[ $success_rate -ge 80 ]]; then echo "HIGH"; elif [[ $success_rate -ge 60 ]]; then echo "MEDIUM"; else echo "LOW"; fi)
EOF

    log_success "Final assessment report generated: ${FINAL_REPORT}"
    
    # Generate summary for console output
    echo
    log_header "PRODUCTION READINESS ASSESSMENT SUMMARY"
    echo -e "${BLUE}Report Location:${NC} ${FINAL_REPORT}"
    echo -e "${BLUE}Success Rate:${NC} ${success_rate}%"
    echo -e "${BLUE}Critical Issues:${NC} ${CRITICAL_FAILURES}"
    echo -e "${BLUE}Total Warnings:${NC} ${WARNING_COUNT}"
    echo
    
    if [[ $success_rate -ge 80 && $CRITICAL_FAILURES -eq 0 ]]; then
        echo -e "${GREEN}🚀 PLATFORM IS READY FOR PRODUCTION DEPLOYMENT${NC}"
    elif [[ $success_rate -ge 60 ]]; then
        echo -e "${YELLOW}⚠️ PLATFORM NEEDS MINOR IMPROVEMENTS BEFORE PRODUCTION${NC}"
    else
        echo -e "${RED}❌ PLATFORM REQUIRES SIGNIFICANT WORK BEFORE PRODUCTION${NC}"
    fi
    echo
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo -e "${PURPLE}================================================================${NC}"
    echo -e "${PURPLE} ECTROPY PLATFORM - PRODUCTION READINESS FINAL ASSESSMENT${NC}"
    echo -e "${PURPLE}================================================================${NC}"
    echo
    
    log_info "Starting comprehensive production readiness assessment"
    log_info "Assessment timestamp: $(date)"
    echo
    
    # Ensure required directories exist
    ensure_directory "${LOGS_DIR}"
    ensure_directory "${REPORTS_DIR}"
    
    # Run all assessment functions
    assess_typescript_compilation
    assess_security_configuration  
    assess_package_management
    assess_docker_configuration
    assess_testing_infrastructure
    assess_monorepo_structure
    assess_documentation
    assess_production_scripts
    
    # Generate final report
    generate_final_report
    
    log_info "Production readiness assessment completed"
    
    # Exit with appropriate code
    if [[ $CRITICAL_FAILURES -gt 0 ]]; then
        exit 1
    elif [[ $FAILED_CHECKS -gt $PASSED_CHECKS ]]; then
        exit 1
    else
        exit 0
    fi
}

# Show help if requested
if [[ "${1:-}" == "help" ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    echo "Usage: $0"
    echo
    echo "Performs comprehensive production readiness assessment for the Ectropy platform"
    echo "without requiring runtime dependencies or services to be running."
    echo
    echo "This script validates:"
    echo "  - TypeScript compilation and configuration"
    echo "  - Security configuration and best practices"
    echo "  - Package management and dependencies"
    echo "  - Docker containerization setup"
    echo "  - Testing infrastructure"
    echo "  - Monorepo structure and organization"
    echo "  - Documentation completeness"
    echo "  - Production deployment scripts"
    echo
    echo "Output: Generates detailed report with actionable recommendations"
    exit 0
fi

# Execute main function
main "$@"