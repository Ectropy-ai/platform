#!/bin/bash
# Enterprise CI/CD Workflow Consolidation Script
# Implements enterprise best practices for workflow management
# Author: Ectropy Platform Team
# Date: 2025-09-08

set -euo pipefail

echo "🏢 Enterprise CI/CD Workflow Consolidation"
echo "=========================================="
echo "Target: Single enterprise CI pipeline + 6 specialized workflows"
echo ""

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Output functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Configuration
readonly MAX_WORKFLOWS=7
readonly ENTERPRISE_CI="enterprise-ci.yml"

# Create directory structure
mkdir -p .github/workflows/archive
mkdir -p .github/workflows/disabled

log_info "Step 1/6: Auditing current workflow state..."

# Count current workflows
CURRENT_COUNT=$(find .github/workflows -maxdepth 1 -name "*.yml" -o -name "*.yaml" | grep -v README | wc -l)
log_info "Current active workflows: $CURRENT_COUNT"

if [ "$CURRENT_COUNT" -le "$MAX_WORKFLOWS" ]; then
    log_warning "Workflow count is already within limits ($CURRENT_COUNT/$MAX_WORKFLOWS)"
    log_info "Checking for redundant CI workflows..."
fi

# List of redundant CI workflows to archive
REDUNDANT_CI_WORKFLOWS=(
    "ci-simple.yml"
    "ci-simple-test.yml"
    "ci-test.yml"
    "ci-working.yml"
)

# List current workflows for audit
log_info "Current active workflows:"
ls -1 .github/workflows/*.yml 2>/dev/null | sed 's|.github/workflows/||' | while read -r workflow; do
    echo "  • $workflow"
done

log_info "Step 2/6: Archiving redundant CI workflows..."

# Archive redundant CI workflows
ARCHIVED_COUNT=0
for workflow in "${REDUNDANT_CI_WORKFLOWS[@]}"; do
    if [ -f ".github/workflows/$workflow" ]; then
        log_success "Archiving redundant CI workflow: $workflow"
        mv ".github/workflows/$workflow" ".github/workflows/archive/"
        ((ARCHIVED_COUNT++))
    else
        log_warning "Redundant workflow not found (already archived?): $workflow"
    fi
done

log_info "Step 3/6: Validating enterprise CI pipeline..."

# Ensure enterprise CI pipeline exists
if [ -f ".github/workflows/$ENTERPRISE_CI" ]; then
    log_success "Enterprise CI pipeline exists: $ENTERPRISE_CI"
else
    log_error "Enterprise CI pipeline not found: $ENTERPRISE_CI"
    log_error "Expected location: .github/workflows/$ENTERPRISE_CI"
    exit 1
fi

log_info "Step 4/6: Validating remaining workflows..."

# Define allowed specialized workflows
ALLOWED_WORKFLOWS=(
    "$ENTERPRISE_CI"
    "staging-workflow.yml"
    "production-workflow.yml"
    "security-enhanced.yml"
    "dependency-health.yml"
    "devcontainer-validation.yml"
    "mcp-index.yml"
)

# Check if any active workflows are not in the allowed list
FINAL_COUNT=0
log_info "Validating remaining active workflows:"
for workflow_file in .github/workflows/*.yml; do
    if [ -f "$workflow_file" ]; then
        workflow=$(basename "$workflow_file")
        FINAL_COUNT=$((FINAL_COUNT + 1))
        
        # Check if workflow is in allowed list
        if printf '%s\n' "${ALLOWED_WORKFLOWS[@]}" | grep -q "^$workflow$"; then
            log_success "✓ $workflow (allowed specialized workflow)"
        else
            log_warning "? $workflow (not in standard enterprise list - review needed)"
        fi
    fi
done

log_info "Step 5/6: Generating compliance report..."

# Generate compliance report
cat > .github/workflows-consolidation-report.md << EOF
# Workflow Consolidation Report

**Date**: $(date -Iseconds)
**Operation**: Enterprise CI/CD Consolidation

## Results Summary

- **Workflows Archived**: $ARCHIVED_COUNT
- **Final Active Count**: $FINAL_COUNT / $MAX_WORKFLOWS
- **Compliance Status**: $([ $FINAL_COUNT -le $MAX_WORKFLOWS ] && echo "✅ COMPLIANT" || echo "❌ NON-COMPLIANT")

## Active Workflows

EOF

# List final active workflows in report
for workflow_file in .github/workflows/*.yml; do
    if [ -f "$workflow_file" ]; then
        workflow=$(basename "$workflow_file")
        echo "- \`$workflow\`" >> .github/workflows-consolidation-report.md
    fi
done

cat >> .github/workflows-consolidation-report.md << EOF

## Archived Workflows

EOF

# List archived workflows in report
if [ -d ".github/workflows/archive" ]; then
    for workflow_file in .github/workflows/archive/*.yml; do
        if [ -f "$workflow_file" ]; then
            workflow=$(basename "$workflow_file")
            echo "- \`$workflow\`" >> .github/workflows-consolidation-report.md
        fi
    done
fi

cat >> .github/workflows-consolidation-report.md << EOF

## Enterprise Standards Compliance

### ✅ Implemented
- Single primary CI pipeline (\`$ENTERPRISE_CI\`)
- Specialized workflows for distinct purposes
- Proper workflow naming conventions
- Archive structure for historical workflows

### 📋 Enterprise Workflow Structure
\`\`\`
.github/workflows/
├── $ENTERPRISE_CI          # Primary CI/CD pipeline
├── staging-workflow.yml         # Staging deployments
├── production-workflow.yml      # Production deployments
├── security-enhanced.yml        # Security scanning
├── dependency-health.yml        # Dependency management
├── devcontainer-validation.yml  # Development environment
├── mcp-index.yml               # MCP agent workflows
├── archive/                    # Historical workflows
└── disabled/                   # Temporarily disabled workflows
\`\`\`

## Next Steps
1. Test enterprise CI pipeline functionality
2. Monitor workflow execution for conflicts
3. Review any non-standard workflows identified
4. Update team documentation with new workflow structure
EOF

log_info "Step 6/6: Final validation..."

# Final compliance check
if [ "$FINAL_COUNT" -le "$MAX_WORKFLOWS" ]; then
    log_success "✅ CONSOLIDATION SUCCESSFUL"
    log_success "   Active workflows: $FINAL_COUNT/$MAX_WORKFLOWS"
    log_success "   Archived workflows: $ARCHIVED_COUNT"
    log_success "   Enterprise CI pipeline: $ENTERPRISE_CI"
else
    log_error "❌ CONSOLIDATION INCOMPLETE"
    log_error "   Active workflows exceed limit: $FINAL_COUNT/$MAX_WORKFLOWS"
    log_error "   Additional consolidation required"
    exit 1
fi

echo ""
log_info "📊 Consolidation Summary:"
echo "   • Primary Pipeline: $ENTERPRISE_CI"
echo "   • Specialized Workflows: $((FINAL_COUNT - 1))"
echo "   • Total Active: $FINAL_COUNT/$MAX_WORKFLOWS"
echo "   • Archived: $ARCHIVED_COUNT workflows"
echo ""
log_success "🎯 Enterprise CI/CD consolidation completed successfully!"
echo ""
log_info "📋 Report saved: .github/workflows-consolidation-report.md"
log_info "🔍 Next: Test consolidated workflows and monitor for conflicts"