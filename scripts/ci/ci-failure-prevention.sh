#!/bin/bash
set -e

# Enterprise CI/CD Failure Prevention and Early Warning System
# Proactive monitoring to prevent CI failures before they happen

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALERTS_DIR="$PROJECT_ROOT/reports/ci-alerts"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR]${NC} $1"
}

log_alert() {
    echo -e "${PURPLE}[$(date '+%Y-%m-%d %H:%M:%S')] [ALERT]${NC} $1"
}

# Initialize failure prevention system
init_failure_prevention() {
    log_info "🛡️ Enterprise CI/CD Failure Prevention System"
    log_info "============================================="
    
    # Create alerts directory
    mkdir -p "$ALERTS_DIR"
    
    # Initialize tracking variables
    export PREVENTION_SCORE=0
    export RISK_FACTORS=0
    export ALERTS=()
    export PREVENTIVE_ACTIONS=()
}

# Monitor for early warning signs of CI failures
monitor_early_warnings() {
    log_info "🔍 Scanning for early warning signs..."
    
    local warnings=0
    cd "$PROJECT_ROOT"
    
    # Check for recent dependency changes without lockfile update
    if [ -n "$(git diff HEAD~1 HEAD -- package.json 2>/dev/null)" ] && [ -z "$(git diff HEAD~1 HEAD -- pnpm-lock.yaml 2>/dev/null)" ]; then
        log_warn "Package.json changed without lockfile update"
        warnings=$((warnings + 1))
        ALERTS+=("DEPENDENCY_DRIFT: package.json modified without pnpm-lock.yaml update")
        PREVENTIVE_ACTIONS+=("Run 'pnpm install' to update lockfile")
    fi
    
    # Check for TypeScript configuration changes
    if [ -n "$(git diff HEAD~5 HEAD -- 'tsconfig*.json' 2>/dev/null)" ]; then
        log_warn "Recent TypeScript configuration changes detected"
        warnings=$((warnings + 1))
        ALERTS+=("CONFIG_CHANGE: TypeScript configuration modified recently")
        PREVENTIVE_ACTIONS+=("Run 'pnpm type-check' to validate configuration")
    fi
    
    # Check for workflow file changes
    if [ -n "$(git diff HEAD~3 HEAD -- .github/workflows/ 2>/dev/null)" ]; then
        log_warn "Recent workflow changes detected"
        warnings=$((warnings + 1))
        ALERTS+=("WORKFLOW_CHANGE: CI workflows modified recently")
        PREVENTIVE_ACTIONS+=("Validate workflow syntax with 'yamllint .github/workflows/'")
    fi
    
    # Check for large binary files that could slow CI
    local large_files=$(find . -name "*.zip" -o -name "*.tar.gz" -o -name "*.dmg" -o -name "*.exe" | head -5)
    if [ -n "$large_files" ]; then
        log_warn "Large binary files detected in repository"
        warnings=$((warnings + 1))
        ALERTS+=("BINARY_BLOAT: Large files may slow CI downloads")
        PREVENTIVE_ACTIONS+=("Consider using Git LFS for large binaries")
    fi
    
    RISK_FACTORS=$((RISK_FACTORS + warnings))
    return $warnings
}

# Monitor dependency health proactively
monitor_dependency_risks() {
    log_info "📦 Monitoring dependency health risks..."
    
    local risks=0
    cd "$PROJECT_ROOT"
    
    # Check for dependency conflicts
    if ! pnpm install --frozen-lockfile --dry-run >/dev/null 2>&1; then
        log_error "Dependency conflicts detected"
        risks=$((risks + 1))
        ALERTS+=("DEPENDENCY_CONFLICT: Lockfile inconsistency will cause CI failure")
        PREVENTIVE_ACTIONS+=("URGENT: Run 'pnpm install --no-frozen-lockfile' to resolve conflicts")
    fi
    
    # Check for deprecated dependencies
    local deprecated=$(pnpm audit --audit-level low --reporter json 2>/dev/null | jq -r '.advisories | keys[]' 2>/dev/null | wc -l || echo "0")
    if [ "$deprecated" -gt 0 ]; then
        log_warn "$deprecated deprecated dependencies found"
        risks=$((risks + 1))
        ALERTS+=("DEPRECATION_RISK: $deprecated deprecated dependencies may cause future failures")
        PREVENTIVE_ACTIONS+=("Schedule dependency updates during next maintenance window")
    fi
    
    # Check for missing peer dependencies
    local peer_deps=$(pnpm list --depth 0 2>&1 | grep "WARN.*peer dep" | wc -l || echo "0")
    if [ "$peer_deps" -gt 0 ]; then
        log_warn "$peer_deps peer dependency warnings"
        risks=$((risks + 1))
        ALERTS+=("PEER_DEPENDENCY: $peer_deps peer dependency warnings may cause build issues")
        PREVENTIVE_ACTIONS+=("Review and install missing peer dependencies")
    fi
    
    RISK_FACTORS=$((RISK_FACTORS + risks))
    return $risks
}

# Monitor build and test stability
monitor_build_stability() {
    log_info "🏗️ Monitoring build and test stability..."
    
    local stability_issues=0
    cd "$PROJECT_ROOT"
    
    # Check for flaky tests (tests that sometimes pass/fail)
    if [ -d "test-results" ] && [ -n "$(find test-results -name "*.xml" -mtime -7 2>/dev/null)" ]; then
        # Look for test files with recent failures
        local flaky_tests=$(grep -l "failures.*[1-9]" test-results/*.xml 2>/dev/null | wc -l || echo "0")
        if [ "$flaky_tests" -gt 0 ]; then
            log_warn "$flaky_tests test suites have recent failures"
            stability_issues=$((stability_issues + 1))
            ALERTS+=("FLAKY_TESTS: $flaky_tests test suites showing instability")
            PREVENTIVE_ACTIONS+=("Review failing tests and improve reliability")
        fi
    fi
    
    # Check for TypeScript errors that might break builds
    if ! pnpm type-check >/dev/null 2>&1; then
        log_warn "TypeScript type checking issues detected"
        stability_issues=$((stability_issues + 1))
        ALERTS+=("TYPE_ERRORS: TypeScript issues may cause build failures")
        PREVENTIVE_ACTIONS+=("Fix TypeScript errors with 'pnpm type-check'")
    fi
    
    # Check for ESLint issues that might fail CI
    local lint_errors=$(pnpm lint 2>&1 | grep "error" | wc -l || echo "0")
    if [ "$lint_errors" -gt 0 ]; then
        log_warn "$lint_errors ESLint errors detected"
        stability_issues=$((stability_issues + 1))
        ALERTS+=("LINT_ERRORS: $lint_errors linting errors will fail CI")
        PREVENTIVE_ACTIONS+=("Fix linting errors with 'pnpm lint --fix'")
    fi
    
    RISK_FACTORS=$((RISK_FACTORS + stability_issues))
    return $stability_issues
}

# Monitor security risks
monitor_security_risks() {
    log_info "🔒 Monitoring security risks..."
    
    local security_risks=0
    cd "$PROJECT_ROOT"
    
    # Check for potential secret leaks
    if ! "$SCRIPT_DIR/validate-ci-readiness.sh" >/dev/null 2>&1; then
        log_error "Security validation failures detected"
        security_risks=$((security_risks + 1))
        ALERTS+=("SECURITY_RISK: Security validation failing - CI will be blocked")
        PREVENTIVE_ACTIONS+=("URGENT: Run './scripts/validate-ci-readiness.sh' and fix issues")
    fi
    
    # Check for outdated security dependencies
    local security_vulns=$(pnpm audit --audit-level high --reporter json 2>/dev/null | jq -r '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' 2>/dev/null || echo "0")
    if [ "$security_vulns" -gt 0 ]; then
        log_warn "$security_vulns high/critical security vulnerabilities"
        security_risks=$((security_risks + 1))
        ALERTS+=("SECURITY_VULNS: $security_vulns high/critical vulnerabilities need attention")
        PREVENTIVE_ACTIONS+=("Run 'pnpm audit --fix' to resolve security issues")
    fi
    
    # Check for insecure file permissions
    local insecure_files=$(find .github/ -name "*.yml" -perm 777 2>/dev/null | wc -l || echo "0")
    if [ "$insecure_files" -gt 0 ]; then
        log_warn "$insecure_files workflow files have overly permissive permissions"
        security_risks=$((security_risks + 1))
        ALERTS+=("FILE_PERMISSIONS: Insecure file permissions detected")
        PREVENTIVE_ACTIONS+=("Fix file permissions with './scripts/fix-file-permissions.sh'")
    fi
    
    RISK_FACTORS=$((RISK_FACTORS + security_risks))
    return $security_risks
}

# Generate preventive action plan
generate_action_plan() {
    log_info "📋 Generating preventive action plan..."
    
    local timestamp=$(date '+%Y%m%d-%H%M%S')
    local alert_file="$ALERTS_DIR/ci-alerts-$timestamp.json"
    
    # Calculate prevention score (100 - risk factors)
    PREVENTION_SCORE=$((100 - (RISK_FACTORS * 10)))
    if [ $PREVENTION_SCORE -lt 0 ]; then
        PREVENTION_SCORE=0
    fi
    
    # Generate alert report
    cat > "$alert_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "prevention_score": $PREVENTION_SCORE,
  "risk_factors": $RISK_FACTORS,
  "alerts": [
$(IFS=$'\n'; printf '    "%s"' "${ALERTS[*]}" | sed 's/$/,/g' | sed '$s/,$//g')
  ],
  "preventive_actions": [
$(IFS=$'\n'; printf '    "%s"' "${PREVENTIVE_ACTIONS[*]}" | sed 's/$/,/g' | sed '$s/,$//g')
  ],
  "risk_level": "$([ $RISK_FACTORS -eq 0 ] && echo "low" || [ $RISK_FACTORS -le 2 ] && echo "medium" || echo "high")",
  "recommendation": "$([ $RISK_FACTORS -eq 0 ] && echo "Continue with normal CI operations" || [ $RISK_FACTORS -le 2 ] && echo "Address warnings before next CI run" || echo "Take immediate action to prevent CI failures")"
}
EOF
    
    log_info "🚨 Alert report saved: $alert_file"
    echo "$alert_file"
}

# Display prevention summary
display_prevention_summary() {
    local alert_file=$1
    
    echo ""
    echo "========================================"
    log_info "CI/CD FAILURE PREVENTION SUMMARY"
    echo "========================================"
    
    if [ $RISK_FACTORS -eq 0 ]; then
        log_success "🛡️ Prevention Score: $PREVENTION_SCORE% - LOW RISK"
        log_success "✅ No immediate CI failure risks detected"
    elif [ $RISK_FACTORS -le 2 ]; then
        log_warn "⚠️ Prevention Score: $PREVENTION_SCORE% - MEDIUM RISK"
        log_warn "🔧 $RISK_FACTORS risk factors require attention"
    else
        log_error "🚨 Prevention Score: $PREVENTION_SCORE% - HIGH RISK"
        log_error "⚡ $RISK_FACTORS critical risk factors - immediate action required"
    fi
    
    if [ ${#ALERTS[@]} -gt 0 ]; then
        echo ""
        log_alert "🚨 Active Alerts:"
        for alert in "${ALERTS[@]}"; do
            log_alert "  • $alert"
        done
    fi
    
    if [ ${#PREVENTIVE_ACTIONS[@]} -gt 0 ]; then
        echo ""
        log_info "🔧 Recommended Preventive Actions:"
        for action in "${PREVENTIVE_ACTIONS[@]}"; do
            log_info "  → $action"
        done
    fi
    
    echo ""
    log_info "📊 Full alert report: $alert_file"
    
    # Return exit code based on risk level
    if [ $RISK_FACTORS -gt 2 ]; then
        return 2  # High risk
    elif [ $RISK_FACTORS -gt 0 ]; then
        return 1  # Medium risk
    else
        return 0  # Low risk
    fi
}

# Main prevention monitoring function
main() {
    init_failure_prevention
    
    log_info "Starting proactive CI/CD failure prevention monitoring..."
    log_info "Repository: $PROJECT_ROOT"
    
    # Run prevention monitoring
    monitor_early_warnings
    monitor_dependency_risks
    monitor_build_stability
    monitor_security_risks
    
    # Generate and display prevention plan
    local alert_file=$(generate_action_plan)
    display_prevention_summary "$alert_file"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi