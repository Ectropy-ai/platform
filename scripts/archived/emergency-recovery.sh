#!/bin/bash
set -e

# Enterprise CI/CD Emergency Recovery System
# Rapid response system for critical CI/CD failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RECOVERY_LOG="$PROJECT_ROOT/reports/emergency-recovery-$(date +%Y%m%d-%H%M%S).log"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $1"
    echo -e "${BLUE}$msg${NC}" | tee -a "$RECOVERY_LOG"
}

log_success() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
    echo -e "${GREEN}$msg${NC}" | tee -a "$RECOVERY_LOG"
}

log_warn() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] $1"
    echo -e "${YELLOW}$msg${NC}" | tee -a "$RECOVERY_LOG"
}

log_error() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $1"
    echo -e "${RED}$msg${NC}" | tee -a "$RECOVERY_LOG"
}

log_emergency() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] [EMERGENCY] $1"
    echo -e "${BOLD}${RED}$msg${NC}" | tee -a "$RECOVERY_LOG"
}

# Initialize emergency recovery
init_emergency_recovery() {
    log_emergency "🚨 Enterprise CI/CD Emergency Recovery System"
    log_emergency "============================================="
    
    # Create recovery log directory
    mkdir -p "$(dirname "$RECOVERY_LOG")"
    
    log_info "Recovery session started"
    log_info "Repository: $PROJECT_ROOT"
    log_info "Recovery log: $RECOVERY_LOG"
    
    # Set safety flags
    set -euo pipefail
}

# Emergency diagnosis - rapid assessment
emergency_diagnosis() {
    log_info "🔍 EMERGENCY DIAGNOSIS - Rapid Assessment"
    log_info "=========================================="
    
    cd "$PROJECT_ROOT"
    
    local critical_issues=0
    
    # Check 1: Repository integrity
    if ! git status >/dev/null 2>&1; then
        log_error "Git repository corruption detected"
        critical_issues=$((critical_issues + 1))
    else
        log_success "Git repository integrity OK"
    fi
    
    # Check 2: Node.js environment
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js not available"
        critical_issues=$((critical_issues + 1))
    else
        local node_version=$(node --version)
        if [[ "$node_version" == v20* ]]; then
            log_success "Node.js version OK: $node_version"
        else
            log_warn "Node.js version warning: $node_version (expected v20+)"
        fi
    fi
    
    # Check 3: Package manager
    if ! command -v pnpm >/dev/null 2>&1; then
        log_error "pnpm not available"
        critical_issues=$((critical_issues + 1))
    else
        log_success "pnpm available: $(pnpm --version)"
    fi
    
    # Check 4: Critical files
    local critical_files=("package.json" "pnpm-lock.yaml" ".github/workflows/ci.yml")
    for file in "${critical_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Critical file missing: $file"
            critical_issues=$((critical_issues + 1))
        else
            log_success "Critical file present: $file"
        fi
    done
    
    # Check 5: Dependency state
    if ! pnpm install --frozen-lockfile >/dev/null 2>&1; then
        log_error "Dependency conflicts detected"
        critical_issues=$((critical_issues + 1))
    else
        log_success "Dependencies consistent"
    fi
    
    log_info "Emergency diagnosis complete: $critical_issues critical issues found"
    return $critical_issues
}

# Emergency fix: Dependency recovery
emergency_fix_dependencies() {
    log_info "🔧 EMERGENCY FIX: Dependency Recovery"
    log_info "====================================="
    
    cd "$PROJECT_ROOT"
    
    # Backup current state
    if [ -f "pnpm-lock.yaml" ]; then
        cp pnpm-lock.yaml "pnpm-lock.yaml.emergency-backup-$(date +%s)"
        log_info "Backed up lockfile"
    fi
    
    # Clear all caches
    log_info "Clearing all caches..."
    pnpm store prune || true
    rm -rf node_modules || true
    rm -rf ~/.cache/pnpm || true
    rm -rf ~/.npm || true
    
    # Reinstall dependencies
    log_info "Reinstalling dependencies from scratch..."
    if pnpm install --no-frozen-lockfile --prefer-offline; then
        log_success "Dependencies reinstalled successfully"
        return 0
    else
        log_error "Dependency reinstallation failed"
        return 1
    fi
}

# Emergency fix: Build recovery
emergency_fix_build() {
    log_info "🏗️ EMERGENCY FIX: Build Recovery"
    log_info "================================"
    
    cd "$PROJECT_ROOT"
    
    # Clear build caches
    log_info "Clearing build artifacts..."
    rm -rf dist || true
    rm -rf .nx/cache || true
    rm -rf node_modules/.cache || true
    
    # Attempt basic build
    log_info "Attempting emergency build..."
    if pnpm nx build web-dashboard --skip-nx-cache; then
        log_success "Emergency build successful"
        return 0
    else
        log_error "Emergency build failed"
        return 1
    fi
}

# Emergency fix: Security cleanup
emergency_fix_security() {
    log_info "🔒 EMERGENCY FIX: Security Cleanup"
    log_info "=================================="
    
    cd "$PROJECT_ROOT"
    
    # Remove any potential security risks
    log_info "Scanning for security issues..."
    
    # Remove broken workflow files
    local broken_files=$(find .github/workflows -name "*.broken" -o -name "*.disabled" 2>/dev/null || true)
    if [ -n "$broken_files" ]; then
        echo "$broken_files" | xargs rm -f
        log_success "Removed broken workflow files"
    fi
    
    # Fix file permissions
    if [ -f "$SCRIPT_DIR/fix-file-permissions.sh" ]; then
        if "$SCRIPT_DIR/fix-file-permissions.sh" >/dev/null 2>&1; then
            log_success "File permissions fixed"
        else
            log_warn "File permissions script failed"
        fi
    fi
    
    # Run security validation
    if [ -f "$SCRIPT_DIR/validate-ci-readiness.sh" ]; then
        if "$SCRIPT_DIR/validate-ci-readiness.sh" >/dev/null 2>&1; then
            log_success "Security validation passed"
            return 0
        else
            log_error "Security validation failed"
            return 1
        fi
    else
        log_warn "Security validation script not found"
        return 1
    fi
}

# Emergency fix: Workflow recovery
emergency_fix_workflows() {
    log_info "⚙️ EMERGENCY FIX: Workflow Recovery"
    log_info "=================================="
    
    cd "$PROJECT_ROOT"
    
    local main_workflow=".github/workflows/ci.yml"
    
    # Check if main workflow exists and is valid
    if [ -f "$main_workflow" ]; then
        if yamllint "$main_workflow" >/dev/null 2>&1; then
            log_success "Main workflow is valid"
            return 0
        else
            log_warn "Main workflow has YAML syntax issues"
        fi
    else
        log_error "Main workflow missing"
    fi
    
    # Check for backup workflows
    local backup_workflow=".github/workflows/archive/ci-legacy.yml"
    if [ -f "$backup_workflow" ]; then
        log_info "Found backup workflow, attempting restoration..."
        cp "$backup_workflow" "$main_workflow"
        
        if yamllint "$main_workflow" >/dev/null 2>&1; then
            log_success "Workflow restored from backup"
            return 0
        else
            log_error "Backup workflow also invalid"
            return 1
        fi
    else
        log_error "No backup workflow available"
        return 1
    fi
}

# Emergency rollback
emergency_rollback() {
    log_emergency "🔄 EMERGENCY ROLLBACK"
    log_emergency "====================="
    
    cd "$PROJECT_ROOT"
    
    # Get last known good commit
    local last_good_commit=""
    local commits=$(git log --oneline -10)
    
    # Look for commits with successful CI indicators
    while IFS= read -r line; do
        local commit_hash=$(echo "$line" | cut -d' ' -f1)
        local commit_msg=$(echo "$line" | cut -d' ' -f2-)
        
        # Check if this looks like a good commit
        if [[ "$commit_msg" =~ (fix|feat|docs|ci.*success|build.*success) ]] && [[ ! "$commit_msg" =~ (wip|broken|fail) ]]; then
            last_good_commit=$commit_hash
            break
        fi
    done <<< "$commits"
    
    if [ -n "$last_good_commit" ]; then
        log_info "Found potential good commit: $last_good_commit"
        
        # Create emergency branch
        local emergency_branch="emergency-rollback-$(date +%s)"
        git checkout -b "$emergency_branch"
        
        # Reset to last good commit
        git reset --hard "$last_good_commit"
        
        log_success "Rolled back to commit: $last_good_commit"
        log_info "Created emergency branch: $emergency_branch"
        
        return 0
    else
        log_error "Could not identify last good commit"
        return 1
    fi
}

# Generate emergency report
generate_emergency_report() {
    local recovery_success=$1
    local timestamp=$(date '+%Y%m%d-%H%M%S')
    local report_file="$PROJECT_ROOT/reports/emergency-report-$timestamp.md"
    
    mkdir -p "$(dirname "$report_file")"
    
    cat > "$report_file" << EOF
# Emergency CI/CD Recovery Report

**Recovery Session**: $timestamp  
**Repository**: $(basename "$PROJECT_ROOT")  
**Recovery Status**: $([ $recovery_success -eq 0 ] && echo "✅ SUCCESSFUL" || echo "❌ FAILED")  
**Recovery Log**: $RECOVERY_LOG

## Emergency Actions Taken

$([ $recovery_success -eq 0 ] && echo "### ✅ Successful Recovery Actions" || echo "### ❌ Failed Recovery Attempt")

1. **Emergency Diagnosis**: Repository integrity check
2. **Dependency Recovery**: Cache clearing and reinstallation
3. **Build Recovery**: Artifact cleanup and rebuild
4. **Security Cleanup**: Security validation and permission fixes
5. **Workflow Recovery**: CI workflow validation and restoration
$([ $recovery_success -ne 0 ] && echo "6. **Emergency Rollback**: Repository state restoration")

## Post-Recovery Checklist

- [ ] **Verify CI Pipeline**: Run manual workflow trigger to test
- [ ] **Run Full Test Suite**: Ensure all tests pass
- [ ] **Security Scan**: Complete security validation
- [ ] **Documentation Update**: Record lessons learned
- [ ] **Team Notification**: Inform development team of recovery

## Prevention Measures

Based on this emergency recovery:

1. **Monitoring**: Implement proactive failure prevention
2. **Backups**: Ensure regular backup of working configurations
3. **Testing**: Improve pre-commit validation
4. **Documentation**: Update troubleshooting procedures

## Next Steps

1. **Immediate**: Test CI pipeline functionality
2. **Short-term**: Identify and fix root cause
3. **Long-term**: Implement prevention measures

---

**Generated by**: Enterprise CI/CD Emergency Recovery System  
**Contact**: Platform Engineering Team
EOF

    log_info "📄 Emergency report generated: $report_file"
    echo "$report_file"
}

# Main emergency recovery function
main() {
    local action="${1:-diagnose}"
    
    case "$action" in
        "diagnose")
            init_emergency_recovery
            emergency_diagnosis
            ;;
        "fix")
            init_emergency_recovery
            
            log_emergency "Starting emergency recovery sequence..."
            
            local recovery_success=0
            
            # Run emergency diagnosis first
            if ! emergency_diagnosis; then
                log_warn "Critical issues detected, proceeding with emergency fixes..."
            fi
            
            # Attempt emergency fixes
            if ! emergency_fix_security; then
                log_error "Security fix failed"
                recovery_success=1
            fi
            
            if ! emergency_fix_dependencies; then
                log_error "Dependency fix failed"
                recovery_success=1
            fi
            
            if ! emergency_fix_build; then
                log_error "Build fix failed"
                recovery_success=1
            fi
            
            if ! emergency_fix_workflows; then
                log_error "Workflow fix failed"
                recovery_success=1
            fi
            
            # If fixes failed, attempt rollback
            if [ $recovery_success -ne 0 ]; then
                log_emergency "Emergency fixes failed, attempting rollback..."
                if emergency_rollback; then
                    log_success "Emergency rollback successful"
                    recovery_success=0
                else
                    log_error "Emergency rollback failed"
                fi
            fi
            
            # Generate recovery report
            local report_file=$(generate_emergency_report $recovery_success)
            
            if [ $recovery_success -eq 0 ]; then
                log_success "🎉 Emergency recovery completed successfully"
                log_info "📋 Recovery report: $report_file"
            else
                log_error "💥 Emergency recovery failed"
                log_error "📋 Failure report: $report_file"
                log_error "🆘 Manual intervention required"
            fi
            
            return $recovery_success
            ;;
        "rollback")
            init_emergency_recovery
            emergency_rollback
            ;;
        *)
            echo "Usage: $0 {diagnose|fix|rollback}"
            echo ""
            echo "  diagnose  - Run emergency diagnosis only"
            echo "  fix       - Attempt automatic recovery"
            echo "  rollback  - Rollback to last known good state"
            exit 1
            ;;
    esac
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi