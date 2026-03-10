#!/bin/bash
set -euo pipefail

# =============================================================================
# ECTROPY PLATFORM - CONTINUOUS MONITORING ALERTS
# =============================================================================
# Real-time monitoring and alerting system for operational excellence
# This script implements priority #2: CONTINUOUS MONITORING ALERTS
# =============================================================================

echo "🔔 CONTINUOUS MONITORING ALERTS SETUP"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }

# =============================================================================
# CONFIGURATION - ALERT THRESHOLDS
# =============================================================================
RESPONSE_TIME_THRESHOLD=200  # milliseconds
ERROR_RATE_THRESHOLD=1       # percent
CPU_THRESHOLD=80             # percent
MEMORY_THRESHOLD=90          # percent
DISK_THRESHOLD=85            # percent
ALERT_CHECK_INTERVAL=30      # seconds

# Service endpoints to monitor
ENDPOINTS=(
    "http://localhost:3000/health|API Gateway"
    "http://localhost:3001/health|MCP Server" 
    "http://localhost:4200|Web Dashboard"
    "http://localhost:6379|Redis"
)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Install dependencies if needed
check_dependencies() {
    local deps_missing=0
    
    if ! command -v curl >/dev/null 2>&1; then
        print_warning "curl not found - installing..."
        apt-get update && apt-get install -y curl >/dev/null 2>&1 || deps_missing=1
    fi
    
    if ! command -v bc >/dev/null 2>&1; then
        print_warning "bc not found - installing for calculations..."
        apt-get update && apt-get install -y bc >/dev/null 2>&1 || {
            # Fallback: create simple bc function using python
            bc() {
                python3 -c "import sys; print(int(eval(sys.argv[1])))" "$1" 2>/dev/null || echo "0"
            }
            export -f bc
        }
    fi
    
    return $deps_missing
}

# Check service response time
check_response_time() {
    local url=$1
    local service_name=$2
    
    print_info "Checking response time for $service_name..."
    
    # Use curl to measure response time
    local response_time=$(curl -s -w "%{time_total}" -o /dev/null "$url" 2>/dev/null || echo "999")
    local response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null | cut -d. -f1)
    
    if [ "${response_ms}" -le "$RESPONSE_TIME_THRESHOLD" ]; then
        print_success "$service_name: ${response_ms}ms (✓ under ${RESPONSE_TIME_THRESHOLD}ms)"
        return 0
    else
        print_error "$service_name: ${response_ms}ms (⚠️ exceeds ${RESPONSE_TIME_THRESHOLD}ms threshold)"
        
        # Send alert
        send_alert "PERFORMANCE" "$service_name response time ${response_ms}ms exceeds threshold ${RESPONSE_TIME_THRESHOLD}ms"
        return 1
    fi
}

# Check system resources
check_system_resources() {
    print_info "Checking system resource utilization..."
    
    # CPU check
    if command -v top >/dev/null 2>&1; then
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | grep -o "[0-9.]*%us" | cut -d% -f1 | head -1 || echo "0")
        cpu_usage=${cpu_usage%.*} # Remove decimal part
        
        if [ "${cpu_usage:-0}" -gt "$CPU_THRESHOLD" ]; then
            print_error "CPU usage: ${cpu_usage}% (exceeds ${CPU_THRESHOLD}% threshold)"
            send_alert "RESOURCE" "CPU usage ${cpu_usage}% exceeds threshold ${CPU_THRESHOLD}%"
        else
            print_success "CPU usage: ${cpu_usage}% (within threshold)"
        fi
    fi
    
    # Memory check
    if command -v free >/dev/null 2>&1; then
        local memory_info=$(free | grep "^Mem:")
        local total_mem=$(echo "$memory_info" | awk '{print $2}')
        local used_mem=$(echo "$memory_info" | awk '{print $3}')
        local memory_pct=$(echo "scale=0; $used_mem * 100 / $total_mem" | bc 2>/dev/null || echo "0")
        
        if [ "${memory_pct:-0}" -gt "$MEMORY_THRESHOLD" ]; then
            print_error "Memory usage: ${memory_pct}% (exceeds ${MEMORY_THRESHOLD}% threshold)"
            send_alert "RESOURCE" "Memory usage ${memory_pct}% exceeds threshold ${MEMORY_THRESHOLD}%"
        else
            print_success "Memory usage: ${memory_pct}% (within threshold)"
        fi
    fi
    
    # Disk check
    if command -v df >/dev/null 2>&1; then
        local disk_usage=$(df / | tail -1 | awk '{print $5}' | cut -d% -f1 || echo "0")
        
        if [ "${disk_usage:-0}" -gt "$DISK_THRESHOLD" ]; then
            print_error "Disk usage: ${disk_usage}% (exceeds ${DISK_THRESHOLD}% threshold)"
            send_alert "RESOURCE" "Disk usage ${disk_usage}% exceeds threshold ${DISK_THRESHOLD}%"
        else
            print_success "Disk usage: ${disk_usage}% (within threshold)"
        fi
    fi
}

# Check Docker container health
check_container_health() {
    if command -v docker >/dev/null 2>&1; then
        print_info "Checking Docker container health..."
        
        # Get container stats
        local containers=$(docker ps --format "{{.Names}}" | grep -E "(api-gateway|mcp|postgres|redis)" || echo "")
        
        if [ -n "$containers" ]; then
            while read -r container; do
                if [ -n "$container" ]; then
                    local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
                    local cpu_usage=$(docker stats --no-stream --format "{{.CPUPerc}}" "$container" 2>/dev/null | tr -d '%' || echo "0")
                    
                    if [ "$status" = "healthy" ] || [ "$status" = "unknown" ]; then
                        print_success "Container $container: healthy (CPU: ${cpu_usage}%)"
                    else
                        print_error "Container $container: $status"
                        send_alert "CONTAINER" "Container $container status: $status"
                    fi
                    
                    # Check container resource usage
                    if (( $(echo "${cpu_usage:-0} > $CPU_THRESHOLD" | bc -l 2>/dev/null || echo "0") )); then
                        print_warning "Container $container CPU usage: ${cpu_usage}%"
                        send_alert "CONTAINER" "Container $container CPU usage ${cpu_usage}% exceeds threshold"
                    fi
                fi
            done <<< "$containers"
        else
            print_info "No monitored containers currently running"
        fi
    else
        print_info "Docker not available - skipping container health checks"
    fi
}

# Send alert (placeholder - integrate with your alerting system)
send_alert() {
    local alert_type=$1
    local message=$2
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Log alert to file
    local alerts_log="${PROJECT_ROOT}/logs/alerts.log"
    mkdir -p "$(dirname "$alerts_log")"
    echo "[$timestamp] [$alert_type] $message" >> "$alerts_log"
    
    # Console notification
    print_error "🚨 ALERT [$alert_type] $message"
    
    # TODO: Integrate with external alerting systems:
    # - Slack webhook
    # - Email notifications  
    # - PagerDuty
    # - Grafana alerts
    # - Custom webhook endpoints
    
    # Example webhook call (uncomment and configure):
    # curl -X POST "$WEBHOOK_URL" -H "Content-Type: application/json" -d "{\"alert\":\"$alert_type\",\"message\":\"$message\",\"timestamp\":\"$timestamp\"}"
}

# =============================================================================
# MONITORING LOOP FUNCTIONS
# =============================================================================

# Single monitoring check
run_monitoring_check() {
    local timestamp=$(date)
    print_info "🔍 Running monitoring check at $timestamp"
    
    local alerts_triggered=0
    
    # Check all service endpoints
    for endpoint_info in "${ENDPOINTS[@]}"; do
        IFS='|' read -r url service_name <<< "$endpoint_info"
        if ! check_response_time "$url" "$service_name"; then
            alerts_triggered=$((alerts_triggered + 1))
        fi
    done
    
    # Check system resources
    check_system_resources
    
    # Check container health
    check_container_health
    
    if [ $alerts_triggered -eq 0 ]; then
        print_success "✅ All systems healthy"
    else
        print_warning "⚠️ $alerts_triggered alerts triggered"
    fi
    
    echo "───────────────────────────────────────────"
}

# Continuous monitoring loop
start_continuous_monitoring() {
    print_info "🚀 Starting continuous monitoring (interval: ${ALERT_CHECK_INTERVAL}s)"
    print_info "Press Ctrl+C to stop monitoring"
    print_info "Logs: ${PROJECT_ROOT}/logs/alerts.log"
    echo ""
    
    # Create PID file
    echo $$ > "${PROJECT_ROOT}/monitoring.pid"
    
    # Trap signals for clean shutdown
    trap 'print_info "🛑 Stopping monitoring..."; rm -f "${PROJECT_ROOT}/monitoring.pid"; exit 0' INT TERM
    
    while true; do
        run_monitoring_check
        sleep "$ALERT_CHECK_INTERVAL"
    done
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

# Check for command line arguments
case "${1:-}" in
    "start"|"")
        check_dependencies
        print_success "✅ Monitoring alerts system initialized"
        echo ""
        print_info "Configuration:"
        echo "  • Response Time Threshold: ${RESPONSE_TIME_THRESHOLD}ms"
        echo "  • Error Rate Threshold: ${ERROR_RATE_THRESHOLD}%"
        echo "  • CPU Threshold: ${CPU_THRESHOLD}%"
        echo "  • Memory Threshold: ${MEMORY_THRESHOLD}%"
        echo "  • Check Interval: ${ALERT_CHECK_INTERVAL}s"
        echo ""
        
        if [ "${1:-}" = "start" ]; then
            start_continuous_monitoring
        else
            # Run single check
            run_monitoring_check
            print_info "Single monitoring check completed"
            print_info "To start continuous monitoring: $0 start"
        fi
        ;;
    "stop")
        if [ -f "${PROJECT_ROOT}/monitoring.pid" ]; then
            local pid=$(cat "${PROJECT_ROOT}/monitoring.pid")
            if kill "$pid" 2>/dev/null; then
                print_success "Monitoring stopped (PID: $pid)"
                rm -f "${PROJECT_ROOT}/monitoring.pid"
            else
                print_error "Failed to stop monitoring process"
            fi
        else
            print_warning "Monitoring not currently running"
        fi
        ;;
    "status")
        if [ -f "${PROJECT_ROOT}/monitoring.pid" ]; then
            local pid=$(cat "${PROJECT_ROOT}/monitoring.pid")
            if kill -0 "$pid" 2>/dev/null; then
                print_success "Monitoring is running (PID: $pid)"
                
                # Show recent alerts
                local alerts_log="${PROJECT_ROOT}/logs/alerts.log"
                if [ -f "$alerts_log" ]; then
                    print_info "Recent alerts:"
                    tail -n 5 "$alerts_log" | while read -r line; do
                        echo "  $line"
                    done
                fi
            else
                print_warning "Monitoring PID file exists but process is not running"
                rm -f "${PROJECT_ROOT}/monitoring.pid"
            fi
        else
            print_info "Monitoring is not running"
        fi
        ;;
    "test")
        print_info "🧪 Testing alert system..."
        send_alert "TEST" "Alert system test message"
        print_success "Test alert sent - check logs/alerts.log"
        ;;
    "help"|"-h"|"--help")
        echo "Ectropy Continuous Monitoring Alerts System"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  (none)    Run single monitoring check"
        echo "  start     Start continuous monitoring"
        echo "  stop      Stop continuous monitoring"
        echo "  status    Show monitoring status and recent alerts"
        echo "  test      Send test alert"
        echo "  help      Show this help message"
        echo ""
        echo "Configuration can be modified by editing threshold variables in this script."
        ;;
    *)
        print_error "Unknown command: $1"
        print_info "Use '$0 help' for usage information"
        exit 1
        ;;
esac