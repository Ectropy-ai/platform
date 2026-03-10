#!/bin/bash

# =============================================================================
# CI/CD WORKFLOW STANDARDIZATION REPORT
# =============================================================================
# Validates workflows against enterprise standardization patterns and best practices
# Ensures consistency across all workflows and compliance with governance policies
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$PROJECT_ROOT/reports/workflow-standardization"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
WORKFLOW_DIR="$PROJECT_ROOT/.github/workflows"

# Standardization thresholds
STANDARDIZATION_TARGET=95  # 95% standardization compliance required
CONSISTENCY_TARGET=90      # 90% pattern consistency required

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "${PURPLE}🔍 $1${NC}"; }

# Standardization tracking
TOTAL_STANDARDS_CHECKS=0
PASSED_STANDARDS_CHECKS=0
FAILED_STANDARDS_CHECKS=0
WARNING_STANDARDS_CHECKS=0

# Standard patterns
declare -A STANDARD_PATTERNS=(
    ["node_version"]="NODE_VERSION: '20'"
    ["pnpm_version"]="pnpm@10.14.0"
    ["checkout_action"]="actions/checkout@"
    ["setup_node_action"]="actions/setup-node@"
    ["cache_action"]="actions/cache@"
    ["upload_artifact_action"]="actions/upload-artifact@"
)

# Initialize reports directory
init_reports() {
    mkdir -p "$REPORTS_DIR"
    log_info "Workflow standardization reports directory initialized: $REPORTS_DIR"
}

# Check naming conventions
check_naming_conventions() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking naming conventions: $workflow_name"
    
    local naming_issues=0
    local naming_report="$REPORTS_DIR/naming-$workflow_name-$TIMESTAMP.txt"
    
    echo "Naming conventions check: $workflow_name" > "$naming_report"
    echo "Timestamp: $(date -Iseconds)" >> "$naming_report"
    echo "=" >> "$naming_report"
    
    # Check workflow file name (should be kebab-case)
    if [[ ! $workflow_name =~ ^[a-z0-9-]+$ ]]; then
        log_warning "Workflow file name not in kebab-case: $workflow_name"
        echo "WARNING: File name not in kebab-case: $workflow_name" >> "$naming_report"
        ((naming_issues++))
        ((WARNING_STANDARDS_CHECKS++))
    else
        log_success "File name follows kebab-case convention: $workflow_name"
        echo "PASS: File name follows kebab-case convention" >> "$naming_report"
    fi
    
    # Check workflow display name
    local display_name=$(grep "^name:" "$workflow_file" | sed 's/name: *//' | tr -d '"')
    if [[ -n "$display_name" ]]; then
        if [[ $display_name =~ ^[A-Z] ]]; then
            log_success "Display name properly capitalized: $display_name"
            echo "PASS: Display name properly capitalized" >> "$naming_report"
        else
            log_warning "Display name should start with capital letter: $display_name"
            echo "WARNING: Display name capitalization: $display_name" >> "$naming_report"
            ((naming_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    fi
    
    # Check job naming conventions
    python3 << EOF
import yaml
import re

try:
    with open('$workflow_file', 'r') as f:
        workflow = yaml.safe_load(f)
    
    jobs = workflow.get('jobs', {})
    naming_issues = 0
    
    for job_name in jobs.keys():
        # Job names should be kebab-case
        if not re.match(r'^[a-z0-9-]+$', job_name):
            print(f"WARNING: Job name not in kebab-case: {job_name}")
            naming_issues += 1
        
        # Job names should be descriptive
        if len(job_name) < 3:
            print(f"WARNING: Job name too short: {job_name}")
            naming_issues += 1
    
    if naming_issues == 0:
        print("PASS: All job names follow conventions")
    
    exit(naming_issues)

except Exception as e:
    print(f"ERROR: Failed to parse workflow: {e}")
    exit(1)
EOF
    
    local job_naming_result=$?
    naming_issues=$((naming_issues + job_naming_result))
    
    if [[ $naming_issues -eq 0 ]]; then
        ((PASSED_STANDARDS_CHECKS++))
    else
        ((FAILED_STANDARDS_CHECKS++))
    fi
    
    ((TOTAL_STANDARDS_CHECKS++))
    return $naming_issues
}

# Check environment variable consistency
check_environment_consistency() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking environment variable consistency: $workflow_name"
    
    local env_issues=0
    local env_report="$REPORTS_DIR/environment-$workflow_name-$TIMESTAMP.txt"
    
    echo "Environment variable consistency check: $workflow_name" > "$env_report"
    echo "Timestamp: $(date -Iseconds)" >> "$env_report"
    echo "=" >> "$env_report"
    
    # Check for standard environment variables
    if grep -q "NODE_VERSION:" "$workflow_file"; then
        if grep -q "NODE_VERSION: '20'" "$workflow_file"; then
            log_success "Node.js version standardized: $workflow_name"
            echo "PASS: Node.js version standardized to 20" >> "$env_report"
        else
            log_warning "Node.js version not standardized: $workflow_name"
            echo "WARNING: Node.js version not standardized to 20" >> "$env_report"
            ((env_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    fi
    
    # Check for pnpm version consistency
    if grep -q "pnpm" "$workflow_file"; then
        if grep -q "pnpm@10.14.0" "$workflow_file"; then
            log_success "PNPM version standardized: $workflow_name"
            echo "PASS: PNPM version standardized to 10.14.0" >> "$env_report"
        else
            log_warning "PNPM version not standardized: $workflow_name"
            echo "WARNING: PNPM version not standardized to 10.14.0" >> "$env_report"
            ((env_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    fi
    
    # Check for CI environment variable
    if grep -q "CI: true" "$workflow_file"; then
        log_success "CI environment variable set: $workflow_name"
        echo "PASS: CI environment variable set" >> "$env_report"
    else
        log_info "CI environment variable not explicitly set: $workflow_name"
        echo "INFO: CI environment variable not explicitly set" >> "$env_report"
    fi
    
    # Check for consistent timeout configuration
    if grep -q "timeout-minutes:" "$workflow_file"; then
        local timeout_values=$(grep "timeout-minutes:" "$workflow_file" | grep -o '[0-9]\+' | sort -u)
        local timeout_count=$(echo "$timeout_values" | wc -l)
        
        if [[ $timeout_count -le 3 ]]; then
            log_success "Consistent timeout values used: $workflow_name"
            echo "PASS: Consistent timeout values: $timeout_values" >> "$env_report"
        else
            log_warning "Too many different timeout values: $workflow_name"
            echo "WARNING: Many different timeout values: $timeout_values" >> "$env_report"
            ((env_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    else
        log_warning "No timeout configuration found: $workflow_name"
        echo "WARNING: No timeout configuration found" >> "$env_report"
        ((env_issues++))
        ((WARNING_STANDARDS_CHECKS++))
    fi
    
    if [[ $env_issues -eq 0 ]]; then
        ((PASSED_STANDARDS_CHECKS++))
    else
        ((FAILED_STANDARDS_CHECKS++))
    fi
    
    ((TOTAL_STANDARDS_CHECKS++))
    return $env_issues
}

# Check action version consistency
check_action_consistency() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking GitHub Actions version consistency: $workflow_name"
    
    local action_issues=0
    local action_report="$REPORTS_DIR/actions-$workflow_name-$TIMESTAMP.txt"
    
    echo "GitHub Actions version consistency check: $workflow_name" > "$action_report"
    echo "Timestamp: $(date -Iseconds)" >> "$action_report"
    echo "=" >> "$action_report"
    
    # Extract all actions and their versions
    python3 << EOF
import re
import sys

action_versions = {}
with open('$workflow_file', 'r') as f:
    content = f.read()

# Find all action usages
action_pattern = r'uses:\s*([^@\s]+)@([^\s]+)'
matches = re.findall(action_pattern, content)

for action, version in matches:
    if action not in action_versions:
        action_versions[action] = set()
    action_versions[action].add(version)

# Check for consistency
issues = 0
for action, versions in action_versions.items():
    if len(versions) > 1:
        print(f"WARNING: Inconsistent versions for {action}: {', '.join(versions)}")
        issues += 1
    else:
        print(f"PASS: Consistent version for {action}: {list(versions)[0]}")

# Check for standard actions
standard_actions = {
    'actions/checkout': 'should be pinned to SHA',
    'actions/setup-node': 'should be pinned to SHA',
    'actions/cache': 'should be pinned to SHA',
    'actions/upload-artifact': 'should be pinned to SHA'
}

for std_action, recommendation in standard_actions.items():
    if std_action in action_versions:
        versions = list(action_versions[std_action])
        # Check if pinned to SHA (40 hex chars)
        if any(re.match(r'^[a-f0-9]{40}$', v) for v in versions):
            print(f"PASS: {std_action} pinned to SHA")
        else:
            print(f"WARNING: {std_action} not pinned to SHA: {versions}")
            issues += 1

sys.exit(issues)
EOF
    
    local action_result=$?
    action_issues=$((action_issues + action_result))
    
    # Check for deprecated actions
    local deprecated_actions=(
        "actions/setup-node@v1"
        "actions/checkout@v1"
        "actions/cache@v1"
        "actions/upload-artifact@v1"
    )
    
    for deprecated in "${deprecated_actions[@]}"; do
        if grep -q "$deprecated" "$workflow_file"; then
            log_warning "Deprecated action used: $deprecated in $workflow_name"
            echo "WARNING: Deprecated action: $deprecated" >> "$action_report"
            ((action_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    done
    
    if [[ $action_issues -eq 0 ]]; then
        ((PASSED_STANDARDS_CHECKS++))
    else
        ((FAILED_STANDARDS_CHECKS++))
    fi
    
    ((TOTAL_STANDARDS_CHECKS++))
    return $action_issues
}

# Check job structure patterns
check_job_structure_patterns() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking job structure patterns: $workflow_name"
    
    local structure_issues=0
    local structure_report="$REPORTS_DIR/structure-$workflow_name-$TIMESTAMP.txt"
    
    echo "Job structure patterns check: $workflow_name" > "$structure_report"
    echo "Timestamp: $(date -Iseconds)" >> "$structure_report"
    echo "=" >> "$structure_report"
    
    python3 << EOF
import yaml
import sys

try:
    with open('$workflow_file', 'r') as f:
        workflow = yaml.safe_load(f)
    
    jobs = workflow.get('jobs', {})
    issues = 0
    
    for job_name, job_config in jobs.items():
        # Check for required job properties
        if 'runs-on' not in job_config:
            print(f"ERROR: Job {job_name} missing runs-on")
            issues += 1
        
        if 'steps' not in job_config:
            print(f"ERROR: Job {job_name} missing steps")
            issues += 1
        
        # Check for recommended properties
        if 'timeout-minutes' not in job_config:
            print(f"WARNING: Job {job_name} missing timeout-minutes")
            issues += 1
        
        # Check step structure
        steps = job_config.get('steps', [])
        for i, step in enumerate(steps):
            if 'name' not in step:
                print(f"WARNING: Step {i+1} in job {job_name} missing name")
                issues += 1
            
            # Check for either 'uses' or 'run'
            if 'uses' not in step and 'run' not in step:
                print(f"ERROR: Step {i+1} in job {job_name} missing uses or run")
                issues += 1
    
    # Check for standard job patterns
    if 'permissions' in workflow:
        print("PASS: Workflow has permissions defined")
    else:
        print("WARNING: Workflow missing permissions definition")
        issues += 1
    
    # Check for concurrency control
    if 'concurrency' in workflow:
        print("PASS: Workflow has concurrency control")
    else:
        print("INFO: Workflow missing concurrency control")
    
    sys.exit(issues)

except Exception as e:
    print(f"ERROR: Failed to parse workflow: {e}")
    sys.exit(1)
EOF
    
    local structure_result=$?
    structure_issues=$((structure_issues + structure_result))
    
    if [[ $structure_issues -eq 0 ]]; then
        ((PASSED_STANDARDS_CHECKS++))
    else
        ((FAILED_STANDARDS_CHECKS++))
    fi
    
    ((TOTAL_STANDARDS_CHECKS++))
    return $structure_issues
}

# Check artifact management patterns
check_artifact_patterns() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking artifact management patterns: $workflow_name"
    
    local artifact_issues=0
    local artifact_report="$REPORTS_DIR/artifacts-$workflow_name-$TIMESTAMP.txt"
    
    echo "Artifact management patterns check: $workflow_name" > "$artifact_report"
    echo "Timestamp: $(date -Iseconds)" >> "$artifact_report"
    echo "=" >> "$artifact_report"
    
    # Check for artifact upload patterns
    if grep -q "actions/upload-artifact" "$workflow_file"; then
        if grep -q "retention-days:" "$workflow_file"; then
            log_success "Artifact retention policy configured: $workflow_name"
            echo "PASS: Artifact retention policy configured" >> "$artifact_report"
        else
            log_warning "Artifact upload without retention policy: $workflow_name"
            echo "WARNING: Artifact upload without retention policy" >> "$artifact_report"
            ((artifact_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
        
        # Check for consistent artifact naming
        local artifact_names=$(grep -A 5 "actions/upload-artifact" "$workflow_file" | grep "name:" | grep -v "actions/upload-artifact" | wc -l)
        if [[ $artifact_names -gt 0 ]]; then
            log_success "Artifact naming found: $workflow_name"
            echo "PASS: Artifact naming configured" >> "$artifact_report"
        else
            log_warning "Artifact uploads without explicit naming: $workflow_name"
            echo "WARNING: Artifact uploads without explicit naming" >> "$artifact_report"
            ((artifact_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    fi
    
    # Check for download artifacts patterns
    if grep -q "actions/download-artifact" "$workflow_file"; then
        log_info "Artifact download detected: $workflow_name"
        echo "INFO: Artifact download patterns detected" >> "$artifact_report"
    fi
    
    if [[ $artifact_issues -eq 0 ]]; then
        ((PASSED_STANDARDS_CHECKS++))
    else
        ((FAILED_STANDARDS_CHECKS++))
    fi
    
    ((TOTAL_STANDARDS_CHECKS++))
    return $artifact_issues
}

# Check error handling patterns
check_error_handling_patterns() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking error handling patterns: $workflow_name"
    
    local error_issues=0
    local error_report="$REPORTS_DIR/error-handling-$workflow_name-$TIMESTAMP.txt"
    
    echo "Error handling patterns check: $workflow_name" > "$error_report"
    echo "Timestamp: $(date -Iseconds)" >> "$error_report"
    echo "=" >> "$error_report"
    
    # Check for continue-on-error usage
    if grep -q "continue-on-error:" "$workflow_file"; then
        local continue_count=$(grep -c "continue-on-error:" "$workflow_file")
        log_info "Continue-on-error patterns found: $continue_count in $workflow_name"
        echo "INFO: Continue-on-error patterns: $continue_count" >> "$error_report"
    fi
    
    # Check for conditional execution (if statements)
    if grep -q "if:" "$workflow_file"; then
        local if_count=$(grep -c "if:" "$workflow_file")
        log_success "Conditional execution patterns found: $if_count in $workflow_name"
        echo "PASS: Conditional execution patterns: $if_count" >> "$error_report"
    else
        log_info "No conditional execution patterns: $workflow_name"
        echo "INFO: No conditional execution patterns found" >> "$error_report"
    fi
    
    # Check for failure handling in critical workflows
    if [[ $workflow_name =~ ^(enterprise-ci|production-workflow|security-enhanced)$ ]]; then
        if ! grep -q "continue-on-error\|if:" "$workflow_file"; then
            log_warning "Critical workflow without error handling: $workflow_name"
            echo "WARNING: Critical workflow without error handling patterns" >> "$error_report"
            ((error_issues++))
            ((WARNING_STANDARDS_CHECKS++))
        fi
    fi
    
    # Check for always() conditions
    if grep -q "always()" "$workflow_file"; then
        log_success "Always() conditions found: $workflow_name"
        echo "PASS: Always() conditions for cleanup found" >> "$error_report"
    fi
    
    if [[ $error_issues -eq 0 ]]; then
        ((PASSED_STANDARDS_CHECKS++))
    else
        ((FAILED_STANDARDS_CHECKS++))
    fi
    
    ((TOTAL_STANDARDS_CHECKS++))
    return $error_issues
}

# Run comprehensive standardization check
run_standardization_check() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    local report_file="$REPORTS_DIR/standardization-$workflow_name-$TIMESTAMP.json"
    
    log_header "Running standardization check: $workflow_name"
    
    local start_time=$(date +%s)
    local total_issues=0
    
    # Run all standardization checks
    local naming_issues
    naming_issues=$(check_naming_conventions "$workflow_file")
    total_issues=$((total_issues + naming_issues))
    
    local env_issues
    env_issues=$(check_environment_consistency "$workflow_file")
    total_issues=$((total_issues + env_issues))
    
    local action_issues
    action_issues=$(check_action_consistency "$workflow_file")
    total_issues=$((total_issues + action_issues))
    
    local structure_issues
    structure_issues=$(check_job_structure_patterns "$workflow_file")
    total_issues=$((total_issues + structure_issues))
    
    local artifact_issues
    artifact_issues=$(check_artifact_patterns "$workflow_file")
    total_issues=$((total_issues + artifact_issues))
    
    local error_issues
    error_issues=$(check_error_handling_patterns "$workflow_file")
    total_issues=$((total_issues + error_issues))
    
    # Calculate standardization score
    local max_checks=6  # Number of check categories
    local failed_checks=$((naming_issues > 0 ? 1 : 0))
    failed_checks=$((failed_checks + (env_issues > 0 ? 1 : 0)))
    failed_checks=$((failed_checks + (action_issues > 0 ? 1 : 0)))
    failed_checks=$((failed_checks + (structure_issues > 0 ? 1 : 0)))
    failed_checks=$((failed_checks + (artifact_issues > 0 ? 1 : 0)))
    failed_checks=$((failed_checks + (error_issues > 0 ? 1 : 0)))
    
    local standardization_score=$(( ((max_checks - failed_checks) * 100) / max_checks ))
    
    # Determine compliance level
    local compliance_level="NON_COMPLIANT"
    if [[ $standardization_score -ge 95 ]]; then
        compliance_level="EXCELLENT"
    elif [[ $standardization_score -ge 85 ]]; then
        compliance_level="GOOD"
    elif [[ $standardization_score -ge 70 ]]; then
        compliance_level="ACCEPTABLE"
    fi
    
    local end_time=$(date +%s)
    local check_duration=$((end_time - start_time))
    
    # Generate standardization report
    cat > "$report_file" << EOF
{
  "workflow_name": "$workflow_name",
  "workflow_file": "$workflow_file",
  "check_timestamp": "$(date -Iseconds)",
  "check_duration_seconds": $check_duration,
  "standardization_score": $standardization_score,
  "compliance_level": "$compliance_level",
  "total_issues": $total_issues,
  "issue_breakdown": {
    "naming_conventions": $naming_issues,
    "environment_consistency": $env_issues,
    "action_consistency": $action_issues,
    "structure_patterns": $structure_issues,
    "artifact_patterns": $artifact_issues,
    "error_handling": $error_issues
  },
  "standardization_targets": {
    "standardization_target": $STANDARDIZATION_TARGET,
    "consistency_target": $CONSISTENCY_TARGET
  },
  "recommendations": []
}
EOF
    
    # Add recommendations
    if [[ $naming_issues -gt 0 ]]; then
        echo "    \"Standardize naming conventions across workflow\"," >> "$report_file"
    fi
    
    if [[ $env_issues -gt 0 ]]; then
        echo "    \"Implement consistent environment variable patterns\"," >> "$report_file"
    fi
    
    if [[ $action_issues -gt 0 ]]; then
        echo "    \"Standardize GitHub Actions versions and pin to SHA\"," >> "$report_file"
    fi
    
    log_success "Standardization check completed: $workflow_name (Score: $standardization_score/100)"
    
    return $total_issues
}

# Check all workflows for standardization
check_all_workflows() {
    log_header "Starting comprehensive workflow standardization assessment"
    
    local active_workflows=(
        "enterprise-ci.yml"
        "staging-workflow.yml"
        "production-workflow.yml"
        "security-enhanced.yml"
        "dependency-health.yml"
        "mcp-index.yml"
        "devcontainer-validation.yml"
    )
    
    log_info "Found ${#active_workflows[@]} workflows to check"
    
    for workflow in "${active_workflows[@]}"; do
        local workflow_file="$WORKFLOW_DIR/$workflow"
        
        if [[ -f "$workflow_file" ]]; then
            run_standardization_check "$workflow_file"
        else
            log_error "Workflow file not found: $workflow_file"
            ((FAILED_STANDARDS_CHECKS++))
        fi
        
        echo ""
    done
}

# Generate standardization summary
generate_standardization_summary() {
    local summary_file="$REPORTS_DIR/standardization-summary-$TIMESTAMP.json"
    
    log_header "Generating workflow standardization summary"
    
    # Calculate compliance rate
    local compliance_rate=0
    if [[ $TOTAL_STANDARDS_CHECKS -gt 0 ]]; then
        compliance_rate=$(( (PASSED_STANDARDS_CHECKS * 100) / TOTAL_STANDARDS_CHECKS ))
    fi
    
    # Determine overall compliance status
    local compliance_status="NON_COMPLIANT"
    if [[ $compliance_rate -ge $STANDARDIZATION_TARGET ]]; then
        compliance_status="COMPLIANT"
    fi
    
    # Generate summary JSON
    cat > "$summary_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "overall_compliance_rate": $compliance_rate,
  "compliance_status": "$compliance_status",
  "total_standards_checks": $TOTAL_STANDARDS_CHECKS,
  "passed_checks": $PASSED_STANDARDS_CHECKS,
  "failed_checks": $FAILED_STANDARDS_CHECKS,
  "warning_checks": $WARNING_STANDARDS_CHECKS,
  "standardization_targets": {
    "standardization_target": $STANDARDIZATION_TARGET,
    "consistency_target": $CONSISTENCY_TARGET
  },
  "next_actions": [
    "Address failed standardization checks",
    "Implement consistent patterns across workflows",
    "Update workflow templates and documentation",
    "Regular standardization compliance monitoring"
  ]
}
EOF
    
    log_success "Standardization summary generated: $summary_file"
    
    # Display summary
    echo ""
    log_header "WORKFLOW STANDARDIZATION SUMMARY"
    echo "================================="
    log_info "Overall Compliance Rate: $compliance_rate% (Target: $STANDARDIZATION_TARGET%)"
    log_info "Compliance Status: $compliance_status"
    log_info "Total Standards Checks: $TOTAL_STANDARDS_CHECKS"
    log_info "✅ Passed: $PASSED_STANDARDS_CHECKS"
    log_info "❌ Failed: $FAILED_STANDARDS_CHECKS"
    log_info "⚠️  Warnings: $WARNING_STANDARDS_CHECKS"
    echo ""
    
    if [[ $compliance_status == "COMPLIANT" ]]; then
        log_success "🎉 Excellent standardization compliance - workflows follow enterprise patterns"
    else
        log_error "🚨 Standardization improvements required - implement consistent patterns"
    fi
    
    log_info "📊 Detailed standardization reports available in: $REPORTS_DIR"
    
    return $([[ $compliance_status == "COMPLIANT" ]] && echo 0 || echo 1)
}

# Main execution function
main() {
    echo ""
    log_header "CI/CD WORKFLOW STANDARDIZATION REPORT"
    log_header "Enterprise Pattern Compliance Assessment"
    echo "=========================================="
    log_info "Standardization check started: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Workflow directory: $WORKFLOW_DIR"
    echo ""
    
    # Check dependencies
    if ! command -v python3 >/dev/null 2>&1; then
        log_error "Python 3 is required for workflow parsing"
        exit 1
    fi
    
    # Initialize
    init_reports
    
    # Run standardization checks
    check_all_workflows
    
    # Generate summary
    generate_standardization_summary
    
    echo ""
    log_info "Standardization check completed: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    log_info "📋 Enterprise standardization assessment complete!"
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [--help]"
        echo ""
        echo "CI/CD Workflow Standardization Report"
        echo ""
        echo "This script validates workflows against enterprise standardization"
        echo "patterns including naming conventions, environment consistency,"
        echo "action versions, and structural patterns."
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac