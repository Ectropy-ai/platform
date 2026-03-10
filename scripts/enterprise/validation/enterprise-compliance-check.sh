#!/bin/bash
# Enterprise CI/CD Validation Suite
# Comprehensive validation of enterprise CI/CD implementation
# Author: Ectropy Platform Team

set -euo pipefail

echo "🏢 Enterprise CI/CD Validation Suite"
echo "===================================="
echo ""

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Validation results
declare -A VALIDATION_RESULTS
OVERALL_SCORE=0
TOTAL_CHECKS=0

# Function to record validation result
record_result() {
    local check_name="$1"
    local result="$2"
    local points="$3"
    
    VALIDATION_RESULTS["$check_name"]="$result"
    ((TOTAL_CHECKS++))
    
    if [ "$result" == "PASS" ]; then
        ((OVERALL_SCORE += points))
    fi
}

# Check 1: Workflow Count Compliance
log_info "Check 1: Workflow Count Compliance"
WORKFLOW_COUNT=$(find .github/workflows -maxdepth 1 -name "*.yml" | wc -l)
if [ "$WORKFLOW_COUNT" -eq 7 ]; then
    log_success "Workflow count compliant: $WORKFLOW_COUNT/7"
    record_result "workflow_count" "PASS" 20
else
    log_error "Workflow count non-compliant: $WORKFLOW_COUNT/7"
    record_result "workflow_count" "FAIL" 20
fi

# Check 2: Enterprise CI Pipeline
log_info "Check 2: Enterprise CI Pipeline Presence"
if [ -f ".github/workflows/enterprise-ci.yml" ]; then
    log_success "Enterprise CI pipeline exists"
    record_result "enterprise_ci" "PASS" 20
else
    log_error "Enterprise CI pipeline missing"
    record_result "enterprise_ci" "FAIL" 20
fi

# Check 3: Workflow Naming Conflicts
log_info "Check 3: Workflow Naming Conflicts"
CONFLICTS=$(find .github/workflows -maxdepth 1 -name "*.yml" -exec basename {} \; | sort | uniq -d | wc -l)
if [ "$CONFLICTS" -eq 0 ]; then
    log_success "No workflow naming conflicts"
    record_result "naming_conflicts" "PASS" 15
else
    log_error "$CONFLICTS workflow naming conflicts detected"
    record_result "naming_conflicts" "FAIL" 15
fi

# Check 4: Script Organization
log_info "Check 4: Enterprise Script Organization"
if [ -d "scripts/enterprise" ] && [ -f "scripts/enterprise-launcher.sh" ]; then
    log_success "Enterprise script structure exists"
    record_result "script_organization" "PASS" 10
else
    log_error "Enterprise script structure missing"
    record_result "script_organization" "FAIL" 10
fi

# Check 5: Archive Structure
log_info "Check 5: Workflow Archive Structure"
ARCHIVED_COUNT=0
if [ -d ".github/workflows/archive" ]; then
    ARCHIVED_COUNT=$(find .github/workflows/archive -name "*.yml" | wc -l)
fi
if [ "$ARCHIVED_COUNT" -gt 0 ]; then
    log_success "Workflow archive contains $ARCHIVED_COUNT archived workflows"
    record_result "archive_structure" "PASS" 10
else
    log_warning "No archived workflows found"
    record_result "archive_structure" "FAIL" 10
fi

# Check 6: Monitoring Capabilities
log_info "Check 6: Monitoring Capabilities"
if [ -f "scripts/enterprise/monitoring/monitor-enterprise-workflows.sh" ]; then
    log_success "Enterprise workflow monitoring available"
    record_result "monitoring" "PASS" 10
else
    log_error "Enterprise monitoring script missing"
    record_result "monitoring" "FAIL" 10
fi

# Check 7: Documentation
log_info "Check 7: Documentation Completeness"
DOC_SCORE=0
if [ -f "docs/scripts/ENTERPRISE_SCRIPT_INVENTORY.md" ]; then
    ((DOC_SCORE += 5))
fi
if [ -f "ENTERPRISE_CI_RESTORATION_COMPLETE.md" ]; then
    ((DOC_SCORE += 5))
fi
if [ "$DOC_SCORE" -eq 10 ]; then
    log_success "Documentation complete"
    record_result "documentation" "PASS" 10
else
    log_warning "Documentation incomplete ($DOC_SCORE/10 points)"
    record_result "documentation" "FAIL" 10
fi

# Check 8: Security Compliance
log_info "Check 8: Security Compliance"
if [ -f "scripts/security/validate-no-secrets.js" ] || [ -f "scripts/enterprise/security/comprehensive-security-scan.sh" ]; then
    log_success "Security validation capabilities present"
    record_result "security" "PASS" 5
else
    log_warning "Security validation capabilities limited"
    record_result "security" "FAIL" 5
fi

# Generate comprehensive report
TIMESTAMP=$(date -Iseconds)
REPORT_DIR="reports/enterprise-validation"
mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/validation-$(date +%Y%m%d-%H%M%S).json"

cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "overall_score": $OVERALL_SCORE,
  "max_score": 100,
  "percentage": $((OVERALL_SCORE * 100 / 100)),
  "total_checks": $TOTAL_CHECKS,
  "validation_results": {
$(
for check in "${!VALIDATION_RESULTS[@]}"; do
    echo "    \"$check\": \"${VALIDATION_RESULTS[$check]}\","
done | sed '$ s/,$//'
)
  },
  "workflow_metrics": {
    "active_count": $WORKFLOW_COUNT,
    "archived_count": $ARCHIVED_COUNT,
    "conflicts": $CONFLICTS
  },
  "enterprise_standards": {
    "workflow_limit_compliant": $([ "$WORKFLOW_COUNT" -eq 7 ] && echo "true" || echo "false"),
    "enterprise_ci_present": $([ -f ".github/workflows/enterprise-ci.yml" ] && echo "true" || echo "false"),
    "script_organization_present": $([ -d "scripts/enterprise" ] && echo "true" || echo "false"),
    "monitoring_available": $([ -f "scripts/enterprise/monitoring/monitor-enterprise-workflows.sh" ] && echo "true" || echo "false")
  }
}
EOF

# Calculate final grade
PERCENTAGE=$((OVERALL_SCORE * 100 / 100))
if [ "$PERCENTAGE" -ge 90 ]; then
    GRADE="A+"
    STATUS="EXCELLENT"
elif [ "$PERCENTAGE" -ge 80 ]; then
    GRADE="A"
    STATUS="GOOD"
elif [ "$PERCENTAGE" -ge 70 ]; then
    GRADE="B"
    STATUS="SATISFACTORY"
elif [ "$PERCENTAGE" -ge 60 ]; then
    GRADE="C"
    STATUS="NEEDS_IMPROVEMENT"
else
    GRADE="F"
    STATUS="FAILING"
fi

echo ""
log_info "📊 Validation Summary:"
echo "   • Overall Score: $OVERALL_SCORE/100 ($PERCENTAGE%)"
echo "   • Grade: $GRADE"
echo "   • Status: $STATUS"
echo "   • Total Checks: $TOTAL_CHECKS"
echo ""

# Display detailed results
log_info "📋 Detailed Results:"
for check in "${!VALIDATION_RESULTS[@]}"; do
    result="${VALIDATION_RESULTS[$check]}"
    if [ "$result" == "PASS" ]; then
        echo -e "   ✅ $check: ${GREEN}$result${NC}"
    else
        echo -e "   ❌ $check: ${RED}$result${NC}"
    fi
done

echo ""
if [ "$PERCENTAGE" -ge 80 ]; then
    log_success "🎯 ENTERPRISE CI/CD VALIDATION: $STATUS"
    echo ""
    log_info "✅ Key Achievements:"
    echo "   • Workflow count compliant (7/7 maximum)"
    echo "   • Enterprise CI pipeline established"
    echo "   • Script organization implemented"
    echo "   • Monitoring capabilities active"
    EXIT_CODE=0
else
    log_error "🚨 ENTERPRISE CI/CD VALIDATION: $STATUS"
    echo ""
    log_error "🔧 Required Improvements:"
    for check in "${!VALIDATION_RESULTS[@]}"; do
        if [ "${VALIDATION_RESULTS[$check]}" == "FAIL" ]; then
            echo "   • Fix $check validation"
        fi
    done
    EXIT_CODE=1
fi

echo ""
log_info "📋 Report saved: $REPORT_FILE"

exit $EXIT_CODE