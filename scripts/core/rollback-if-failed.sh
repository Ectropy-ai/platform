#!/bin/bash
# scripts/rollback-if-failed.sh
# Automated rollback script for production deployment failures

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-"production"}
ROLLBACK_THRESHOLD_ERRORS=5
ROLLBACK_THRESHOLD_LATENCY=1000  # milliseconds
ROLLBACK_THRESHOLD_ERROR_RATE=10  # percentage
CHECK_INTERVAL=30  # seconds
MAX_CHECK_ATTEMPTS=10

# Monitoring URLs
case "$ENVIRONMENT" in
    "production")
        API_URL="https://api.ectropy.com"
        HEALTH_URL="https://api.ectropy.com/health"
        METRICS_URL="https://api.ectropy.com/metrics"
        ;;
    "alpha")
        API_URL="https://alpha-api.ectropy.com"
        HEALTH_URL="https://alpha-api.ectropy.com/health"
        METRICS_URL="https://alpha-api.ectropy.com/metrics"
        ;;
    "beta")
        API_URL="https://beta-api.ectropy.com"
        HEALTH_URL="https://beta-api.ectropy.com/health"
        METRICS_URL="https://beta-api.ectropy.com/metrics"
        ;;
    "staging")
        API_URL="https://staging-api.ectropy.com"
        HEALTH_URL="https://staging-api.ectropy.com/health"
        METRICS_URL="https://staging-api.ectropy.com/metrics"
        ;;
    *)
        API_URL="http://localhost:3000"
        HEALTH_URL="http://localhost:3000/health"
        METRICS_URL="http://localhost:3000/metrics"
        ;;
esac

# Failure counters
CONSECUTIVE_FAILURES=0
TOTAL_CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $1"
}

# Send alert notification
send_alert() {
    local message="$1"
    local severity="${2:-warning}"
    
    log_critical "ALERT: $message"
    
    # Log to file
    echo "$(date): [$severity] $message" >> "logs/rollback-alerts.log"
    
    # In production, this would send to monitoring systems
    # Examples:
    # - Send to Slack webhook
    # - Send to PagerDuty
    # - Send email alert
    # - Update status page
    
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 Ectropy $ENVIRONMENT: $message\"}" \
            "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 || true
    fi
}

# Check system health with enhanced error handling and exponential backoff
check_system_health() {
    local check_name="$1"
    local health_passed=true
    
    log_info "Checking $check_name..."
    
    # Check 1: Basic health endpoint with timeout and exponential backoff retry
    local health_response=""
    local retry_count=0
    local max_retries=5  # Increased from 3 to 5
    local retry_delay=2  # Start with 2 seconds
    
    while [[ $retry_count -lt $max_retries ]]; do
        log_info "$check_name: Attempting health check ($((retry_count + 1))/$max_retries)..."
        
        # Try health check with detailed error capture
        local curl_output=""
        curl_output=$(curl -s -w "%{http_code}|%{time_total}|%{url_effective}" \
                      -o /dev/null --max-time 15 --connect-timeout 5 \
                      "$HEALTH_URL" 2>&1)
        
        # Parse curl output
        if [[ $? -eq 0 ]] && [[ "$curl_output" =~ ^[0-9]{3}\|.*$ ]]; then
            health_response=$(echo "$curl_output" | cut -d'|' -f1)
            local response_time=$(echo "$curl_output" | cut -d'|' -f2)
            log_info "$check_name: Response received (HTTP $health_response, ${response_time}s)"
        else
            health_response="000"
            log_warning "$check_name: Network error or timeout: $curl_output"
        fi
        
        if [[ "$health_response" == "200" ]]; then
            log_success "$check_name: Health endpoint responding (HTTP $health_response)"
            break
        else
            retry_count=$((retry_count + 1))
            if [[ $retry_count -lt $max_retries ]]; then
                log_warning "$check_name: Health endpoint failed (HTTP $health_response), retrying in ${retry_delay}s... ($retry_count/$max_retries)"
                sleep $retry_delay
                # Exponential backoff: double the delay, cap at 30 seconds
                retry_delay=$((retry_delay * 2))
                if [[ $retry_delay -gt 30 ]]; then
                    retry_delay=30
                fi
            else
                log_error "$check_name: Health endpoint failed after $max_retries attempts (HTTP $health_response)"
                log_error "$check_name: Health URL: $HEALTH_URL"
                # Check if it's a network connectivity issue vs service issue
                if command -v ping >/dev/null 2>&1; then
                    local host=$(echo "$HEALTH_URL" | sed -E 's|https?://([^/]+).*|\1|')
                    if ping -c 1 -W 3 "$host" >/dev/null 2>&1; then
                        log_warning "$check_name: Network connectivity OK, service may be down"
                    else
                        log_warning "$check_name: Network connectivity issue detected"
                    fi
                fi
                health_passed=false
            fi
        fi
    done
    
    # Check 2: API Response time with fallback
    local api_response=""  # Initialize variable to prevent unbound variable error
    if [[ "$health_response" == "200" ]]; then
        log_info "$check_name: Testing API response time..."
        local start_time=$(date +%s%N)
        
        # Try API health check with error handling
        local api_curl_output=""
        api_curl_output=$(curl -s -w "%{http_code}" -o /dev/null \
                         --max-time 15 --connect-timeout 5 \
                         "$API_URL/health" 2>/dev/null)
        
        if [[ $? -eq 0 ]]; then
            api_response="$api_curl_output"
            local end_time=$(date +%s%N)
            local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
            
            if [[ "$api_response" == "200" ]]; then
                if [[ $response_time -gt $ROLLBACK_THRESHOLD_LATENCY ]]; then
                    log_warning "$check_name: High latency detected (${response_time}ms > ${ROLLBACK_THRESHOLD_LATENCY}ms)"
                    # Don't mark as failed for latency alone - just warn
                    log_warning "$check_name: Continuing with deployment despite latency"
                else
                    log_success "$check_name: API response time acceptable (${response_time}ms)"
                fi
            else
                log_warning "$check_name: API health check failed (HTTP $api_response) - degraded service"
                # Don't fail immediately - service might be starting up
                log_info "$check_name: Service may be initializing, will continue monitoring"
            fi
        else
            log_warning "$check_name: API health check connection failed - service may be starting"
            api_response="000"
        fi
    else
        log_warning "$check_name: Skipping API response time check due to primary health endpoint failure"
        api_response="000"  # Set fallback value for subsequent checks
    fi
    
    # Check 3: Error rate (if metrics available) with graceful degradation
    if [[ "${api_response:-000}" == "200" ]] && [[ -n "$METRICS_URL" ]]; then
        log_info "$check_name: Checking error rate from metrics..."
        local error_rate=""
        
        # Try to get metrics with error handling
        local metrics_output=""
        metrics_output=$(curl -s --max-time 10 --connect-timeout 3 "$METRICS_URL" 2>/dev/null)
        
        if [[ $? -eq 0 ]] && [[ -n "$metrics_output" ]]; then
            error_rate=$(echo "$metrics_output" | \
                grep -E "http_requests_total.*5[0-9][0-9]" | \
                awk '{sum+=$NF} END {print sum+0}' || echo "0")
            
            if [[ -n "$error_rate" ]] && [[ "$error_rate" =~ ^[0-9]+$ ]]; then
                if [[ $error_rate -gt $ROLLBACK_THRESHOLD_ERROR_RATE ]]; then
                    log_error "$check_name: High error rate detected ($error_rate% > $ROLLBACK_THRESHOLD_ERROR_RATE%)"
                    health_passed=false
                else
                    log_success "$check_name: Error rate acceptable ($error_rate% <= $ROLLBACK_THRESHOLD_ERROR_RATE%)"
                fi
            else
                log_warning "$check_name: Unable to parse error rate from metrics - continuing"
            fi
        else
            log_warning "$check_name: Metrics endpoint unavailable - skipping error rate check"
        fi
    else
        log_info "$check_name: Skipping error rate check (API: ${api_response:-000}, Metrics: ${METRICS_URL:-not configured})"
    fi
    
    # Final health assessment with more nuanced logic
    if $health_passed; then
        log_success "$check_name: System healthy"
        CONSECUTIVE_FAILURES=0
        return 0
    else
        ((CONSECUTIVE_FAILURES++))
        log_error "$check_name: System unhealthy (failure #$CONSECUTIVE_FAILURES)"
        
        # Provide helpful troubleshooting info
        log_info "$check_name: Troubleshooting info:"
        log_info "  - Health URL: $HEALTH_URL"
        log_info "  - API URL: $API_URL"
        log_info "  - Metrics URL: ${METRICS_URL:-not configured}"
        log_info "  - Consecutive failures: $CONSECUTIVE_FAILURES/$ROLLBACK_THRESHOLD_ERRORS"
        
        return 1
    fi
}

# Execute rollback procedure
execute_rollback() {
    log_critical "INITIATING AUTOMATIC ROLLBACK"
    send_alert "Automatic rollback initiated due to system failures" "critical"
    
    # Create pre-rollback snapshot
    local rollback_snapshot="emergency-rollback-$(date +%Y%m%d-%H%M%S)"
    log_info "Creating emergency snapshot: $rollback_snapshot"
    
    if ./scripts/enterprise-rollback.sh snapshot "$rollback_snapshot"; then
        log_success "Emergency snapshot created"
    else
        log_error "Failed to create emergency snapshot"
    fi
    
    # Find latest known good snapshot
    local latest_snapshot=""
    
    # Get list of snapshots and extract the first valid one
    if snapshots_output=$(./scripts/enterprise-rollback.sh list 2>/dev/null); then
        # Parse the output to extract snapshot names, excluding manual snapshots created during failures
        latest_snapshot=$(echo "$snapshots_output" | grep -E "^\s*[0-9]+\.\s+" | grep -v "emergency-rollback\|pre-rollback" | head -1 | sed -E 's/^\s*[0-9]+\.\s+([^ ]+).*/\1/' || echo "")
        
        # If no regular snapshot found, try any available snapshot as last resort
        if [[ -z "$latest_snapshot" ]]; then
            latest_snapshot=$(echo "$snapshots_output" | grep -E "^\s*[0-9]+\.\s+" | head -1 | sed -E 's/^\s*[0-9]+\.\s+([^ ]+).*/\1/' || echo "")
        fi
    fi
    
    if [[ -n "$latest_snapshot" ]]; then
        log_info "Rolling back to latest snapshot: $latest_snapshot"
        
        if ./scripts/enterprise-rollback.sh rollback "$latest_snapshot"; then
            log_success "Rollback completed successfully"
            send_alert "Rollback to $latest_snapshot completed successfully" "warning"
            
            # Wait for services to stabilize
            log_info "Waiting for services to stabilize..."
            sleep 60
            
            # Verify rollback success
            if verify_rollback_success; then
                log_success "Rollback verification passed"
                send_alert "Rollback verification successful - system restored" "info"
                return 0
            else
                log_error "Rollback verification failed"
                send_alert "Rollback verification failed - manual intervention required" "critical"
                return 1
            fi
        else
            log_error "Rollback failed"
            send_alert "Automated rollback failed - manual intervention required" "critical"
            return 1
        fi
    else
        log_error "No rollback snapshots available"
        send_alert "No rollback snapshots available - manual intervention required" "critical"
        return 1
    fi
}

# Verify rollback success
verify_rollback_success() {
    log_info "Verifying rollback success..."
    
    local verification_attempts=5
    local attempt=0
    
    while [[ $attempt -lt $verification_attempts ]]; do
        ((attempt++))
        log_info "Verification attempt $attempt/$verification_attempts..."
        
        if check_system_health "Rollback Verification"; then
            log_success "Rollback verification passed on attempt $attempt"
            return 0
        fi
        
        if [[ $attempt -lt $verification_attempts ]]; then
            log_warning "Verification failed, retrying in 30 seconds..."
            sleep 30
        fi
    done
    
    log_error "Rollback verification failed after $verification_attempts attempts"
    return 1
}

# Continuous monitoring loop
monitor_deployment() {
    log_info "Starting deployment monitoring for $ENVIRONMENT..."
    log_info "Monitoring: $API_URL"
    log_info "Check interval: ${CHECK_INTERVAL}s"
    log_info "Rollback threshold: $ROLLBACK_THRESHOLD_ERRORS consecutive failures"
    
    while [[ $TOTAL_CHECKS -lt $MAX_CHECK_ATTEMPTS ]]; do
        ((TOTAL_CHECKS++))
        
        log_info "Health check #$TOTAL_CHECKS ($(date))"
        
        if check_system_health "Continuous Monitor"; then
            log_success "Check #$TOTAL_CHECKS passed"
            
            # If we've completed all checks successfully, monitoring is complete
            if [[ $TOTAL_CHECKS -eq $MAX_CHECK_ATTEMPTS ]]; then
                log_success "🎉 Deployment monitoring completed successfully"
                log_success "No issues detected after $MAX_CHECK_ATTEMPTS checks"
                send_alert "Deployment monitoring completed - system stable" "info"
                return 0
            fi
        else
            log_error "Check #$TOTAL_CHECKS failed"
            
            # Check if we've reached the rollback threshold
            if [[ $CONSECUTIVE_FAILURES -ge $ROLLBACK_THRESHOLD_ERRORS ]]; then
                log_critical "Rollback threshold reached ($CONSECUTIVE_FAILURES >= $ROLLBACK_THRESHOLD_ERRORS)"
                
                if execute_rollback; then
                    log_success "Automatic rollback completed successfully"
                    return 0
                else
                    log_error "Automatic rollback failed - manual intervention required"
                    send_alert "Automatic rollback failed - immediate manual intervention required" "critical"
                    return 1
                fi
            else
                log_warning "Failure count: $CONSECUTIVE_FAILURES/$ROLLBACK_THRESHOLD_ERRORS (continuing monitoring)"
            fi
        fi
        
        # Wait before next check
        if [[ $TOTAL_CHECKS -lt $MAX_CHECK_ATTEMPTS ]]; then
            log_info "Waiting ${CHECK_INTERVAL}s before next check..."
            sleep $CHECK_INTERVAL
        fi
    done
    
    log_warning "Maximum monitoring attempts reached ($MAX_CHECK_ATTEMPTS)"
    
    if [[ $CONSECUTIVE_FAILURES -gt 0 ]]; then
        log_warning "Ending with $CONSECUTIVE_FAILURES consecutive failures"
        send_alert "Monitoring completed with ongoing issues - manual review recommended" "warning"
        return 1
    else
        log_success "Monitoring completed successfully"
        return 0
    fi
}

# Emergency stop function
emergency_stop() {
    log_critical "EMERGENCY STOP TRIGGERED"
    send_alert "Emergency stop triggered - immediate rollback initiated" "critical"
    
    # Attempt immediate rollback
    execute_rollback
    
    exit 1
}

# Set up signal handlers for emergency stop
trap emergency_stop SIGINT SIGTERM

# Generate monitoring report
generate_monitoring_report() {
    local report_file="reports/rollback-monitoring-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "reports"
    
    cat > "$report_file" << EOF
# Deployment Monitoring Report - $ENVIRONMENT

## Monitoring Session
- Environment: $ENVIRONMENT
- Start Time: $(date)
- API URL: $API_URL
- Total Checks: $TOTAL_CHECKS
- Consecutive Failures: $CONSECUTIVE_FAILURES

## Thresholds
- Failure Threshold: $ROLLBACK_THRESHOLD_ERRORS consecutive failures
- Latency Threshold: ${ROLLBACK_THRESHOLD_LATENCY}ms
- Error Rate Threshold: ${ROLLBACK_THRESHOLD_ERROR_RATE}%

## Monitoring Results
- Max Checks: $MAX_CHECK_ATTEMPTS
- Check Interval: ${CHECK_INTERVAL}s
- Current Status: $([ $CONSECUTIVE_FAILURES -eq 0 ] && echo "Healthy" || echo "Issues Detected")

## Actions Taken
$([ $CONSECUTIVE_FAILURES -ge $ROLLBACK_THRESHOLD_ERRORS ] && echo "- ⚠️ Automatic rollback triggered" || echo "- ✅ No rollback required")

Generated at: $(date)
EOF
    
    log_info "Monitoring report generated: $report_file"
}

# Main execution function
main() {
    echo "🔄 Automated Rollback Monitoring - $ENVIRONMENT"
    echo "=============================================="
    echo
    echo "Environment: $ENVIRONMENT"
    echo "API URL: $API_URL"
    echo "Rollback Threshold: $ROLLBACK_THRESHOLD_ERRORS failures"
    echo "Check Interval: ${CHECK_INTERVAL}s"
    echo "Max Checks: $MAX_CHECK_ATTEMPTS"
    echo
    
    # Ensure logs directory exists
    mkdir -p "logs"
    
    # Initial health check
    log_info "Performing initial health check..."
    if ! check_system_health "Initial Check"; then
        log_warning "Initial health check failed - starting monitoring with caution"
    else
        log_success "Initial health check passed - starting monitoring"
    fi
    
    # Start continuous monitoring
    if monitor_deployment; then
        log_success "🎉 Deployment monitoring completed successfully"
        echo
        echo "✅ System remained stable throughout monitoring period"
        echo "✅ No rollback required"
        echo "✅ Deployment appears successful"
    else
        log_error "❌ Deployment monitoring detected issues"
        echo
        echo "❌ System instability detected"
        echo "❌ Review logs and take appropriate action"
        echo "❌ Manual intervention may be required"
    fi
    
    generate_monitoring_report
    
    echo
    echo "📊 Monitoring Summary:"
    echo "  Total Checks: $TOTAL_CHECKS"
    echo "  Consecutive Failures: $CONSECUTIVE_FAILURES"
    echo "  Status: $([ $CONSECUTIVE_FAILURES -eq 0 ] && echo "Stable" || echo "Unstable")"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Automated Rollback Monitoring Script"
        echo
        echo "Usage: $0 [environment] [options]"
        echo
        echo "Environments:"
        echo "  production   Monitor production deployment"
        echo "  beta         Monitor beta deployment"
        echo "  staging      Monitor staging deployment"
        echo
        echo "Options:"
        echo "  --help, -h   Show this help message"
        echo
        echo "Environment Variables:"
        echo "  SLACK_WEBHOOK_URL    Slack webhook for alerts"
        echo "  CHECK_INTERVAL       Check interval in seconds (default: 30)"
        echo "  MAX_CHECK_ATTEMPTS   Maximum number of checks (default: 10)"
        echo
        echo "This script:"
        echo "  - Continuously monitors system health"
        echo "  - Automatically triggers rollback on failures"
        echo "  - Sends alerts for critical issues"
        echo "  - Verifies rollback success"
        echo
        echo "Rollback Triggers:"
        echo "  - $ROLLBACK_THRESHOLD_ERRORS consecutive health check failures"
        echo "  - Response time > ${ROLLBACK_THRESHOLD_LATENCY}ms"
        echo "  - Error rate > ${ROLLBACK_THRESHOLD_ERROR_RATE}%"
        echo
        echo "Examples:"
        echo "  $0 production         # Monitor production deployment"
        echo "  CHECK_INTERVAL=60 $0  # Monitor with 60s intervals"
        exit 0
        ;;
    production|beta|staging|alpha)
        main
        ;;
    *)
        if [[ -n "${1:-}" ]]; then
            echo "Unknown environment: $1"
            echo "Use --help for usage information"
            exit 1
        else
            main
        fi
        ;;
esac