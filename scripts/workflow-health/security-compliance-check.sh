#!/bin/bash

# =============================================================================
# CI/CD WORKFLOW SECURITY COMPLIANCE CHECKER
# =============================================================================
# Validates workflows against enterprise security standards and compliance requirements
# Implements OWASP CI/CD Security Guidelines and enterprise governance policies
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
REPORTS_DIR="$PROJECT_ROOT/reports/workflow-security"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
WORKFLOW_DIR="$PROJECT_ROOT/.github/workflows"

# Security compliance standards
SECURITY_SCORE_TARGET=100
CRITICAL_VULNERABILITIES_ALLOWED=0
HIGH_VULNERABILITIES_ALLOWED=0
MEDIUM_VULNERABILITIES_ALLOWED=5

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_header() { echo -e "${PURPLE}🔍 $1${NC}"; }
log_critical() { echo -e "${RED}🚨 CRITICAL: $1${NC}"; }

# Global security tracking
TOTAL_SECURITY_CHECKS=0
PASSED_SECURITY_CHECKS=0
FAILED_SECURITY_CHECKS=0
CRITICAL_ISSUES=0
HIGH_ISSUES=0
MEDIUM_ISSUES=0
LOW_ISSUES=0

# Initialize reports directory
init_reports() {
    mkdir -p "$REPORTS_DIR"
    log_info "Workflow security reports directory initialized: $REPORTS_DIR"
}

# Check for hardcoded secrets and credentials
check_hardcoded_secrets() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking for hardcoded secrets: $workflow_name"
    
    local issues_found=0
    local security_report="$REPORTS_DIR/secrets-$workflow_name-$TIMESTAMP.txt"
    
    # Patterns that indicate potential hardcoded secrets
    local secret_patterns=(
        'password\s*[:=]\s*["\'"'"'][^"'"'"']{8,}["\'"'"']'
        'secret\s*[:=]\s*["\'"'"'][^"'"'"']{8,}["\'"'"']'
        'token\s*[:=]\s*["\'"'"'][^"'"'"']{16,}["\'"'"']'
        'key\s*[:=]\s*["\'"'"'][^"'"'"']{16,}["\'"'"']'
        'api[_-]?key\s*[:=]\s*["\'"'"'][^"'"'"']{8,}["\'"'"']'
        'access[_-]?token\s*[:=]\s*["\'"'"'][^"'"'"']{16,}["\'"'"']'
        'private[_-]?key\s*[:=]\s*["\'"'"'][^"'"'"']{20,}["\'"'"']'
        'client[_-]?secret\s*[:=]\s*["\'"'"'][^"'"'"']{16,}["\'"'"']'
        'database[_-]?url\s*[:=]\s*["\'"'"'][^"'"'"']*:[^"'"'"']*@[^"'"'"']*["\'"'"']'
        'mongodb://[^:]*:[^@]*@'
        'postgresql://[^:]*:[^@]*@'
        'mysql://[^:]*:[^@]*@'
        'redis://:[^@]*@'
    )
    
    echo "Security scan for hardcoded secrets: $workflow_name" > "$security_report"
    echo "Scan timestamp: $(date -Iseconds)" >> "$security_report"
    echo "=" >> "$security_report"
    
    for pattern in "${secret_patterns[@]}"; do
        if grep -iP "$pattern" "$workflow_file" | grep -v '\${{' | grep -v 'secrets\.' | grep -v 'vars\.' | grep -v 'env\.' > /dev/null; then
            log_critical "Potential hardcoded secret found in $workflow_name"
            echo "CRITICAL: Potential hardcoded secret pattern: $pattern" >> "$security_report"
            grep -iP "$pattern" "$workflow_file" | grep -v '\${{' | grep -v 'secrets\.' | grep -v 'vars\.' | grep -v 'env\.' >> "$security_report"
            ((issues_found++))
            ((CRITICAL_ISSUES++))
        fi
    done
    
    # Check for AWS credentials patterns
    if grep -E 'AKIA[0-9A-Z]{16}' "$workflow_file" > /dev/null; then
        log_critical "AWS Access Key ID pattern found in $workflow_name"
        echo "CRITICAL: AWS Access Key ID pattern detected" >> "$security_report"
        ((issues_found++))
        ((CRITICAL_ISSUES++))
    fi
    
    # Check for SSH private key patterns
    if grep -E '-----BEGIN.*PRIVATE KEY-----' "$workflow_file" > /dev/null; then
        log_critical "SSH private key pattern found in $workflow_name"
        echo "CRITICAL: SSH private key pattern detected" >> "$security_report"
        ((issues_found++))
        ((CRITICAL_ISSUES++))
    fi
    
    # Check for JWT tokens
    if grep -E 'eyJ[0-9A-Za-z_-]*\.' "$workflow_file" > /dev/null; then
        log_critical "JWT token pattern found in $workflow_name"
        echo "CRITICAL: JWT token pattern detected" >> "$security_report"
        ((issues_found++))
        ((CRITICAL_ISSUES++))
    fi
    
    if [[ $issues_found -eq 0 ]]; then
        log_success "No hardcoded secrets detected: $workflow_name"
        echo "PASSED: No hardcoded secrets detected" >> "$security_report"
        ((PASSED_SECURITY_CHECKS++))
    else
        log_error "Found $issues_found potential hardcoded secrets: $workflow_name"
        ((FAILED_SECURITY_CHECKS++))
    fi
    
    ((TOTAL_SECURITY_CHECKS++))
    return $issues_found
}

# Validate GitHub Actions security
check_action_security() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking GitHub Actions security: $workflow_name"
    
    local issues_found=0
    local security_report="$REPORTS_DIR/actions-$workflow_name-$TIMESTAMP.txt"
    
    echo "GitHub Actions security scan: $workflow_name" > "$security_report"
    echo "Scan timestamp: $(date -Iseconds)" >> "$security_report"
    echo "=" >> "$security_report"
    
    # Check for actions not pinned to SHA
    local unpinned_actions=0
    while IFS= read -r line; do
        if [[ $line =~ uses:[[:space:]]*([^@]+)@([^[:space:]]+) ]]; then
            local action="${BASH_REMATCH[1]}"
            local version="${BASH_REMATCH[2]}"
            
            # Check if version is a SHA (40 hex characters)
            if [[ ! $version =~ ^[a-f0-9]{40}$ ]] && [[ ! $version =~ ^[a-f0-9]{7}$ ]]; then
                log_warning "Action not pinned to SHA: $action@$version in $workflow_name"
                echo "HIGH: Action not pinned to SHA: $action@$version" >> "$security_report"
                ((unpinned_actions++))
                ((HIGH_ISSUES++))
            fi
        fi
    done < "$workflow_file"
    
    # Check for dangerous actions
    local dangerous_actions=(
        "actions/github-script"
        "peter-evans/create-pull-request"
        "stefanzweifel/git-auto-commit-action"
    )
    
    for dangerous_action in "${dangerous_actions[@]}"; do
        if grep -q "uses: $dangerous_action" "$workflow_file"; then
            log_warning "Potentially dangerous action used: $dangerous_action in $workflow_name"
            echo "MEDIUM: Potentially dangerous action: $dangerous_action" >> "$security_report"
            ((MEDIUM_ISSUES++))
        fi
    done
    
    # Check for third-party actions from untrusted sources
    while IFS= read -r line; do
        if [[ $line =~ uses:[[:space:]]*([^/]+)/([^@]+)@ ]]; then
            local owner="${BASH_REMATCH[1]}"
            local repo="${BASH_REMATCH[2]}"
            
            # Check if it's not from trusted organizations
            local trusted_orgs=("actions" "github" "docker" "hashicorp" "aws-actions" "azure" "google-github-actions")
            local is_trusted=false
            
            for trusted_org in "${trusted_orgs[@]}"; do
                if [[ $owner == $trusted_org ]]; then
                    is_trusted=true
                    break
                fi
            done
            
            if [[ $is_trusted == false ]]; then
                log_info "Third-party action from $owner: $owner/$repo in $workflow_name"
                echo "LOW: Third-party action: $owner/$repo" >> "$security_report"
                ((LOW_ISSUES++))
            fi
        fi
    done < "$workflow_file"
    
    if [[ $unpinned_actions -eq 0 ]]; then
        log_success "All actions properly pinned: $workflow_name"
        ((PASSED_SECURITY_CHECKS++))
    else
        log_error "Found $unpinned_actions unpinned actions: $workflow_name"
        ((FAILED_SECURITY_CHECKS++))
        issues_found=$((issues_found + unpinned_actions))
    fi
    
    ((TOTAL_SECURITY_CHECKS++))
    return $issues_found
}

# Check workflow permissions
check_workflow_permissions() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking workflow permissions: $workflow_name"
    
    local issues_found=0
    local security_report="$REPORTS_DIR/permissions-$workflow_name-$TIMESTAMP.txt"
    
    echo "Workflow permissions security scan: $workflow_name" > "$security_report"
    echo "Scan timestamp: $(date -Iseconds)" >> "$security_report"
    echo "=" >> "$security_report"
    
    # Check if permissions are explicitly defined
    if ! grep -q "^permissions:" "$workflow_file"; then
        log_warning "No explicit permissions defined: $workflow_name"
        echo "MEDIUM: No explicit permissions defined (using default permissions)" >> "$security_report"
        ((MEDIUM_ISSUES++))
        ((issues_found++))
    else
        log_success "Explicit permissions defined: $workflow_name"
    fi
    
    # Check for overly broad permissions
    local dangerous_permissions=(
        "write-all"
        "contents: write"
        "actions: write"
        "checks: write"
        "deployments: write"
        "issues: write"
        "packages: write"
        "pages: write"
        "pull-requests: write"
        "repository-projects: write"
        "security-events: write"
        "statuses: write"
    )
    
    for permission in "${dangerous_permissions[@]}"; do
        if grep -q "$permission" "$workflow_file"; then
            # Check if it's in a comment or legitimate use
            if ! grep "$permission" "$workflow_file" | grep -q "^[[:space:]]*#"; then
                log_warning "Broad permission used: $permission in $workflow_name"
                echo "MEDIUM: Broad permission: $permission" >> "$security_report"
                ((MEDIUM_ISSUES++))
            fi
        fi
    done
    
    # Check for GITHUB_TOKEN usage patterns
    if grep -q "GITHUB_TOKEN" "$workflow_file"; then
        if ! grep -q "permissions:" "$workflow_file"; then
            log_warning "GITHUB_TOKEN used without explicit permissions: $workflow_name"
            echo "HIGH: GITHUB_TOKEN used without explicit permissions" >> "$security_report"
            ((HIGH_ISSUES++))
            ((issues_found++))
        fi
    fi
    
    if [[ $issues_found -eq 0 ]]; then
        ((PASSED_SECURITY_CHECKS++))
    else
        ((FAILED_SECURITY_CHECKS++))
    fi
    
    ((TOTAL_SECURITY_CHECKS++))
    return $issues_found
}

# Check for injection vulnerabilities
check_injection_vulnerabilities() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking for injection vulnerabilities: $workflow_name"
    
    local issues_found=0
    local security_report="$REPORTS_DIR/injection-$workflow_name-$TIMESTAMP.txt"
    
    echo "Injection vulnerability scan: $workflow_name" > "$security_report"
    echo "Scan timestamp: $(date -Iseconds)" >> "$security_report"
    echo "=" >> "$security_report"
    
    # Check for script injection vulnerabilities
    local injection_patterns=(
        '\${{[[:space:]]*github\.event\.head_commit\.message'
        '\${{[[:space:]]*github\.event\.commits\[.*\]\.message'
        '\${{[[:space:]]*github\.event\.pull_request\.title'
        '\${{[[:space:]]*github\.event\.pull_request\.body'
        '\${{[[:space:]]*github\.event\.issue\.title'
        '\${{[[:space:]]*github\.event\.issue\.body'
        '\${{[[:space:]]*github\.event\.comment\.body'
        '\${{[[:space:]]*github\.head_ref'
        '\${{[[:space:]]*github\.base_ref'
    )
    
    for pattern in "${injection_patterns[@]}"; do
        if grep -E "$pattern" "$workflow_file" > /dev/null; then
            log_critical "Potential script injection vulnerability: $workflow_name"
            echo "CRITICAL: Potential script injection pattern: $pattern" >> "$security_report"
            grep -E "$pattern" "$workflow_file" >> "$security_report"
            ((CRITICAL_ISSUES++))
            ((issues_found++))
        fi
    done
    
    # Check for command injection in shell commands
    if grep -E 'run:[[:space:]]*\|' "$workflow_file" | grep -E '\${{' > /dev/null; then
        log_warning "Potential command injection in shell script: $workflow_name"
        echo "HIGH: Potential command injection in shell script" >> "$security_report"
        ((HIGH_ISSUES++))
        ((issues_found++))
    fi
    
    # Check for unsafe environment variable usage
    if grep -E 'env:[[:space:]]*\${{' "$workflow_file" > /dev/null; then
        log_info "Environment variable injection possible: $workflow_name"
        echo "LOW: Environment variable injection possible" >> "$security_report"
        ((LOW_ISSUES++))
    fi
    
    if [[ $issues_found -eq 0 ]]; then
        log_success "No injection vulnerabilities detected: $workflow_name"
        ((PASSED_SECURITY_CHECKS++))
    else
        log_error "Found $issues_found potential injection vulnerabilities: $workflow_name"
        ((FAILED_SECURITY_CHECKS++))
    fi
    
    ((TOTAL_SECURITY_CHECKS++))
    return $issues_found
}

# Check supply chain security
check_supply_chain_security() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking supply chain security: $workflow_name"
    
    local issues_found=0
    local security_report="$REPORTS_DIR/supply-chain-$workflow_name-$TIMESTAMP.txt"
    
    echo "Supply chain security scan: $workflow_name" > "$security_report"
    echo "Scan timestamp: $(date -Iseconds)" >> "$security_report"
    echo "=" >> "$security_report"
    
    # Check for package installation without verification
    if grep -E 'npm install|yarn add|pip install|apt install|brew install' "$workflow_file" > /dev/null; then
        if ! grep -E 'package-lock\.json|yarn\.lock|requirements\.txt|Pipfile\.lock' "$workflow_file" > /dev/null; then
            log_warning "Package installation without lock file verification: $workflow_name"
            echo "MEDIUM: Package installation without lock file verification" >> "$security_report"
            ((MEDIUM_ISSUES++))
            ((issues_found++))
        fi
    fi
    
    # Check for curl/wget without verification
    local download_patterns=(
        'curl.*http[^s]'
        'wget.*http[^s]'
        'curl.*-k'
        'wget.*--no-check-certificate'
    )
    
    for pattern in "${download_patterns[@]}"; do
        if grep -E "$pattern" "$workflow_file" > /dev/null; then
            log_warning "Insecure download detected: $workflow_name"
            echo "HIGH: Insecure download pattern: $pattern" >> "$security_report"
            ((HIGH_ISSUES++))
            ((issues_found++))
        fi
    done
    
    # Check for Docker image without digest
    if grep -E 'docker.*run|image:' "$workflow_file" | grep -v '@sha256:' > /dev/null; then
        log_info "Docker images without digest pinning: $workflow_name"
        echo "LOW: Docker images without digest pinning" >> "$security_report"
        ((LOW_ISSUES++))
    fi
    
    if [[ $issues_found -eq 0 ]]; then
        log_success "Supply chain security checks passed: $workflow_name"
        ((PASSED_SECURITY_CHECKS++))
    else
        log_warning "Found $issues_found supply chain issues: $workflow_name"
        ((FAILED_SECURITY_CHECKS++))
    fi
    
    ((TOTAL_SECURITY_CHECKS++))
    return $issues_found
}

# Check runner security configuration
check_runner_security() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    
    log_info "Checking runner security configuration: $workflow_name"
    
    local issues_found=0
    local security_report="$REPORTS_DIR/runner-$workflow_name-$TIMESTAMP.txt"
    
    echo "Runner security scan: $workflow_name" > "$security_report"
    echo "Scan timestamp: $(date -Iseconds)" >> "$security_report"
    echo "=" >> "$security_report"
    
    # Check for self-hosted runners
    if grep -E 'runs-on:.*self-hosted' "$workflow_file" > /dev/null; then
        log_warning "Self-hosted runners detected: $workflow_name"
        echo "HIGH: Self-hosted runners require additional security considerations" >> "$security_report"
        ((HIGH_ISSUES++))
        ((issues_found++))
    fi
    
    # Check for privileged container usage
    if grep -E 'privileged:|--privileged' "$workflow_file" > /dev/null; then
        log_critical "Privileged container usage detected: $workflow_name"
        echo "CRITICAL: Privileged container usage" >> "$security_report"
        ((CRITICAL_ISSUES++))
        ((issues_found++))
    fi
    
    # Check for host network usage
    if grep -E 'network.*host|--network.*host' "$workflow_file" > /dev/null; then
        log_warning "Host network usage detected: $workflow_name"
        echo "MEDIUM: Host network usage" >> "$security_report"
        ((MEDIUM_ISSUES++))
        ((issues_found++))
    fi
    
    # Check for volume mounts
    if grep -E 'volumes?:|--volume|-v' "$workflow_file" > /dev/null; then
        log_info "Volume mounts detected: $workflow_name"
        echo "LOW: Volume mounts detected (review for security implications)" >> "$security_report"
        ((LOW_ISSUES++))
    fi
    
    if [[ $issues_found -eq 0 ]]; then
        log_success "Runner security configuration acceptable: $workflow_name"
        ((PASSED_SECURITY_CHECKS++))
    else
        log_warning "Found $issues_found runner security issues: $workflow_name"
        ((FAILED_SECURITY_CHECKS++))
    fi
    
    ((TOTAL_SECURITY_CHECKS++))
    return $issues_found
}

# Run comprehensive security compliance check
run_security_compliance_check() {
    local workflow_file="$1"
    local workflow_name="$(basename "$workflow_file" .yml)"
    local report_file="$REPORTS_DIR/compliance-$workflow_name-$TIMESTAMP.json"
    
    log_header "Running security compliance check: $workflow_name"
    
    local start_time=$(date +%s)
    local total_issues=0
    
    # Run all security checks
    local secrets_issues
    secrets_issues=$(check_hardcoded_secrets "$workflow_file")
    total_issues=$((total_issues + secrets_issues))
    
    local actions_issues
    actions_issues=$(check_action_security "$workflow_file")
    total_issues=$((total_issues + actions_issues))
    
    local permissions_issues
    permissions_issues=$(check_workflow_permissions "$workflow_file")
    total_issues=$((total_issues + permissions_issues))
    
    local injection_issues
    injection_issues=$(check_injection_vulnerabilities "$workflow_file")
    total_issues=$((total_issues + injection_issues))
    
    local supply_chain_issues
    supply_chain_issues=$(check_supply_chain_security "$workflow_file")
    total_issues=$((total_issues + supply_chain_issues))
    
    local runner_issues
    runner_issues=$(check_runner_security "$workflow_file")
    total_issues=$((total_issues + runner_issues))
    
    # Calculate security score
    local max_possible_score=100
    local score_deduction=$((total_issues * 5))  # 5 points per issue
    local security_score=$((max_possible_score - score_deduction))
    
    if [[ $security_score -lt 0 ]]; then
        security_score=0
    fi
    
    # Determine compliance level
    local compliance_level="NON_COMPLIANT"
    if [[ $security_score -ge 95 ]]; then
        compliance_level="EXCELLENT"
    elif [[ $security_score -ge 85 ]]; then
        compliance_level="GOOD"
    elif [[ $security_score -ge 70 ]]; then
        compliance_level="ACCEPTABLE"
    elif [[ $security_score -ge 50 ]]; then
        compliance_level="POOR"
    fi
    
    local end_time=$(date +%s)
    local scan_duration=$((end_time - start_time))
    
    # Generate compliance report
    cat > "$report_file" << EOF
{
  "workflow_name": "$workflow_name",
  "workflow_file": "$workflow_file",
  "scan_timestamp": "$(date -Iseconds)",
  "scan_duration_seconds": $scan_duration,
  "security_score": $security_score,
  "compliance_level": "$compliance_level",
  "total_issues": $total_issues,
  "issue_breakdown": {
    "hardcoded_secrets": $secrets_issues,
    "action_security": $actions_issues,
    "permissions": $permissions_issues,
    "injection_vulnerabilities": $injection_issues,
    "supply_chain": $supply_chain_issues,
    "runner_security": $runner_issues
  },
  "severity_breakdown": {
    "critical": $CRITICAL_ISSUES,
    "high": $HIGH_ISSUES,
    "medium": $MEDIUM_ISSUES,
    "low": $LOW_ISSUES
  },
  "compliance_status": "$([ $CRITICAL_ISSUES -eq 0 ] && echo "COMPLIANT" || echo "NON_COMPLIANT")",
  "recommendations": []
}
EOF
    
    # Add recommendations
    if [[ $secrets_issues -gt 0 ]]; then
        echo "    \"Remove hardcoded secrets and use GitHub Secrets\"," >> "$report_file"
    fi
    
    if [[ $actions_issues -gt 0 ]]; then
        echo "    \"Pin GitHub Actions to specific SHA commits\"," >> "$report_file"
    fi
    
    if [[ $injection_issues -gt 0 ]]; then
        echo "    \"Address script injection vulnerabilities\"," >> "$report_file"
    fi
    
    log_success "Security compliance check completed: $workflow_name (Score: $security_score/100)"
    
    return $total_issues
}

# Check all workflows for security compliance
check_all_workflows() {
    log_header "Starting comprehensive security compliance assessment"
    
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
            run_security_compliance_check "$workflow_file"
        else
            log_error "Workflow file not found: $workflow_file"
            ((FAILED_SECURITY_CHECKS++))
        fi
        
        echo ""
    done
}

# Generate comprehensive security summary
generate_security_summary() {
    local summary_file="$REPORTS_DIR/security-compliance-summary-$TIMESTAMP.json"
    
    log_header "Generating security compliance summary"
    
    # Calculate overall compliance score
    local overall_score=100
    if [[ $CRITICAL_ISSUES -gt 0 ]]; then
        overall_score=0  # Critical issues = immediate failure
    elif [[ $HIGH_ISSUES -gt 0 ]]; then
        overall_score=$((100 - (HIGH_ISSUES * 15)))
    elif [[ $MEDIUM_ISSUES -gt 0 ]]; then
        overall_score=$((100 - (MEDIUM_ISSUES * 5)))
    elif [[ $LOW_ISSUES -gt 0 ]]; then
        overall_score=$((100 - (LOW_ISSUES * 1)))
    fi
    
    if [[ $overall_score -lt 0 ]]; then
        overall_score=0
    fi
    
    # Determine compliance status
    local compliance_status="NON_COMPLIANT"
    if [[ $CRITICAL_ISSUES -eq 0 && $HIGH_ISSUES -eq 0 ]]; then
        compliance_status="COMPLIANT"
    fi
    
    # Generate summary JSON
    cat > "$summary_file" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "overall_security_score": $overall_score,
  "compliance_status": "$compliance_status",
  "total_security_checks": $TOTAL_SECURITY_CHECKS,
  "passed_checks": $PASSED_SECURITY_CHECKS,
  "failed_checks": $FAILED_SECURITY_CHECKS,
  "issue_summary": {
    "critical_issues": $CRITICAL_ISSUES,
    "high_issues": $HIGH_ISSUES,
    "medium_issues": $MEDIUM_ISSUES,
    "low_issues": $LOW_ISSUES,
    "total_issues": $((CRITICAL_ISSUES + HIGH_ISSUES + MEDIUM_ISSUES + LOW_ISSUES))
  },
  "compliance_thresholds": {
    "critical_allowed": $CRITICAL_VULNERABILITIES_ALLOWED,
    "high_allowed": $HIGH_VULNERABILITIES_ALLOWED,
    "medium_allowed": $MEDIUM_VULNERABILITIES_ALLOWED
  },
  "next_actions": [
    "Address all critical security issues immediately",
    "Review and fix high-severity vulnerabilities",
    "Implement security scanning in CI/CD pipeline",
    "Regular security compliance monitoring"
  ]
}
EOF
    
    log_success "Security compliance summary generated: $summary_file"
    
    # Display summary
    echo ""
    log_header "SECURITY COMPLIANCE SUMMARY"
    echo "============================"
    log_info "Overall Security Score: $overall_score/100"
    log_info "Compliance Status: $compliance_status"
    log_info "Total Security Checks: $TOTAL_SECURITY_CHECKS"
    log_info "✅ Passed: $PASSED_SECURITY_CHECKS"
    log_info "❌ Failed: $FAILED_SECURITY_CHECKS"
    echo ""
    log_info "Issue Breakdown:"
    log_error "🚨 Critical: $CRITICAL_ISSUES"
    log_warning "⚠️  High: $HIGH_ISSUES"
    log_info "📋 Medium: $MEDIUM_ISSUES"
    log_info "📌 Low: $LOW_ISSUES"
    echo ""
    
    if [[ $compliance_status == "COMPLIANT" ]]; then
        log_success "🎉 All workflows meet security compliance standards"
    else
        log_error "🚨 Security compliance violations detected - immediate action required"
    fi
    
    log_info "📊 Detailed security reports available in: $REPORTS_DIR"
    
    return $([[ $compliance_status == "COMPLIANT" ]] && echo 0 || echo 1)
}

# Main execution function
main() {
    echo ""
    log_header "CI/CD WORKFLOW SECURITY COMPLIANCE CHECKER"
    log_header "Enterprise Security Standards Validation"
    echo "=============================================="
    log_info "Security scan started: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Workflow directory: $WORKFLOW_DIR"
    echo ""
    
    # Initialize
    init_reports
    
    # Run security checks
    check_all_workflows
    
    # Generate summary
    generate_security_summary
    
    echo ""
    log_info "Security scan completed: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    log_info "🔒 Enterprise security compliance assessment complete!"
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [--help]"
        echo ""
        echo "CI/CD Workflow Security Compliance Checker"
        echo ""
        echo "This script validates workflows against enterprise security standards"
        echo "including secret detection, action security, permissions, and injection vulnerabilities."
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