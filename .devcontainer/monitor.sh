#!/bin/bash
# .devcontainer/monitor.sh - Enterprise DevContainer Monitoring and Logging
# Implements Step 7 from enterprise best practices

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}📊 [MONITOR]${NC} $1"; }
log_success() { echo -e "${GREEN}✅ [MONITOR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠️ [MONITOR]${NC} $1"; }
log_error() { echo -e "${RED}❌ [MONITOR]${NC} $1"; }

# Configuration
LOG_DIR=".devcontainer/logs"
COMPOSE_FILE=".devcontainer/docker-compose.yml"
MONITOR_INTERVAL=30
MAX_LOG_FILES=10

# Create log directory
mkdir -p "$LOG_DIR"

# Function to rotate log files
rotate_logs() {
    local pattern="$1"
    local max_files="$2"
    
    # Find matching files and sort by modification time (newest first)
    local files=($(find "$LOG_DIR" -name "$pattern" -type f -printf '%T@ %p\n' | sort -n -r | cut -d' ' -f2-))
    
    if [ ${#files[@]} -gt $max_files ]; then
        log_info "Rotating logs: keeping $max_files most recent files"
        for ((i=$max_files; i<${#files[@]}; i++)); do
            log_info "Removing old log: ${files[$i]}"
            rm -f "${files[$i]}"
        done
    fi
}

# Function to capture build logs
capture_build_logs() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local build_log="$LOG_DIR/build-$timestamp.log"
    
    log_info "Capturing build logs..."
    
    {
        echo "=== Docker Compose Build Log ==="
        echo "Timestamp: $(date)"
        echo "Compose File: $COMPOSE_FILE"
        echo ""
        
        if docker compose -f "$COMPOSE_FILE" build --no-cache 2>&1; then
            echo ""
            echo "=== Build completed successfully ==="
        else
            echo ""
            echo "=== Build failed ==="
        fi
        
    } > "$build_log"
    
    log_success "Build logs captured: $build_log"
    rotate_logs "build-*.log" $MAX_LOG_FILES
}

# Function to capture service logs
capture_service_logs() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local service_log="$LOG_DIR/services-$timestamp.log"
    
    log_info "Capturing service logs..."
    
    {
        echo "=== DevContainer Service Logs ==="
        echo "Timestamp: $(date)"
        echo ""
        
        echo "=== PostgreSQL Logs ==="
        docker compose -f "$COMPOSE_FILE" logs --tail=100 postgres 2>/dev/null || echo "PostgreSQL logs not available"
        echo ""
        
        echo "=== Redis Logs ==="
        docker compose -f "$COMPOSE_FILE" logs --tail=100 redis 2>/dev/null || echo "Redis logs not available"
        echo ""
        
        echo "=== Qdrant Logs ==="
        docker compose -f "$COMPOSE_FILE" logs --tail=100 qdrant 2>/dev/null || echo "Qdrant logs not available"
        echo ""
        
        echo "=== Workspace Logs ==="
        docker compose -f "$COMPOSE_FILE" logs --tail=100 workspace 2>/dev/null || echo "Workspace logs not available"
        echo ""
        
    } > "$service_log"
    
    log_success "Service logs captured: $service_log"
    rotate_logs "services-*.log" $MAX_LOG_FILES
}

# Function to monitor resource usage
monitor_resources() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local stats_log="$LOG_DIR/stats-$timestamp.log"
    
    log_info "Monitoring resource usage..."
    
    {
        echo "=== DevContainer Resource Usage ==="
        echo "Timestamp: $(date)"
        echo ""
        
        echo "=== Container Stats ==="
        if docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" 2>/dev/null; then
            echo ""
        else
            echo "Container stats not available"
        fi
        
        echo "=== Host System Resources ==="
        echo "CPU Usage:"
        if command -v top >/dev/null 2>&1; then
            top -bn1 | grep "Cpu(s)" || echo "CPU info not available"
        fi
        echo ""
        
        echo "Memory Usage:"
        if command -v free >/dev/null 2>&1; then
            free -h
        else
            echo "Memory info not available"
        fi
        echo ""
        
        echo "Disk Usage:"
        if command -v df >/dev/null 2>&1; then
            df -h /workspace 2>/dev/null || df -h .
        else
            echo "Disk info not available"
        fi
        echo ""
        
        echo "=== Docker System Usage ==="
        if docker system df 2>/dev/null; then
            echo ""
        else
            echo "Docker system info not available"
        fi
        
    } > "$stats_log"
    
    log_success "Resource stats captured: $stats_log"
    rotate_logs "stats-*.log" $MAX_LOG_FILES
}

# Function to check service health
monitor_health() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local health_log="$LOG_DIR/health-$timestamp.log"
    
    log_info "Monitoring service health..."
    
    {
        echo "=== DevContainer Health Status ==="
        echo "Timestamp: $(date)"
        echo ""
        
        echo "=== Service Status ==="
        if docker compose -f "$COMPOSE_FILE" ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}" 2>/dev/null; then
            echo ""
        else
            echo "Service status not available"
        fi
        
        echo "=== Detailed Health Checks ==="
        local services=("postgres" "redis" "qdrant" "workspace")
        for service in "${services[@]}"; do
            echo "--- $service ---"
            # Safe jq parsing that handles both array and object formats
            if docker compose -f "$COMPOSE_FILE" ps "$service" --format json 2>/dev/null | jq -r 'if type == "array" then .[0].Health // "No health check" else .Health // "No health check" end' 2>/dev/null; then
                echo ""
            else
                echo "Health status unavailable"
            fi
        done
        
        echo "=== Network Connectivity ==="
        echo "NPM Registry:"
        if curl -s --connect-timeout 5 https://registry.npmjs.org >/dev/null 2>&1; then
            echo "✅ OK"
        else
            echo "❌ FAILED"
        fi
        
        echo "GitHub:"
        if curl -s --connect-timeout 5 https://github.com >/dev/null 2>&1; then
            echo "✅ OK"
        else
            echo "❌ FAILED"
        fi
        echo ""
        
    } > "$health_log"
    
    log_success "Health status captured: $health_log"
    rotate_logs "health-*.log" $MAX_LOG_FILES
}

# Function to generate monitoring report
generate_report() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local report_file="$LOG_DIR/monitoring-report-$timestamp.html"
    
    log_info "Generating monitoring report..."
    
    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Ectropy DevContainer Monitoring Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f4f4f4; padding: 20px; border-radius: 5px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { color: green; }
        .warning { color: orange; }
        .error { color: red; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 3px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏥 Ectropy DevContainer Monitoring Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Workspace:</strong> $(pwd)</p>
    </div>

    <div class="section">
        <h2>📊 Current Status</h2>
        <pre>$(docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "Services not available")</pre>
    </div>

    <div class="section">
        <h2>💾 Resource Usage</h2>
        <pre>$(docker stats --no-stream 2>/dev/null || echo "Stats not available")</pre>
    </div>

    <div class="section">
        <h2>🔧 System Information</h2>
        <pre>
Docker Version: $(docker --version 2>/dev/null || echo "Not available")
Docker Compose: $(docker compose version 2>/dev/null || echo "Not available")
Host OS: $(uname -a 2>/dev/null || echo "Not available")
Available Memory: $(free -h 2>/dev/null | grep '^Mem:' || echo "Not available")
Disk Space: $(df -h /workspace 2>/dev/null | tail -1 || df -h . | tail -1 || echo "Not available")
        </pre>
    </div>

    <div class="section">
        <h2>📁 Log Files</h2>
        <ul>
$(find "$LOG_DIR" -name "*.log" -type f -printf "            <li><a href=\"%P\">%P</a> (%TY-%Tm-%Td %TH:%TM)</li>\n" | sort -r)
        </ul>
    </div>

    <div class="section">
        <h2>🔍 Recent Logs</h2>
        <h3>Latest Service Logs (last 50 lines)</h3>
        <pre>$(docker compose -f "$COMPOSE_FILE" logs --tail=50 2>/dev/null || echo "Logs not available")</pre>
    </div>

    <div class="footer">
        <p><em>Report generated by Ectropy DevContainer Monitor v1.0</em></p>
    </div>
</body>
</html>
EOF
    
    log_success "Monitoring report generated: $report_file"
    
    # Create symlink to latest report
    ln -sf "$(basename "$report_file")" "$LOG_DIR/latest-report.html"
    log_info "Latest report available at: $LOG_DIR/latest-report.html"
}

# Function to run continuous monitoring
continuous_monitor() {
    log_info "Starting continuous monitoring (interval: ${MONITOR_INTERVAL}s)"
    log_info "Press Ctrl+C to stop"
    
    while true; do
        echo ""
        log_info "Running monitoring cycle..."
        
        monitor_health
        monitor_resources
        
        log_info "Sleeping for ${MONITOR_INTERVAL}s..."
        sleep $MONITOR_INTERVAL
    done
}

# Function to clean old logs
cleanup_logs() {
    log_info "Cleaning up old logs..."
    
    # Keep only the most recent files
    rotate_logs "*.log" $MAX_LOG_FILES
    rotate_logs "*.html" 5
    
    log_success "Log cleanup completed"
}

# Function to display log summary
show_summary() {
    echo ""
    log_info "📋 DevContainer Monitoring Summary"
    echo "======================================"
    
    echo ""
    echo "📁 Log Directory: $LOG_DIR"
    echo "🔧 Compose File: $COMPOSE_FILE"
    echo "⏱️ Monitor Interval: ${MONITOR_INTERVAL}s"
    echo "🗂️ Max Log Files: $MAX_LOG_FILES"
    echo ""
    
    echo "📊 Available Logs:"
    if [ -d "$LOG_DIR" ]; then
        find "$LOG_DIR" -name "*.log" -type f -printf "  %P (%TY-%Tm-%Td %TH:%TM)\n" | sort -r | head -10
        
        local total_logs=$(find "$LOG_DIR" -name "*.log" -type f | wc -l)
        if [ $total_logs -gt 10 ]; then
            echo "  ... and $((total_logs - 10)) more files"
        fi
    else
        echo "  No logs found"
    fi
    
    echo ""
    echo "🔗 Quick Commands:"
    echo "  View latest health: cat $LOG_DIR/health-*.log | tail"
    echo "  View latest stats: cat $LOG_DIR/stats-*.log | tail"
    echo "  Open report: open $LOG_DIR/latest-report.html"
    echo "  Tail services: docker compose -f $COMPOSE_FILE logs -f"
    echo ""
}

# Main function
main() {
    case "${1:-summary}" in
        "capture")
            capture_service_logs
            capture_build_logs
            monitor_resources
            monitor_health
            ;;
        "build")
            capture_build_logs
            ;;
        "logs")
            capture_service_logs
            ;;
        "stats")
            monitor_resources
            ;;
        "health")
            monitor_health
            ;;
        "report")
            generate_report
            ;;
        "monitor")
            continuous_monitor
            ;;
        "cleanup")
            cleanup_logs
            ;;
        "summary")
            show_summary
            ;;
        *)
            echo "Ectropy DevContainer Monitor"
            echo ""
            echo "Usage: $0 {capture|build|logs|stats|health|report|monitor|cleanup|summary}"
            echo ""
            echo "Commands:"
            echo "  capture  - Capture all monitoring data"
            echo "  build    - Capture build logs only"
            echo "  logs     - Capture service logs only"
            echo "  stats    - Capture resource statistics"
            echo "  health   - Capture health status"
            echo "  report   - Generate HTML monitoring report"
            echo "  monitor  - Run continuous monitoring"
            echo "  cleanup  - Clean up old log files"
            echo "  summary  - Show monitoring summary (default)"
            echo ""
            echo "Environment variables:"
            echo "  MONITOR_INTERVAL  - Monitoring interval in seconds (default: 30)"
            echo "  MAX_LOG_FILES     - Maximum log files to keep (default: 10)"
            echo ""
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"