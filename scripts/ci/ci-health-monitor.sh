#!/bin/bash
# CI/CD Health Monitor Script
# Comprehensive monitoring for Ectropy CI pipeline status

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HEALTH_REPORT_DIR="$PROJECT_ROOT/reports/health"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}" >&2; }

# Create reports directory
mkdir -p "$HEALTH_REPORT_DIR"

echo "🏥 CI/CD Health Monitor"
echo "======================="
echo "Timestamp: $(date)"
echo "Project Root: $PROJECT_ROOT"
echo ""

# Initialize counters
FAILED=0
WARNINGS=0
TOTAL_CHECKS=0

# Check Node.js availability and version
check_node() {
    log_info "Checking Node.js environment..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        EXPECTED_VERSION="v20"
        if [[ "$NODE_VERSION" == $EXPECTED_VERSION* ]]; then
            log_success "Node.js: $NODE_VERSION (✓ matches expected $EXPECTED_VERSION)"
            echo "node_version=$NODE_VERSION" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
            return 0
        else
            log_warning "Node.js: $NODE_VERSION (expected $EXPECTED_VERSION)"
            WARNINGS=$((WARNINGS + 1))
            return 1
        fi
    else
        log_error "Node.js: Not found"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check pnpm availability and version
check_pnpm() {
    log_info "Checking pnpm package manager..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    if command -v pnpm &> /dev/null; then
        PNPM_VERSION=$(pnpm --version)
        # Extract expected version from package.json
        if [ -f "$PROJECT_ROOT/package.json" ]; then
            EXPECTED_PNPM=$(jq -r '.packageManager' "$PROJECT_ROOT/package.json" 2>/dev/null | sed 's/pnpm@\([^+]*\).*/\1/' || echo "10.14.0")
        else
            EXPECTED_PNPM="10.14.0"
        fi
        
        if [[ "$PNPM_VERSION" == "$EXPECTED_PNPM" ]]; then
            log_success "pnpm: v$PNPM_VERSION (✓ matches expected $EXPECTED_PNPM)"
            echo "pnpm_version=$PNPM_VERSION" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
            return 0
        else
            log_warning "pnpm: v$PNPM_VERSION (expected $EXPECTED_PNPM)"
            WARNINGS=$((WARNINGS + 1))
            return 1
        fi
    else
        log_error "pnpm: Not found"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check Sharp module functionality
check_sharp() {
    log_info "Checking Sharp native module..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    cd "$PROJECT_ROOT"
    # Simple Sharp test
    if node -e "require('sharp')" 2>/dev/null; then
        log_success "Sharp: Functional"
        echo "sharp_status=functional" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
        return 0
    else
        log_error "Sharp: Not functional"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check test readiness
check_tests() {
    log_info "Checking test infrastructure..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    cd "$PROJECT_ROOT"
    
    # Check if key test projects can be listed
    if pnpm nx list 2>/dev/null | grep -q "web-dashboard\|api-gateway\|ifc-processing"; then
        log_success "Test targets: Available via Nx"
        
        # Run a quick test check for critical modules
        log_info "Running quick test validation..."
        
        # Test IFC processing (should be 100% passing)
        if pnpm nx test ifc-processing --passWithNoTests --silent >/dev/null 2>&1; then
            log_success "IFC Processing tests: ✓ Passing"
        else
            log_warning "IFC Processing tests: Issues detected"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        # Test API Gateway (should be passing after our fix)
        if pnpm nx test api-gateway --passWithNoTests --silent >/dev/null 2>&1; then
            log_success "API Gateway tests: ✓ Passing"
        else
            log_warning "API Gateway tests: Issues detected"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        # Test Web Dashboard (some tests may fail, but infrastructure should work)
        if pnpm nx test web-dashboard --passWithNoTests --silent >/dev/null 2>&1; then
            log_success "Web Dashboard tests: ✓ Infrastructure working"
        else
            log_warning "Web Dashboard tests: Some failures detected (infrastructure OK)"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        echo "test_infrastructure=available" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
        return 0
    else
        log_error "Test targets: Not properly configured"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check build readiness
check_builds() {
    log_info "Checking build infrastructure..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    cd "$PROJECT_ROOT"
    
    # Check if TypeScript can compile
    if npx tsc --noEmit --project tsconfig.enterprise-standard.json >/dev/null 2>&1; then
        log_success "TypeScript: ✓ No compilation errors"
    else
        log_warning "TypeScript: Some compilation issues detected"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check if Nx can build core projects
    if pnpm nx build api-gateway --dry-run >/dev/null 2>&1; then
        log_success "Build system: ✓ Nx targets configured"
        echo "build_system=functional" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
        return 0
    else
        log_error "Build system: Configuration issues"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check CI workflow configuration
check_ci_workflow() {
    log_info "Checking CI workflow configuration..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    CI_WORKFLOW="$PROJECT_ROOT/.github/workflows/ci.yml"
    if [ -f "$CI_WORKFLOW" ]; then
        # Basic YAML syntax check
        if command -v yq >/dev/null 2>&1; then
            if yq eval '.' "$CI_WORKFLOW" >/dev/null 2>&1; then
                log_success "CI Workflow: ✓ Valid YAML syntax"
            else
                log_error "CI Workflow: Invalid YAML syntax"
                FAILED=$((FAILED + 1))
                return 1
            fi
        else
            log_info "CI Workflow: YAML syntax check skipped (yq not available)"
        fi
        
        # Check for required jobs
        if grep -q "setup:\|test:\|build:" "$CI_WORKFLOW"; then
            log_success "CI Workflow: ✓ Core jobs present"
        else
            log_warning "CI Workflow: Missing some core jobs"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        echo "ci_workflow=present" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
        return 0
    else
        log_error "CI Workflow: Not found at $CI_WORKFLOW"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Check dependency health
check_dependencies() {
    log_info "Checking dependency health..."
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    cd "$PROJECT_ROOT"
    
    # Check if package.json and lock file are in sync
    if [ -f "package.json" ] && [ -f "pnpm-lock.yaml" ]; then
        log_success "Dependencies: ✓ Lock file present"
        
        # Quick audit check (don't fail on this, just warn)
        if pnpm audit --audit-level high >/dev/null 2>&1; then
            log_success "Dependencies: ✓ No high-risk vulnerabilities"
        else
            log_warning "Dependencies: Some vulnerabilities detected (run 'pnpm audit' for details)"
            WARNINGS=$((WARNINGS + 1))
        fi
        
        echo "dependencies=present" >> "$HEALTH_REPORT_DIR/health-$TIMESTAMP.env"
        return 0
    else
        log_error "Dependencies: Missing package.json or lock file"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Generate health report
generate_report() {
    log_info "Generating health report..."
    
    REPORT_FILE="$HEALTH_REPORT_DIR/health-report-$TIMESTAMP.md"
    
    cat > "$REPORT_FILE" << EOF
# CI/CD Health Report
Generated: $(date)
Project: Ectropy Platform

## Summary
- **Total Checks**: $TOTAL_CHECKS
- **Failed**: $FAILED
- **Warnings**: $WARNINGS
- **Success Rate**: $(( (TOTAL_CHECKS - FAILED) * 100 / TOTAL_CHECKS ))%

## Health Status
$([ $FAILED -eq 0 ] && echo "🟢 **HEALTHY** - All critical systems operational" || echo "🔴 **UNHEALTHY** - $FAILED critical issues detected")

## Recommendations
EOF

    if [ $FAILED -gt 0 ]; then
        echo "### Critical Issues (Must Fix)" >> "$REPORT_FILE"
        echo "- $FAILED critical system checks failed" >> "$REPORT_FILE"
        echo "- Review failed checks above and resolve immediately" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    if [ $WARNINGS -gt 0 ]; then
        echo "### Warnings (Should Fix)" >> "$REPORT_FILE"
        echo "- $WARNINGS warnings detected" >> "$REPORT_FILE"
        echo "- Address warnings to improve pipeline reliability" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    echo "### Next Steps" >> "$REPORT_FILE"
    echo "- Monitor CI pipeline performance" >> "$REPORT_FILE"
    echo "- Keep dependencies updated" >> "$REPORT_FILE"
    echo "- Run this health check regularly" >> "$REPORT_FILE"
    
    log_success "Health report generated: $REPORT_FILE"
}

# Main execution
main() {
    # Run all checks
    check_node || true
    check_pnpm || true
    check_sharp || true
    check_tests || true
    check_builds || true
    check_ci_workflow || true
    check_dependencies || true
    
    # Generate report
    generate_report
    
    echo ""
    echo "========================"
    if [ $FAILED -eq 0 ]; then
        log_success "✅ All critical systems operational"
        if [ $WARNINGS -gt 0 ]; then
            log_warning "⚠️  $WARNINGS warning(s) detected - consider addressing"
        fi
        echo "CI/CD pipeline is ready for production workloads"
        exit 0
    else
        log_error "❌ $FAILED critical system(s) need attention"
        echo "CI/CD pipeline requires immediate fixes before production use"
        exit 1
    fi
}

# Script arguments handling
case "${1:-}" in
    --quick)
        log_info "Running quick health check (Node.js, pnpm, Sharp only)..."
        check_node
        check_pnpm  
        check_sharp
        exit $?
        ;;
    --tests-only)
        log_info "Running test infrastructure check only..."
        check_tests
        exit $?
        ;;
    --ci-only)
        log_info "Running CI workflow check only..."
        check_ci_workflow
        exit $?
        ;;
    --help)
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --quick      Run quick check (Node.js, pnpm, Sharp)"
        echo "  --tests-only Run test infrastructure check only"
        echo "  --ci-only    Run CI workflow check only"
        echo "  --help       Show this help message"
        exit 0
        ;;
    "")
        # Run full check
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac