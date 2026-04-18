#!/bin/bash
################################################################################
# ENTERPRISE HEALTH VALIDATION SCRIPT
# Validates health of deployed services on blue or green server
#
# Usage: ./validate-health.sh <blue|green|all>
# Example: ./validate-health.sh blue
#          ./validate-health.sh all
#
# Exit codes:
#   0 - All health checks passed
#   1 - One or more health checks failed
################################################################################

set -euo pipefail

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

log_step() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

# Server configuration
# ENTERPRISE FIX (2025-12-10): Use environment variables instead of hardcoded IPs
BLUE_IP="${PROD_BLUE_IP:-161.35.226.36}"
GREEN_IP="${PROD_GREEN_IP:-143.198.231.147}"

# Health check configuration
TIMEOUT=30
RETRIES=3
RETRY_DELAY=5

# Track overall status
CHECKS_PASSED=0
CHECKS_FAILED=0

# Parse arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <blue|green|all>"
    exit 1
fi

TARGET=$1

################################################################################
# Diagnostic collection function
################################################################################

collect_diagnostics() {
    local server=$1
    local server_ip=$2
    local failed_service=$3

    log_error "==================================================="
    log_error "COLLECTING DIAGNOSTIC INFORMATION"
    log_error "==================================================="

    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server_ip << 'DIAGSSH'
set -e
cd /opt/ectropy

echo ""
echo "======================================"
echo "DIAGNOSTIC REPORT - Health Check Failure"
echo "======================================"
echo ""

echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

echo "Container Status:"
docker-compose ps
echo ""

echo "All Containers (including stopped):"
docker ps -a --filter "name=ectropy-"
echo ""

echo "API Gateway Container Logs (last 200 lines):"
docker-compose logs --tail=200 api-gateway
echo ""

echo "MCP Server Container Logs (last 100 lines):"
docker-compose logs --tail=100 mcp-server
echo ""

echo "Web Dashboard Container Logs (last 50 lines):"
docker-compose logs --tail=50 web-dashboard
echo ""

echo "System Resources:"
echo "Memory: $(free -h | grep Mem: | awk '{print $3 "/" $2 " (" int($3/$2*100) "% used)"}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
echo "CPU Load: $(uptime | awk -F'load average:' '{print $2}')"
echo ""

echo "Docker Network Status:"
docker network inspect ectropy-network | grep -A 10 "Containers" || echo "Network inspection failed"
echo ""

echo "Recent Docker Events (last 50):"
docker events --since 5m --until 0s 2>&1 | tail -50 || echo "No recent events"
echo ""

echo "======================================"
DIAGSSH
}

################################################################################
# Health check function (External - for load balancer endpoints)
################################################################################

check_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local timeout="${4:-$TIMEOUT}"
    local server="${5:-unknown}"
    local server_ip="${6:-unknown}"

    log_step "Checking: $name"
    echo "  URL: $url"
    echo "  Expected status: $expected_status"

    for i in $(seq 1 $RETRIES); do
        if [ $i -gt 1 ]; then
            log_warn "Retry attempt $i/$RETRIES after ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi

        # Perform health check
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $timeout --max-time $timeout "$url" || echo "000")

        if [ "$HTTP_CODE" = "$expected_status" ]; then
            log_info "✅ PASSED: $name (HTTP $HTTP_CODE)"
            ((CHECKS_PASSED++)) || true
            return 0
        else
            log_warn "Attempt $i failed: HTTP $HTTP_CODE (expected $expected_status)"
        fi
    done

    log_error "❌ FAILED: $name (HTTP $HTTP_CODE after $RETRIES attempts)"
    ((CHECKS_FAILED++)) || true

    # ENTERPRISE FIX (2025-12-17): Automatic diagnostic collection on health check failure
    # Collect container logs and system state to enable root cause analysis
    if [ "$server" != "unknown" ] && [ "$server_ip" != "unknown" ]; then
        collect_diagnostics "$server" "$server_ip" "$name"
    fi

    return 1
}

################################################################################
# SSH-based health check function (ROOT CAUSE #26 FIX - 2025-12-19)
# Executes health check FROM INSIDE the server (bypasses firewall)
#
# Context: Production firewall blocks external access to service health ports
# (4000, 3001, 3002), causing health validation failures despite containers
# being healthy. SSH-based checks execute from inside the server using
# localhost URLs, bypassing firewall while testing actual service health.
#
# This aligns with:
# - Docker health check pattern (internal network access)
# - Enterprise security (firewall remains restrictive)
# - Industry best practice (AWS SSM, Kubernetes liveness probes)
################################################################################

check_endpoint_via_ssh() {
    local name="$1"
    local server_ip="$2"
    local url="$3"  # Use localhost URLs since we execute from inside
    local expected_status="${4:-200}"
    local timeout="${5:-$TIMEOUT}"
    local server="${6:-unknown}"
    local server_ip_fallback="${7:-unknown}"

    log_step "Checking: $name"
    echo "  Server: $server_ip"
    echo "  URL (internal): $url"
    echo "  Expected status: $expected_status"

    for i in $(seq 1 $RETRIES); do
        if [ $i -gt 1 ]; then
            log_warn "Retry attempt $i/$RETRIES after ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
        fi

        # Execute health check FROM INSIDE the server via SSH
        # This bypasses firewall restrictions and tests actual service health
        HTTP_CODE=$(ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server_ip \
            "curl -s -o /dev/null -w '%{http_code}' --connect-timeout $timeout --max-time $timeout '$url' 2>/dev/null || echo '000'" 2>/dev/null || echo "000")

        if [ "$HTTP_CODE" = "$expected_status" ]; then
            log_info "✅ PASSED: $name (HTTP $HTTP_CODE)"
            ((CHECKS_PASSED++)) || true
            return 0
        else
            log_warn "Attempt $i failed: HTTP $HTTP_CODE (expected $expected_status)"
        fi
    done

    log_error "❌ FAILED: $name (HTTP $HTTP_CODE after $RETRIES attempts)"
    ((CHECKS_FAILED++)) || true

    # Collect diagnostics on failure
    local diag_server="${server:-unknown}"
    local diag_ip="${server_ip_fallback:-$server_ip}"
    if [ "$diag_server" != "unknown" ] && [ "$diag_ip" != "unknown" ]; then
        collect_diagnostics "$diag_server" "$diag_ip" "$name"
    fi

    return 1
}

################################################################################
# Server health validation
################################################################################

validate_server() {
    local server=$1
    local server_ip=$2

    log_info "=================================================="
    log_info "Validating health of $server server ($server_ip)"
    log_info "=================================================="

    # ENTERPRISE ARCHITECTURE (2025-12-17): Docker Container Health Validation
    # Production uses fully containerized deployment with Docker health checks
    # Validate container health status instead of filesystem checks

    log_step "Checking: Docker Container Health on $server server"

    # Array of critical containers to check
    CONTAINERS=("ectropy-nginx" "ectropy-api-gateway" "ectropy-web-dashboard" "ectropy-mcp" "ectropy-redis")

    for container in "${CONTAINERS[@]}"; do
        echo "  Verifying: $container"

        # Check if container is running and healthy
        # Wait up to 5 minutes for container to become healthy (containers may be starting)
        MAX_WAIT=300  # 5 minutes
        WAIT_INTERVAL=10  # Check every 10 seconds
        ELAPSED=0

        while [ $ELAPSED -lt $MAX_WAIT ]; do
            CONTAINER_STATUS=$(ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@$server_ip \
                "docker inspect --format='{{.State.Status}}:{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' $container 2>/dev/null || echo 'not-found'")

            # Parse status
            RUNNING_STATUS=$(echo "$CONTAINER_STATUS" | cut -d: -f1)
            HEALTH_STATUS=$(echo "$CONTAINER_STATUS" | cut -d: -f2)

            if [ "$RUNNING_STATUS" = "not-found" ]; then
                log_error "❌ FAILED: $container - Container not found"
                ((CHECKS_FAILED++)) || true
                break
            elif [ "$RUNNING_STATUS" != "running" ]; then
                log_error "❌ FAILED: $container - Container not running (status: $RUNNING_STATUS)"
                ((CHECKS_FAILED++)) || true
                collect_diagnostics "$server" "$server_ip" "$container"
                break
            elif [ "$HEALTH_STATUS" = "healthy" ] || [ "$HEALTH_STATUS" = "no-healthcheck" ]; then
                log_info "✅ PASSED: $container - Running and healthy"
                ((CHECKS_PASSED++)) || true
                break
            elif [ "$HEALTH_STATUS" = "starting" ]; then
                if [ $ELAPSED -eq 0 ]; then
                    log_warn "Container $container health check still starting, waiting..."
                fi
                sleep $WAIT_INTERVAL
                ELAPSED=$((ELAPSED + WAIT_INTERVAL))
            elif [ "$HEALTH_STATUS" = "unhealthy" ]; then
                log_error "❌ FAILED: $container - Container unhealthy"
                ((CHECKS_FAILED++)) || true
                collect_diagnostics "$server" "$server_ip" "$container"
                break
            else
                log_warn "Unknown health status: $HEALTH_STATUS, waiting..."
                sleep $WAIT_INTERVAL
                ELAPSED=$((ELAPSED + WAIT_INTERVAL))
            fi
        done

        # Check if we timed out
        if [ $ELAPSED -ge $MAX_WAIT ] && [ "$HEALTH_STATUS" != "healthy" ] && [ "$HEALTH_STATUS" != "no-healthcheck" ]; then
            log_error "❌ FAILED: $container - Health check timeout after ${MAX_WAIT}s (status: $HEALTH_STATUS)"
            ((CHECKS_FAILED++)) || true
            collect_diagnostics "$server" "$server_ip" "$container"
        fi
    done

    # ENTERPRISE FIX (ROOT CAUSE #26 - 2025-12-19): SSH-Based Health Checks
    # Production firewall blocks external access to ports 4000, 3001, 3002
    # Execute health checks FROM INSIDE the server via SSH to bypass firewall
    # while maintaining security posture and testing actual service health
    #
    # Pattern: check_endpoint_via_ssh <name> <server_ip> <localhost_url> <status> <timeout> <server> <server_ip>

    # Check API Gateway Health (port 4000) - via SSH
    check_endpoint_via_ssh \
        "API Gateway Health ($server)" \
        "$server_ip" \
        "http://localhost:4000/health" \
        "200" \
        "$TIMEOUT" \
        "$server" \
        "$server_ip"

    # Check MCP Server Health (port 3001) - via SSH
    # NOTE: MCP server runs all endpoints on port 3001 (includes GraphQL and Express API)
    # Previous check for port 3002 removed as MCP doesn't listen on that port
    check_endpoint_via_ssh \
        "MCP Server Health ($server)" \
        "$server_ip" \
        "http://localhost:3001/health" \
        "200" \
        "$TIMEOUT" \
        "$server" \
        "$server_ip"
}

################################################################################
# Main execution
################################################################################

case $TARGET in
    blue)
        validate_server "blue" "$BLUE_IP"
        ;;
    green)
        validate_server "green" "$GREEN_IP"
        ;;
    all)
        validate_server "blue" "$BLUE_IP"
        echo ""
        validate_server "green" "$GREEN_IP"
        ;;
    *)
        log_error "Invalid target: $TARGET. Must be 'blue', 'green', or 'all'"
        exit 1
        ;;
esac

################################################################################
# Summary
################################################################################

echo ""
log_info "=================================================="
log_info "Health Validation Summary"
log_info "=================================================="
log_info "Checks Passed: $CHECKS_PASSED"

if [ $CHECKS_FAILED -gt 0 ]; then
    log_error "Checks Failed: $CHECKS_FAILED"
    log_error "❌ HEALTH VALIDATION FAILED"
    exit 1
else
    log_info "Checks Failed: 0"
    log_info "✅ ALL HEALTH CHECKS PASSED"
    exit 0
fi
