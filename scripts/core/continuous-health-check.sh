#!/bin/bash

# Continuous Health Check - Enterprise Platform Monitoring
# Comprehensive health monitoring with performance metrics and alerting

set -e

# Configuration
HEALTH_REPORT_DIR="reports/health"
PERFORMANCE_THRESHOLD_MS=40000  # 40 seconds for builds
TEST_PASS_THRESHOLD=95          # 95% test pass rate
HEALTH_SCORE_THRESHOLD=90       # 90% overall health score

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

function log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

function log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

function create_health_report_dir() {
    mkdir -p "$HEALTH_REPORT_DIR"
    log_info "Health report directory: $HEALTH_REPORT_DIR"
}

function check_system_requirements() {
    log_info "🔍 Checking system requirements..."
    
    local issues=0
    
    # Node.js version check
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | sed 's/v//')
        if [[ "$NODE_VERSION" =~ ^20\. ]] || [[ "$NODE_VERSION" =~ ^2[1-9]\. ]]; then
            log_success "Node.js version: $NODE_VERSION"
        else
            log_warning "Node.js version $NODE_VERSION may not be optimal (recommended: 20+)"
            ((issues++))
        fi
    else
        log_error "Node.js not found"
        ((issues++))
    fi
    
    # pnpm check
    if command -v pnpm >/dev/null 2>&1; then
        PNPM_VERSION=$(pnpm --version)
        log_success "pnpm version: $PNPM_VERSION"
    else
        log_error "pnpm not found"
        ((issues++))
    fi
    
    # Docker check (optional for development)
    if command -v docker >/dev/null 2>&1; then
        if docker ps >/dev/null 2>&1; then
            log_success "Docker is running"
        else
            log_warning "Docker is installed but not running"
        fi
    else
        log_warning "Docker not found (optional for development)"
    fi
    
    return $issues
}

function validate_esm_configuration() {
    log_info "🔧 Validating ESM configuration..."
    
    if [[ -f "scripts/validate-esm-compatibility.sh" ]]; then
        if timeout 60 ./scripts/validate-esm-compatibility.sh >/dev/null 2>&1; then
            log_success "ESM configuration validation passed"
            return 0
        else
            log_error "ESM configuration validation failed"
            return 1
        fi
    else
        log_warning "ESM validation script not found"
        return 1
    fi
}

function check_secret_management() {
    log_info "🔐 Checking secret management..."
    
    local issues=0
    
    # Check for hardcoded secrets
    if pnpm tsx scripts/validate-no-hardcoded-secrets.ts >/dev/null 2>&1; then
        log_success "No hardcoded secrets detected"
    else
        log_error "Hardcoded secrets detected"
        ((issues++))
    fi
    
    # Check secret rotation workflow
    if [[ -f ".github/workflows/secret-rotation.yml" ]]; then
        log_success "Secret rotation workflow configured"
    else
        log_warning "Secret rotation workflow not found"
        ((issues++))
    fi
    
    # Check environment templates
    local env_templates=(".env.example" ".env.development.template")
    for template in "${env_templates[@]}"; do
        if [[ -f "$template" ]]; then
            log_success "Environment template found: $template"
        else
            log_warning "Environment template missing: $template"
            ((issues++))
        fi
    done
    
    return $issues
}

function validate_build_performance() {
    log_info "🏗️  Validating build performance..."
    
    local issues=0
    local build_start=$(date +%s%3N)
    
    # Test web-dashboard build (primary target)
    if timeout 60 pnpm nx build web-dashboard --skip-nx-cache >/dev/null 2>&1; then
        local build_end=$(date +%s%3N)
        local build_duration=$((build_end - build_start))
        
        if [[ $build_duration -lt $PERFORMANCE_THRESHOLD_MS ]]; then
            log_success "Web dashboard build completed in ${build_duration}ms (under threshold)"
        else
            log_warning "Web dashboard build took ${build_duration}ms (exceeds ${PERFORMANCE_THRESHOLD_MS}ms threshold)"
            ((issues++))
        fi
    else
        log_error "Web dashboard build failed"
        ((issues++))
    fi
    
    # Check bundle size if build succeeded
    if [[ -d "dist/apps/web-dashboard" ]]; then
        local bundle_size=$(du -sb dist/apps/web-dashboard | cut -f1)
        local bundle_size_mb=$((bundle_size / 1024 / 1024))
        
        if [[ $bundle_size_mb -lt 10 ]]; then
            log_success "Bundle size: ${bundle_size_mb}MB (optimized)"
        else
            log_warning "Bundle size: ${bundle_size_mb}MB (consider optimization)"
        fi
    fi
    
    return $issues
}

function run_test_suite() {
    log_info "🧪 Running test suite..."
    
    local test_output
    if test_output=$(timeout 180 pnpm test 2>&1); then
        # Extract test results
        local total_tests=$(echo "$test_output" | grep -o '[0-9]\+ total' | head -1 | grep -o '[0-9]\+')
        local passed_tests=$(echo "$test_output" | grep -o '[0-9]\+ passed' | head -1 | grep -o '[0-9]\+')
        
        if [[ -n "$total_tests" && -n "$passed_tests" ]]; then
            local pass_rate=$((passed_tests * 100 / total_tests))
            
            if [[ $pass_rate -ge $TEST_PASS_THRESHOLD ]]; then
                log_success "Tests: $passed_tests/$total_tests passed (${pass_rate}%)"
                return 0
            else
                log_warning "Tests: $passed_tests/$total_tests passed (${pass_rate}% - below ${TEST_PASS_THRESHOLD}% threshold)"
                return 1
            fi
        else
            log_success "Test suite completed (unable to parse exact results)"
            return 0
        fi
    else
        log_error "Test suite failed or timed out"
        return 1
    fi
}

function validate_api_documentation() {
    log_info "📚 Validating API documentation..."
    
    local issues=0
    
    # Generate API documentation
    if timeout 60 pnpm tsx scripts/generate-api-docs.ts >/dev/null 2>&1; then
        log_success "API documentation generated successfully"
        
        # Check required documentation files
        local doc_files=("docs/API_DOCUMENTATION.md" "docs/api-schema.json" "docs/openapi.yml")
        for doc_file in "${doc_files[@]}"; do
            if [[ -f "$doc_file" ]]; then
                local file_size=$(wc -c < "$doc_file")
                if [[ $file_size -gt 100 ]]; then
                    log_success "Documentation file valid: $doc_file (${file_size} bytes)"
                else
                    log_warning "Documentation file too small: $doc_file"
                    ((issues++))
                fi
            else
                log_error "Documentation file missing: $doc_file"
                ((issues++))
            fi
        done
    else
        log_error "API documentation generation failed"
        ((issues++))
    fi
    
    # Validate endpoints (expect services not running in development)
    if timeout 30 pnpm tsx scripts/validate-endpoints.ts >/dev/null 2>&1; then
        log_success "Endpoint validation completed (services may not be running)"
    else
        log_warning "Endpoint validation had issues"
    fi
    
    return $issues
}

function check_security_compliance() {
    log_info "🔒 Checking security compliance..."
    
    local issues=0
    
    # Run security scanning
    if pnpm tsx scripts/validate-no-hardcoded-secrets.ts >/dev/null 2>&1; then
        log_success "Security scan passed"
    else
        log_error "Security scan failed"
        ((issues++))
    fi
    
    # Check for security-related files
    local security_files=("SECURITY.md" ".github/workflows/secret-rotation.yml")
    for security_file in "${security_files[@]}"; do
        if [[ -f "$security_file" ]]; then
            log_success "Security file present: $security_file"
        else
            log_warning "Security file missing: $security_file"
            ((issues++))
        fi
    done
    
    return $issues
}

function generate_health_report() {
    local overall_issues=$1
    local timestamp=$(date -u +%Y%m%d-%H%M%S)
    local report_file="$HEALTH_REPORT_DIR/continuous-health-$timestamp.json"
    
    log_info "📊 Generating health report..."
    
    # Calculate health score
    local max_possible_issues=20  # Approximate based on all checks
    local health_score=$(( (max_possible_issues - overall_issues) * 100 / max_possible_issues ))
    
    if [[ $health_score -lt 0 ]]; then
        health_score=0
    fi
    
    # Determine health status
    local health_status="POOR"
    if [[ $health_score -ge 90 ]]; then
        health_status="EXCELLENT"
    elif [[ $health_score -ge 80 ]]; then
        health_status="GOOD"
    elif [[ $health_score -ge 70 ]]; then
        health_status="ACCEPTABLE"
    elif [[ $health_score -ge 50 ]]; then
        health_status="NEEDS_ATTENTION"
    fi
    
    # Create JSON report
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "health_score": $health_score,
  "health_status": "$health_status",
  "issues_found": $overall_issues,
  "checks": {
    "system_requirements": "$(check_system_requirements >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")",
    "esm_configuration": "$(validate_esm_configuration >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")",
    "secret_management": "$(check_secret_management >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")",
    "build_performance": "$(validate_build_performance >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")",
    "test_suite": "$(run_test_suite >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")",
    "api_documentation": "$(validate_api_documentation >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")",
    "security_compliance": "$(check_security_compliance >/dev/null 2>&1 && echo "PASS" || echo "ISSUES")"
  },
  "recommendations": [
$(if [[ $overall_issues -gt 0 ]]; then
    echo '    "Review failed checks and address issues",'
    echo '    "Run individual health checks for detailed diagnostics",'
    echo '    "Consider running full development setup if services are needed"'
else
    echo '    "Platform health is excellent",'
    echo '    "Continue with regular monitoring",'
    echo '    "Consider performance optimizations for future scaling"'
fi)
  ]
}
EOF
    
    log_success "Health report saved: $report_file"
    
    # Display summary
    echo ""
    log_info "🎯 HEALTH MONITORING SUMMARY"
    log_info "==========================="
    echo "Health Score: $health_score% ($health_status)"
    echo "Issues Found: $overall_issues"
    echo "Report: $report_file"
    
    # Set exit code based on health score
    if [[ $health_score -ge $HEALTH_SCORE_THRESHOLD ]]; then
        log_success "✅ Platform health is above threshold ($HEALTH_SCORE_THRESHOLD%)"
        return 0
    else
        log_error "❌ Platform health is below threshold ($HEALTH_SCORE_THRESHOLD%)"
        return 1
    fi
}

function setup_continuous_monitoring() {
    log_info "⚙️  Setting up continuous monitoring..."
    
    # Create monitoring script that can be run by cron
    cat > "$HEALTH_REPORT_DIR/monitor.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../.."
./scripts/continuous-health-check.sh --silent >> reports/health/monitoring.log 2>&1
EOF
    
    chmod +x "$HEALTH_REPORT_DIR/monitor.sh"
    
    log_success "Continuous monitoring setup complete"
    log_info "To enable automatic monitoring, add to crontab:"
    log_info "  0 */4 * * * $(pwd)/$HEALTH_REPORT_DIR/monitor.sh"
}

# Main execution
function main() {
    local silent_mode=false
    
    if [[ "$1" == "--silent" ]]; then
        silent_mode=true
        exec 1>/dev/null  # Suppress stdout for silent mode
    fi
    
    if [[ "$silent_mode" == false ]]; then
        echo -e "${CYAN}🏥 ECTROPY PLATFORM - CONTINUOUS HEALTH CHECK${NC}"
        echo -e "${CYAN}=============================================${NC}"
        echo ""
    fi
    
    create_health_report_dir
    
    local total_issues=0
    
    # Run all health checks
    check_system_requirements || ((total_issues += $?))
    validate_esm_configuration || ((total_issues += $?))
    check_secret_management || ((total_issues += $?))
    validate_build_performance || ((total_issues += $?))
    run_test_suite || ((total_issues += $?))
    validate_api_documentation || ((total_issues += $?))
    check_security_compliance || ((total_issues += $?))
    
    # Generate report and determine exit status
    if generate_health_report $total_issues; then
        setup_continuous_monitoring
        exit 0
    else
        exit 1
    fi
}

# Execute main function
main "$@"