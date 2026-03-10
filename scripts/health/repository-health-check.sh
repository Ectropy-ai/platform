#!/bin/bash
# Repository Health Check Script
# Automated lint, test, and security scanning for monorepo health monitoring
# Part of enterprise monorepo optimization strategy

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports/health"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')

# Logging functions
log_info() { echo "🔍 $1"; }
log_success() { echo "✅ $1"; }
log_error() { echo "❌ $1" >&2; }
log_warning() { echo "⚠️ $1" >&2; }

# Initialize reports directory
init_reports() {
    mkdir -p "$REPORTS_DIR"
    log_info "Reports directory initialized: $REPORTS_DIR"
}

# Check Nx project consistency
check_nx_projects() {
    log_info "Checking Nx project consistency..."
    
    local consistency_report="$REPORTS_DIR/nx-consistency-$TIMESTAMP.json"
    
    cd "$PROJECT_ROOT"
    
    # Check for missing project.json files
    local missing_configs=()
    
    # Check apps
    for app_dir in apps/*/; do
        if [ -d "$app_dir" ] && [ ! -f "${app_dir}project.json" ]; then
            missing_configs+=("$app_dir")
        fi
    done
    
    # Check libs
    for lib_dir in libs/*/; do
        if [ -d "$lib_dir" ] && [ ! -f "${lib_dir}project.json" ]; then
            missing_configs+=("$lib_dir")
        fi
    done
    
    # Generate consistency report
    local total_projects
    total_projects=$(find apps libs -mindepth 1 -maxdepth 1 -type d | wc -l)
    
    local consistent_projects=$((total_projects - ${#missing_configs[@]}))
    local consistency_percentage=$((consistent_projects * 100 / total_projects))
    
    cat > "$consistency_report" << EOF
{
  "timestamp": "$TIMESTAMP",
  "total_projects": $total_projects,
  "consistent_projects": $consistent_projects,
  "consistency_percentage": $consistency_percentage,
  "missing_configs": $(printf '%s\n' "${missing_configs[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
}
EOF
    
    if [ ${#missing_configs[@]} -eq 0 ]; then
        log_success "All Nx projects have consistent configuration"
    else
        log_warning "Found ${#missing_configs[@]} projects with missing project.json files"
        for config in "${missing_configs[@]}"; do
            log_warning "  Missing: ${config}project.json"
        done
    fi
    
    log_success "Nx consistency report saved: $consistency_report"
}

# Run linting across projects
run_linting() {
    log_info "Running linting across all projects..."
    
    local lint_report="$REPORTS_DIR/lint-$TIMESTAMP.json"
    local lint_summary="$REPORTS_DIR/lint-summary-$TIMESTAMP.txt"
    
    cd "$PROJECT_ROOT"
    
    # Use centralized project detection
    if [ -f "scripts/ci/detect-nx-projects.sh" ]; then
        ./scripts/ci/detect-nx-projects.sh
        local lintable_projects
        lintable_projects=$(cat .github/cache/lintable.txt.json 2>/dev/null || echo "[]")
    else
        local lintable_projects
        lintable_projects=$(pnpm nx show projects --with-target=lint --json || echo "[]")
    fi
    
    local total_projects
    total_projects=$(echo "$lintable_projects" | jq length)
    
    if [ "$total_projects" -eq 0 ]; then
        log_warning "No lintable projects found"
        return 0
    fi
    
    local passed=0
    local failed=0
    local failed_projects=()
    
    # Run lint for each project
    echo "$lintable_projects" | jq -r '.[]' | while read -r project; do
        log_info "Linting project: $project"
        if pnpm nx lint "$project" --quiet > /dev/null 2>&1; then
            echo "PASS: $project" >> "$lint_summary"
            ((passed++))
        else
            echo "FAIL: $project" >> "$lint_summary"
            failed_projects+=("$project")
            ((failed++))
        fi
    done
    
    # Generate lint report
    local success_rate=$((passed * 100 / total_projects))
    
    cat > "$lint_report" << EOF
{
  "timestamp": "$TIMESTAMP",
  "total_projects": $total_projects,
  "passed": $passed,
  "failed": $failed,
  "success_rate": $success_rate,
  "failed_projects": $(printf '%s\n' "${failed_projects[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
}
EOF
    
    log_success "Linting completed: $passed/$total_projects projects passed ($success_rate%)"
    log_success "Lint report saved: $lint_report"
}

# Run security scanning
run_security_scan() {
    log_info "Running security scanning..."
    
    local security_report="$REPORTS_DIR/security-$TIMESTAMP.json"
    
    cd "$PROJECT_ROOT"
    
    # Initialize security report
    local audit_passed=false
    local secrets_clean=true
    local vulnerabilities=0
    
    # Run dependency audit
    log_info "Running dependency security audit..."
    if pnpm audit --audit-level=moderate --json > "$REPORTS_DIR/audit-raw-$TIMESTAMP.json" 2>/dev/null; then
        audit_passed=true
        log_success "Dependency audit passed"
    else
        log_warning "Dependency audit found issues"
        vulnerabilities=$(jq '.vulnerabilities | length' "$REPORTS_DIR/audit-raw-$TIMESTAMP.json" 2>/dev/null || echo "0")
    fi
    
    # Run secrets scanning if available
    if [ -f "scripts/security/secrets-scanner.sh" ]; then
        log_info "Running secrets scanning..."
        if ! ./scripts/security/secrets-scanner.sh scan 2>/dev/null; then
            secrets_clean=false
            log_warning "Secrets scanner found potential issues"
        else
            log_success "No secrets detected"
        fi
    fi
    
    # Generate security report
    cat > "$security_report" << EOF
{
  "timestamp": "$TIMESTAMP",
  "audit_passed": $audit_passed,
  "secrets_clean": $secrets_clean,
  "vulnerabilities_count": $vulnerabilities,
  "overall_security_score": $((audit_passed && secrets_clean ? 100 : vulnerabilities > 10 ? 30 : 70))
}
EOF
    
    log_success "Security scan completed"
    log_success "Security report saved: $security_report"
}

# Check test coverage
check_test_coverage() {
    log_info "Checking test coverage..."
    
    local coverage_report="$REPORTS_DIR/coverage-$TIMESTAMP.json"
    
    cd "$PROJECT_ROOT"
    
    # Use centralized project detection
    if [ -f "scripts/ci/detect-nx-projects.sh" ]; then
        ./scripts/ci/detect-nx-projects.sh
        local testable_projects
        testable_projects=$(cat .github/cache/testable.txt.json 2>/dev/null || echo "[]")
    else
        local testable_projects
        testable_projects=$(pnpm nx show projects --with-target=test --json || echo "[]")
    fi
    
    local total_projects
    total_projects=$(echo "$testable_projects" | jq length)
    
    if [ "$total_projects" -eq 0 ]; then
        log_warning "No testable projects found"
        return 0
    fi
    
    local projects_with_tests=0
    
    # Count projects with actual test files
    echo "$testable_projects" | jq -r '.[]' | while read -r project; do
        local test_files
        test_files=$(find . -path "*/node_modules" -prune -o \( -name "*test*" -o -name "*spec*" \) -type f \( -name "*.ts" -o -name "*.js" \) -print | wc -l)
        if [ "$test_files" -gt 0 ]; then
            ((projects_with_tests++))
        fi
    done
    
    local test_coverage=$((projects_with_tests * 100 / total_projects))
    
    cat > "$coverage_report" << EOF
{
  "timestamp": "$TIMESTAMP",
  "total_testable_projects": $total_projects,
  "projects_with_tests": $projects_with_tests,
  "test_coverage_percentage": $test_coverage
}
EOF
    
    log_success "Test coverage check completed: $projects_with_tests/$total_projects projects have tests ($test_coverage%)"
    log_success "Coverage report saved: $coverage_report"
}

# Generate overall health report
generate_health_report() {
    log_info "Generating overall health report..."
    
    local health_report="$REPORTS_DIR/health-summary-$TIMESTAMP.json"
    
    # Collect data from individual reports
    local nx_consistency=100
    local lint_success=100
    local security_score=100
    local test_coverage=100
    
    # Read from individual reports if they exist
    if [ -f "$REPORTS_DIR/nx-consistency-$TIMESTAMP.json" ]; then
        nx_consistency=$(jq '.consistency_percentage' "$REPORTS_DIR/nx-consistency-$TIMESTAMP.json" 2>/dev/null || echo "100")
    fi
    
    if [ -f "$REPORTS_DIR/lint-$TIMESTAMP.json" ]; then
        lint_success=$(jq '.success_rate' "$REPORTS_DIR/lint-$TIMESTAMP.json" 2>/dev/null || echo "100")
    fi
    
    if [ -f "$REPORTS_DIR/security-$TIMESTAMP.json" ]; then
        security_score=$(jq '.overall_security_score' "$REPORTS_DIR/security-$TIMESTAMP.json" 2>/dev/null || echo "100")
    fi
    
    if [ -f "$REPORTS_DIR/coverage-$TIMESTAMP.json" ]; then
        test_coverage=$(jq '.test_coverage_percentage' "$REPORTS_DIR/coverage-$TIMESTAMP.json" 2>/dev/null || echo "100")
    fi
    
    # Calculate overall health score
    local overall_health=$(( (nx_consistency + lint_success + security_score + test_coverage) / 4 ))
    
    # Determine health status
    local health_status="EXCELLENT"
    if [ "$overall_health" -lt 95 ]; then
        health_status="GOOD"
    fi
    if [ "$overall_health" -lt 85 ]; then
        health_status="FAIR"
    fi
    if [ "$overall_health" -lt 70 ]; then
        health_status="POOR"
    fi
    
    cat > "$health_report" << EOF
{
  "timestamp": "$TIMESTAMP",
  "overall_health_score": $overall_health,
  "health_status": "$health_status",
  "metrics": {
    "nx_consistency": $nx_consistency,
    "lint_success_rate": $lint_success,
    "security_score": $security_score,
    "test_coverage": $test_coverage
  },
  "recommendations": [
    $([ "$nx_consistency" -lt 100 ] && echo "\"Standardize Nx project configurations\",")
    $([ "$lint_success" -lt 95 ] && echo "\"Address linting issues in failing projects\",")
    $([ "$security_score" -lt 90 ] && echo "\"Review and address security vulnerabilities\",")
    $([ "$test_coverage" -lt 80 ] && echo "\"Improve test coverage across projects\",")
    "\"Continue monitoring repository health\""
  ]
}
EOF
    
    log_success "Overall health score: $overall_health% ($health_status)"
    log_success "Health summary saved: $health_report"
    
    # Display key metrics
    log_info "Health Metrics Summary:"
    log_info "  Nx Consistency: ${nx_consistency}%"
    log_info "  Lint Success: ${lint_success}%"
    log_info "  Security Score: ${security_score}%"
    log_info "  Test Coverage: ${test_coverage}%"
}

# Print usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Repository health check script for enterprise monorepo monitoring.

OPTIONS:
    -h, --help              Show this help message
    --nx-only               Check only Nx project consistency
    --lint-only             Run only linting checks
    --security-only         Run only security scanning
    --coverage-only         Check only test coverage
    --skip-nx               Skip Nx consistency checks
    --skip-lint             Skip linting checks
    --skip-security         Skip security scanning
    --skip-coverage         Skip test coverage checks

EXAMPLES:
    $0                      # Full health check
    $0 --lint-only          # Only run linting
    $0 --skip-security      # Skip security scanning
    
EOF
}

# Parse command line arguments
parse_arguments() {
    RUN_NX_CHECK=true
    RUN_LINT_CHECK=true
    RUN_SECURITY_CHECK=true
    RUN_COVERAGE_CHECK=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            --nx-only)
                RUN_LINT_CHECK=false
                RUN_SECURITY_CHECK=false
                RUN_COVERAGE_CHECK=false
                shift
                ;;
            --lint-only)
                RUN_NX_CHECK=false
                RUN_SECURITY_CHECK=false
                RUN_COVERAGE_CHECK=false
                shift
                ;;
            --security-only)
                RUN_NX_CHECK=false
                RUN_LINT_CHECK=false
                RUN_COVERAGE_CHECK=false
                shift
                ;;
            --coverage-only)
                RUN_NX_CHECK=false
                RUN_LINT_CHECK=false
                RUN_SECURITY_CHECK=false
                shift
                ;;
            --skip-nx)
                RUN_NX_CHECK=false
                shift
                ;;
            --skip-lint)
                RUN_LINT_CHECK=false
                shift
                ;;
            --skip-security)
                RUN_SECURITY_CHECK=false
                shift
                ;;
            --skip-coverage)
                RUN_COVERAGE_CHECK=false
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    log_info "Starting repository health check..."
    
    parse_arguments "$@"
    init_reports
    
    # Run selected checks
    if [ "$RUN_NX_CHECK" = "true" ]; then
        check_nx_projects
    fi
    
    if [ "$RUN_LINT_CHECK" = "true" ]; then
        run_linting
    fi
    
    if [ "$RUN_SECURITY_CHECK" = "true" ]; then
        run_security_scan
    fi
    
    if [ "$RUN_COVERAGE_CHECK" = "true" ]; then
        check_test_coverage
    fi
    
    # Generate overall health report
    generate_health_report
    
    log_success "Repository health check completed"
    log_info "Reports saved in: $REPORTS_DIR"
}

# Error handling
trap 'log_error "Repository health check failed with exit code $?"' ERR

# Execute main function
main "$@"