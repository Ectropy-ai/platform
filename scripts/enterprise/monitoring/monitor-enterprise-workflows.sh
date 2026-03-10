#!/bin/bash
# Enterprise Workflow Monitoring and Validation Script
# Ensures ongoing compliance with enterprise CI/CD standards
# Author: Ectropy Platform Team

set -euo pipefail

# Configuration
readonly MAX_WORKFLOWS=7
readonly ENTERPRISE_CI="enterprise-ci.yml"
readonly REPORT_DIR="reports/workflows"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Output functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Create reports directory
mkdir -p "$REPORT_DIR"

echo "🔍 Enterprise Workflow Monitoring"
echo "=================================="
echo ""

# Check current workflow count
log_info "Checking workflow compliance..."
CURRENT_COUNT=$(find .github/workflows -maxdepth 1 -name "*.yml" -o -name "*.yaml" | grep -v README | wc -l)

# Compliance check
if [ "$CURRENT_COUNT" -eq "$MAX_WORKFLOWS" ]; then
    log_success "Workflow count compliant: $CURRENT_COUNT/$MAX_WORKFLOWS"
    COMPLIANCE_STATUS="COMPLIANT"
elif [ "$CURRENT_COUNT" -lt "$MAX_WORKFLOWS" ]; then
    log_warning "Workflow count below maximum: $CURRENT_COUNT/$MAX_WORKFLOWS"
    COMPLIANCE_STATUS="UNDER_LIMIT"
else
    log_error "Workflow count exceeds limit: $CURRENT_COUNT/$MAX_WORKFLOWS"
    COMPLIANCE_STATUS="NON_COMPLIANT"
fi

# Verify enterprise CI pipeline
log_info "Checking enterprise CI pipeline..."
if [ -f ".github/workflows/$ENTERPRISE_CI" ]; then
    log_success "Enterprise CI pipeline present: $ENTERPRISE_CI"
    ENTERPRISE_CI_STATUS="PRESENT"
else
    log_error "Enterprise CI pipeline missing: $ENTERPRISE_CI"
    ENTERPRISE_CI_STATUS="MISSING"
fi

# List current workflows
log_info "Current active workflows:"
ACTIVE_WORKFLOWS=()
while IFS= read -r -d '' workflow_file; do
    workflow=$(basename "$workflow_file")
    echo "  • $workflow"
    ACTIVE_WORKFLOWS+=("$workflow")
done < <(find .github/workflows -maxdepth 1 -name "*.yml" -print0 | sort -z)

# Check for naming conflicts
log_info "Checking for workflow naming conflicts..."
CONFLICT_CHECK=$(find .github/workflows -maxdepth 1 -name "*.yml" -exec basename {} \; | sort | uniq -d)
if [ -z "$CONFLICT_CHECK" ]; then
    log_success "No workflow naming conflicts detected"
    NAMING_STATUS="NO_CONFLICTS"
else
    log_error "Workflow naming conflicts detected:"
    echo "$CONFLICT_CHECK"
    NAMING_STATUS="CONFLICTS_DETECTED"
fi

# Validate workflow structure
log_info "Validating enterprise workflow structure..."

# Expected workflows
EXPECTED_WORKFLOWS=(
    "$ENTERPRISE_CI"
    "staging-workflow.yml"
    "production-workflow.yml" 
    "security-enhanced.yml"
    "dependency-health.yml"
    "devcontainer-validation.yml"
    "mcp-index.yml"
)

STRUCTURE_ISSUES=0
for expected in "${EXPECTED_WORKFLOWS[@]}"; do
    if [ -f ".github/workflows/$expected" ]; then
        log_success "✓ Required workflow present: $expected"
    else
        log_warning "? Expected workflow missing: $expected"
        ((STRUCTURE_ISSUES++))
    fi
done

# Check for unexpected workflows
for workflow in "${ACTIVE_WORKFLOWS[@]}"; do
    if ! printf '%s\n' "${EXPECTED_WORKFLOWS[@]}" | grep -q "^$workflow$"; then
        log_warning "? Unexpected workflow (review needed): $workflow"
        ((STRUCTURE_ISSUES++))
    fi
done

if [ "$STRUCTURE_ISSUES" -eq 0 ]; then
    log_success "Workflow structure follows enterprise standards"
    STRUCTURE_STATUS="COMPLIANT"
else
    log_warning "Workflow structure has $STRUCTURE_ISSUES issues"
    STRUCTURE_STATUS="ISSUES_DETECTED"
fi

# Generate monitoring report
TIMESTAMP=$(date -Iseconds)
REPORT_FILE="$REPORT_DIR/workflow-monitoring-$(date +%Y%m%d-%H%M%S).json"

cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "compliance": {
    "status": "$COMPLIANCE_STATUS",
    "workflow_count": $CURRENT_COUNT,
    "max_allowed": $MAX_WORKFLOWS,
    "enterprise_ci_status": "$ENTERPRISE_CI_STATUS",
    "naming_status": "$NAMING_STATUS",
    "structure_status": "$STRUCTURE_STATUS"
  },
  "active_workflows": [
$(printf '%s\n' "${ACTIVE_WORKFLOWS[@]}" | sed 's/.*/"&"/' | paste -sd ',' -)
  ],
  "expected_workflows": [
$(printf '%s\n' "${EXPECTED_WORKFLOWS[@]}" | sed 's/.*/"&"/' | paste -sd ',' -)
  ],
  "issues": {
    "structure_issues": $STRUCTURE_ISSUES
  }
}
EOF

# Overall status
echo ""
log_info "📊 Monitoring Summary:"
echo "   • Workflow Count: $CURRENT_COUNT/$MAX_WORKFLOWS"
echo "   • Compliance: $COMPLIANCE_STATUS"
echo "   • Enterprise CI: $ENTERPRISE_CI_STATUS"
echo "   • Naming: $NAMING_STATUS"
echo "   • Structure: $STRUCTURE_STATUS"

# Final compliance determination
if [[ "$COMPLIANCE_STATUS" == "COMPLIANT" && \
      "$ENTERPRISE_CI_STATUS" == "PRESENT" && \
      "$NAMING_STATUS" == "NO_CONFLICTS" && \
      "$STRUCTURE_STATUS" == "COMPLIANT" ]]; then
    echo ""
    log_success "🎯 OVERALL STATUS: ENTERPRISE COMPLIANT"
    OVERALL_STATUS="COMPLIANT"
    EXIT_CODE=0
else
    echo ""
    log_error "🚨 OVERALL STATUS: NON-COMPLIANT"
    OVERALL_STATUS="NON_COMPLIANT"
    EXIT_CODE=1
fi

# Update report with overall status
jq --arg status "$OVERALL_STATUS" '.compliance.overall_status = $status' "$REPORT_FILE" > "$REPORT_FILE.tmp" && mv "$REPORT_FILE.tmp" "$REPORT_FILE"

echo ""
log_info "📋 Monitoring report saved: $REPORT_FILE"

# If non-compliant, provide remediation guidance
if [ "$EXIT_CODE" -ne 0 ]; then
    echo ""
    log_error "🔧 Remediation Required:"
    if [ "$CURRENT_COUNT" -gt "$MAX_WORKFLOWS" ]; then
        echo "   • Archive $(($CURRENT_COUNT - $MAX_WORKFLOWS)) excess workflow(s)"
    fi
    if [ "$ENTERPRISE_CI_STATUS" == "MISSING" ]; then
        echo "   • Create or restore enterprise CI pipeline: $ENTERPRISE_CI"
    fi
    if [ "$NAMING_STATUS" == "CONFLICTS_DETECTED" ]; then
        echo "   • Resolve workflow naming conflicts"
    fi
    if [ "$STRUCTURE_ISSUES" -gt 0 ]; then
        echo "   • Review $STRUCTURE_ISSUES workflow structure issues"
    fi
fi

exit $EXIT_CODE