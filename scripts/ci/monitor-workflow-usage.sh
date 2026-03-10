#!/bin/bash

# =============================================================================
# Workflow Usage Monitor
# =============================================================================
# Monitors GitHub Actions workflow usage to ensure cost efficiency
# and compliance with the 6-workflow limit policy.
#
# Usage: ./scripts/monitor-workflow-usage.sh [days]
# 
# This script should be run daily by DevOps to monitor:
# 1. Workflow run counts in the last 24 hours
# 2. Cost estimates based on usage
# 3. Policy violations (unauthorized workflows)
# 4. Efficiency metrics
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAYS=${1:-1}  # Default to 1 day if not specified
MAX_WORKFLOWS=6
ESTIMATED_COST_PER_RUN=0.01  # Rough estimate in USD

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Output functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Check if GitHub CLI is available
check_prerequisites() {
    if ! command -v gh &> /dev/null; then
        log_error "GitHub CLI (gh) is required but not installed"
        echo "Install it from: https://cli.github.com/"
        exit 1
    fi
    
    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI is not authenticated"
        echo "Run: gh auth login"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Count current workflow files
check_workflow_count() {
    log_info "Checking workflow file count..."
    
    local workflow_count
    workflow_count=$(find .github/workflows -name "*.yml" -o -name "*.yaml" | grep -v README | wc -l)
    
    echo "Current workflow files:"
    find .github/workflows -name "*.yml" -o -name "*.yaml" | grep -v README | sort
    echo ""
    
    if [ "$workflow_count" -eq "$MAX_WORKFLOWS" ]; then
        log_success "Workflow count is compliant: $workflow_count/$MAX_WORKFLOWS"
    elif [ "$workflow_count" -lt "$MAX_WORKFLOWS" ]; then
        log_warning "Workflow count is below maximum: $workflow_count/$MAX_WORKFLOWS (missing workflows?)"
    else
        log_error "Workflow count exceeds limit: $workflow_count/$MAX_WORKFLOWS"
        log_error "POLICY VIOLATION: Remove $(($workflow_count - $MAX_WORKFLOWS)) workflow(s)"
        return 1
    fi
}

# Get workflow runs for the specified time period
get_workflow_runs() {
    log_info "Fetching workflow runs for the last $DAYS day(s)..."
    
    local since_date
    since_date=$(date -d "$DAYS days ago" --iso-8601=seconds)
    
    # Get workflow runs with JSON output
    if ! gh run list --limit 100 --json name,status,createdAt,conclusion > workflow_runs.json; then
        log_error "Failed to fetch workflow runs"
        return 1
    fi
    
    # Filter runs from the specified time period
    local run_count
    run_count=$(jq --arg since "$since_date" '[.[] | select(.createdAt >= $since)]' workflow_runs.json | jq length)
    
    echo "Total runs in last $DAYS day(s): $run_count"
    
    # Group by workflow name
    jq --arg since "$since_date" '
        [.[] | select(.createdAt >= $since)] | 
        group_by(.name) | 
        map({
            workflow: .[0].name, 
            count: length,
            success: [.[] | select(.conclusion == "success")] | length,
            failure: [.[] | select(.conclusion == "failure")] | length,
            cancelled: [.[] | select(.conclusion == "cancelled")] | length
        })
    ' workflow_runs.json > workflow_summary.json
    
    echo ""
    echo "Workflow run summary:"
    echo "====================="
    jq -r '.[] | "\(.workflow): \(.count) runs (\(.success) success, \(.failure) failed, \(.cancelled) cancelled)"' workflow_summary.json
}

# Calculate cost estimates
calculate_costs() {
    log_info "Calculating cost estimates..."
    
    local total_runs
    total_runs=$(jq '[.[].count] | add' workflow_summary.json)
    
    local estimated_daily_cost
    estimated_daily_cost=$(echo "$total_runs * $ESTIMATED_COST_PER_RUN" | bc -l)
    
    local estimated_monthly_cost
    estimated_monthly_cost=$(echo "$estimated_daily_cost * 30" | bc -l)
    
    echo ""
    echo "Cost Analysis:"
    echo "============="
    echo "Total runs in last $DAYS day(s): $total_runs"
    echo "Estimated cost for period: \$$(printf "%.2f" $estimated_daily_cost)"
    echo "Estimated monthly cost: \$$(printf "%.2f" $estimated_monthly_cost)"
    
    # Compare against target metrics
    local target_daily_runs=90
    local target_daily_cost=0.90
    
    if [ "$total_runs" -le "$target_daily_runs" ]; then
        log_success "Run count is within target: $total_runs <= $target_daily_runs"
    else
        log_warning "Run count exceeds target: $total_runs > $target_daily_runs"
        echo "Consider optimizing workflow triggers or consolidating further"
    fi
    
    if (( $(echo "$estimated_daily_cost <= $target_daily_cost" | bc -l) )); then
        log_success "Estimated cost is within target: \$$(printf "%.2f" $estimated_daily_cost) <= \$$target_daily_cost"
    else
        log_warning "Estimated cost exceeds target: \$$(printf "%.2f" $estimated_daily_cost) > \$$target_daily_cost"
        echo "Review workflow efficiency and triggers"
    fi
}

# Check for efficiency issues
check_efficiency() {
    log_info "Checking workflow efficiency..."
    
    local high_failure_threshold=20  # 20% failure rate threshold
    
    echo ""
    echo "Efficiency Analysis:"
    echo "==================="
    
    while IFS= read -r workflow_data; do
        local name count success failure cancelled
        name=$(echo "$workflow_data" | jq -r '.workflow')
        count=$(echo "$workflow_data" | jq -r '.count')
        success=$(echo "$workflow_data" | jq -r '.success')
        failure=$(echo "$workflow_data" | jq -r '.failure')
        cancelled=$(echo "$workflow_data" | jq -r '.cancelled')
        
        if [ "$count" -gt 0 ]; then
            local failure_rate
            failure_rate=$(echo "scale=2; ($failure * 100) / $count" | bc -l)
            
            if (( $(echo "$failure_rate > $high_failure_threshold" | bc -l) )); then
                log_warning "$name has high failure rate: $(printf "%.1f" $failure_rate)% ($failure/$count)"
            else
                log_success "$name has acceptable failure rate: $(printf "%.1f" $failure_rate)% ($failure/$count)"
            fi
        fi
    done < <(jq -c '.[]' workflow_summary.json)
}

# Generate recommendations
generate_recommendations() {
    log_info "Generating recommendations..."
    
    echo ""
    echo "Recommendations:"
    echo "==============="
    
    local total_runs
    total_runs=$(jq '[.[].count] | add' workflow_summary.json)
    
    # Check if any workflow is running too frequently
    while IFS= read -r workflow_data; do
        local name count
        name=$(echo "$workflow_data" | jq -r '.workflow')
        count=$(echo "$workflow_data" | jq -r '.count')
        
        # Define reasonable daily limits for each workflow type
        case "$name" in
            *"ci"*|*"CI"*)
                if [ "$count" -gt 50 ]; then
                    echo "⚠️  $name is running very frequently ($count runs). Consider:"
                    echo "   - Reducing trigger sensitivity"
                    echo "   - Implementing smarter path filters"
                    echo "   - Batching smaller changes"
                fi
                ;;
            *"security"*)
                if [ "$count" -gt 5 ]; then
                    echo "⚠️  $name is running more than expected ($count runs). Security scans should be:"
                    echo "   - Daily scheduled (1-2 runs)"
                    echo "   - PR-triggered only for security-related changes"
                fi
                ;;
            *"staging"*|*"production"*)
                if [ "$count" -gt 10 ]; then
                    echo "⚠️  $name is running very frequently ($count runs). Consider:"
                    echo "   - Implementing deployment gates"
                    echo "   - Batching deployments"
                    echo "   - Reviewing trigger conditions"
                fi
                ;;
        esac
    done < <(jq -c '.[]' workflow_summary.json)
    
    if [ "$total_runs" -le 90 ]; then
        echo "✅ Overall run count is within target range"
    else
        echo "⚠️  Overall run count ($total_runs) exceeds target (90). Consider:"
        echo "   - Reviewing all workflow triggers"
        echo "   - Implementing more selective path filters"
        echo "   - Consolidating related workflows further"
    fi
    
    echo ""
    echo "✅ Monitoring complete. Review the above analysis and take action if needed."
}

# Main execution
main() {
    echo "🔍 Workflow Usage Monitor"
    echo "========================"
    echo "Monitoring period: Last $DAYS day(s)"
    echo "Target: ≤ 6 workflows, ≤ 90 runs/day, ≤ \$0.90/day"
    echo ""
    
    check_prerequisites
    check_workflow_count
    get_workflow_runs
    calculate_costs
    check_efficiency
    generate_recommendations
    
    # Clean up temporary files
    rm -f workflow_runs.json workflow_summary.json
}

# Run main function
main "$@"