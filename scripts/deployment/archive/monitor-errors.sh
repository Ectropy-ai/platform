#!/bin/bash
################################################################################
# ENTERPRISE ERROR MONITORING SCRIPT
# Monitors application error rates and triggers alerts if thresholds exceeded
#
# Usage: ./monitor-errors.sh <duration_minutes> [--server <blue|green|all>]
# Example: ./monitor-errors.sh 30
#          ./monitor-errors.sh 10 --server blue
#
# Exit codes:
#   0 - Error rates within acceptable limits
#   1 - Error rates exceeded thresholds
#
# ENTERPRISE FIX (ROOT CAUSE #36 - 2025-12-22): Enhanced Monitoring with Fallbacks
# - Validates bc availability, provides awk fallback for calculations
# - Validates SSH connectivity before monitoring loop
# - Implements HTTP-based fallback via load balancer
# - Enhanced error handling and diagnostics
################################################################################

set -uo pipefail  # Removed -e to allow graceful error handling

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Server configuration
# ENTERPRISE FIX (2025-12-10): Use environment variables instead of hardcoded IPs
BLUE_IP="${PROD_BLUE_IP:-161.35.226.36}"
GREEN_IP="${PROD_GREEN_IP:-143.198.231.147}"
LOAD_BALANCER_URL="${PROD_LB_URL:-https://ectropy.ai}"

################################################################################
# Dependency Validation
################################################################################

# Check for bc (calculator) availability
HAS_BC=false
if command -v bc &> /dev/null; then
    HAS_BC=true
    log_info "Using bc for calculations"
else
    log_warn "bc not available, using awk fallback for calculations"
fi

# Math calculation with fallback
calculate() {
    local expression=$1
    if [ "$HAS_BC" = true ]; then
        echo "$expression" | bc -l
    else
        # Fallback to awk for basic arithmetic
        echo "$expression" | awk '{print $0}'
    fi
}

# Validate SSH connectivity
validate_ssh() {
    local server_ip=$1
    local server_name=$2

    log_info "Validating SSH connectivity to $server_name ($server_ip)..."

    # Check if SSH key is configured
    if [ ! -f ~/.ssh/id_rsa ] && [ ! -f ~/.ssh/id_ed25519 ]; then
        log_warn "No SSH key found in ~/.ssh/"
        return 1
    fi

    # Test SSH connection with timeout
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes \
        root@"$server_ip" "echo 'SSH connected'" &>/dev/null; then
        log_info "✅ SSH connection to $server_name successful"
        return 0
    else
        log_warn "⚠️ SSH connection to $server_name failed"
        return 1
    fi
}

# Determine monitoring strategy
SSH_AVAILABLE=false
if [ -n "${BLUE_IP:-}" ]; then
    if validate_ssh "$BLUE_IP" "blue"; then
        SSH_AVAILABLE=true
    fi
fi

if [ "$SSH_AVAILABLE" = false ] && [ -n "${GREEN_IP:-}" ]; then
    if validate_ssh "$GREEN_IP" "green"; then
        SSH_AVAILABLE=true
    fi
fi

# Set monitoring strategy
if [ "$SSH_AVAILABLE" = true ]; then
    MONITORING_STRATEGY="ssh"
    log_info "Using SSH-based monitoring (production firewall compliant)"
else
    MONITORING_STRATEGY="http"
    log_warn "SSH unavailable - using HTTP-based monitoring via load balancer"
    log_warn "Note: HTTP monitoring tests load balancer, not individual servers"
fi

# Parse arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <duration_minutes> [--server <blue|green|all>]"
    exit 1
fi

DURATION_MINUTES=$1
SERVER="${3:-all}"

# Thresholds (from runbook)
MAX_ERROR_RATE=0.01  # 1% error rate
MAX_P95_LATENCY=2000 # 2000ms
MIN_SUCCESS_RATE=0.99 # 99% success rate

log_info "=================================================="
log_info "Starting error rate monitoring"
log_info "Duration: $DURATION_MINUTES minutes"
log_info "Server: $SERVER"
log_info "Thresholds:"
log_info "  Max error rate: $MAX_ERROR_RATE (1%)"
log_info "  Max P95 latency: ${MAX_P95_LATENCY}ms"
log_info "  Min success rate: $MIN_SUCCESS_RATE (99%)"
log_info "=================================================="

# Calculate end time
END_TIME=$(($(date +%s) + (DURATION_MINUTES * 60)))

# Monitoring counters
TOTAL_CHECKS=0
FAILED_CHECKS=0

################################################################################
# Monitor health endpoints
################################################################################

check_server_health_ssh() {
    local server_name=$1
    local server_ip=$2

    # ENTERPRISE FIX (ROOT CAUSE #30 - 2025-12-20): SSH-Based Health Checks
    # Production firewall blocks external access to port 4000
    # Execute health check FROM INSIDE the server via SSH (localhost access)
    # Same pattern as validate-health.sh check_endpoint_via_ssh()

    # Check API Gateway health (via SSH - internal network access)
    START_TIME=$(date +%s%3N)
    HTTP_CODE=$(ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes \
        root@"$server_ip" \
        "curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 10 'http://localhost:4000/health' 2>/dev/null || echo '000'" 2>/dev/null || echo "000")
    END_TIME_MS=$(date +%s%3N)
    LATENCY=$((END_TIME_MS - START_TIME))

    ((TOTAL_CHECKS++))

    if [ "$HTTP_CODE" = "200" ]; then
        if [ $LATENCY -gt $MAX_P95_LATENCY ]; then
            log_warn "⚠️  High latency on $server_name: ${LATENCY}ms (threshold: ${MAX_P95_LATENCY}ms)"
            ((FAILED_CHECKS++))
        else
            log_info "✅ $server_name healthy: HTTP $HTTP_CODE, ${LATENCY}ms"
        fi
    else
        log_error "❌ $server_name error: HTTP $HTTP_CODE"
        ((FAILED_CHECKS++))
    fi
}

check_server_health_http() {
    local server_name=$1

    # ENTERPRISE FALLBACK: HTTP-based monitoring via load balancer
    # Used when SSH is not available (e.g., GitHub Actions without SSH keys)
    # Tests load balancer → active server path

    START_TIME=$(date +%s%3N)
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
        --connect-timeout 5 --max-time 10 \
        "${LOAD_BALANCER_URL}/health" 2>/dev/null || echo "000")
    END_TIME_MS=$(date +%s%3N)
    LATENCY=$((END_TIME_MS - START_TIME))

    ((TOTAL_CHECKS++))

    if [ "$HTTP_CODE" = "200" ]; then
        if [ $LATENCY -gt $MAX_P95_LATENCY ]; then
            log_warn "⚠️  High latency on load balancer: ${LATENCY}ms (threshold: ${MAX_P95_LATENCY}ms)"
            ((FAILED_CHECKS++))
        else
            log_info "✅ Load balancer healthy: HTTP $HTTP_CODE, ${LATENCY}ms"
        fi
    else
        log_error "❌ Load balancer error: HTTP $HTTP_CODE"
        ((FAILED_CHECKS++))
    fi
}

check_server_health() {
    local server_name=$1
    local server_ip=${2:-}

    if [ "$MONITORING_STRATEGY" = "ssh" ]; then
        check_server_health_ssh "$server_name" "$server_ip"
    else
        check_server_health_http "$server_name"
    fi
}

################################################################################
# Main monitoring loop
################################################################################

log_info "Starting monitoring loop (Ctrl+C to stop)..."

while [ $(date +%s) -lt $END_TIME ]; do
    CURRENT_TIME=$(date '+%Y-%m-%d %H:%M:%S')

    case $SERVER in
        blue)
            check_server_health "blue" "$BLUE_IP"
            ;;
        green)
            check_server_health "green" "$GREEN_IP"
            ;;
        all)
            check_server_health "blue" "$BLUE_IP"
            check_server_health "green" "$GREEN_IP"
            ;;
    esac

    # Calculate current error rate
    if [ $TOTAL_CHECKS -gt 0 ]; then
        # Use awk for reliable calculation (works with or without bc)
        ERROR_RATE=$(awk -v failed="$FAILED_CHECKS" -v total="$TOTAL_CHECKS" 'BEGIN {printf "%.4f", failed/total}')
        SUCCESS_RATE=$(awk -v failed="$FAILED_CHECKS" -v total="$TOTAL_CHECKS" 'BEGIN {printf "%.4f", 1-(failed/total)}')

        echo ""
        log_info "[$CURRENT_TIME] Stats: Checks=$TOTAL_CHECKS, Errors=$FAILED_CHECKS, Error Rate=$ERROR_RATE, Success Rate=$SUCCESS_RATE"

        # Check if error rate exceeds threshold (awk comparison for portability)
        ERROR_EXCEEDED=$(awk -v rate="$ERROR_RATE" -v max="$MAX_ERROR_RATE" 'BEGIN {print (rate > max) ? 1 : 0}')
        SUCCESS_BELOW=$(awk -v rate="$SUCCESS_RATE" -v min="$MIN_SUCCESS_RATE" 'BEGIN {print (rate < min) ? 1 : 0}')

        if [ "$ERROR_EXCEEDED" = "1" ]; then
            log_error "⚠️  ERROR RATE THRESHOLD EXCEEDED: $ERROR_RATE > $MAX_ERROR_RATE"
        fi

        if [ "$SUCCESS_BELOW" = "1" ]; then
            log_error "⚠️  SUCCESS RATE BELOW THRESHOLD: $SUCCESS_RATE < $MIN_SUCCESS_RATE"
        fi
    fi

    # Sleep between checks (every 30 seconds)
    sleep 30
done

################################################################################
# Summary
################################################################################

echo ""
log_info "=================================================="
log_info "Monitoring Summary"
log_info "=================================================="
log_info "Duration: $DURATION_MINUTES minutes"
log_info "Total checks: $TOTAL_CHECKS"
log_info "Failed checks: $FAILED_CHECKS"

if [ $TOTAL_CHECKS -gt 0 ]; then
    # Use awk for final calculations (works with or without bc)
    FINAL_ERROR_RATE=$(awk -v failed="$FAILED_CHECKS" -v total="$TOTAL_CHECKS" 'BEGIN {printf "%.4f", failed/total}')
    FINAL_SUCCESS_RATE=$(awk -v failed="$FAILED_CHECKS" -v total="$TOTAL_CHECKS" 'BEGIN {printf "%.4f", 1-(failed/total)}')

    log_info "Final error rate: $FINAL_ERROR_RATE"
    log_info "Final success rate: $FINAL_SUCCESS_RATE"
    log_info "Monitoring strategy: $MONITORING_STRATEGY"

    # Determine exit code (awk comparison for portability)
    ERROR_EXCEEDED=$(awk -v rate="$FINAL_ERROR_RATE" -v max="$MAX_ERROR_RATE" 'BEGIN {print (rate > max) ? 1 : 0}')
    SUCCESS_BELOW=$(awk -v rate="$FINAL_SUCCESS_RATE" -v min="$MIN_SUCCESS_RATE" 'BEGIN {print (rate < min) ? 1 : 0}')

    if [ "$ERROR_EXCEEDED" = "1" ]; then
        log_error "❌ MONITORING FAILED - Error rate exceeded threshold"
        exit 1
    elif [ "$SUCCESS_BELOW" = "1" ]; then
        log_error "❌ MONITORING FAILED - Success rate below threshold"
        exit 1
    else
        log_info "✅ MONITORING PASSED - All metrics within acceptable limits"
        exit 0
    fi
else
    log_warn "No checks performed"
    exit 0
fi
