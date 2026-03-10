#!/usr/bin/env bash
#
# Service Discovery Script - Enterprise Grade
#
# Purpose: Discover all Ectropy services running on the server
# regardless of how they were started (systemd, PM2, Docker, native)
#
# Usage: ./discover-services.sh [--json]
#
# Output: Comprehensive service inventory with evidence logging
#
# Exit Codes:
#   0 - Discovery completed successfully
#   1 - Discovery failed (script error)

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
}

# Parse arguments
OUTPUT_JSON=false
if [[ "${1:-}" == "--json" ]]; then
    OUTPUT_JSON=true
fi

echo "========================================"
echo "🔍 Ectropy Service Discovery"
echo "========================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Hostname: $(hostname)"
echo "User: $(whoami)"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Discover systemd services
echo "========================================"
echo "1️⃣  SYSTEMD SERVICES"
echo "========================================"
SYSTEMD_SERVICES=$(systemctl list-units --all --type=service 2>/dev/null | grep -i ectropy || true)
if [[ -n "$SYSTEMD_SERVICES" ]]; then
    log_info "Found systemd services:"
    echo "$SYSTEMD_SERVICES"
    echo ""
else
    log_info "No systemd services found matching 'ectropy'"
    echo ""
fi

# 2. Discover PM2 processes
echo "========================================"
echo "2️⃣  PM2 PROCESSES"
echo "========================================"
if command_exists pm2; then
    log_info "PM2 is installed, checking for processes..."
    PM2_LIST=$(pm2 list 2>/dev/null || true)
    if [[ -n "$PM2_LIST" ]]; then
        echo "$PM2_LIST"
        echo ""

        # Check specifically for ectropy-related processes
        PM2_ECTROPY=$(echo "$PM2_LIST" | grep -i ectropy || true)
        if [[ -n "$PM2_ECTROPY" ]]; then
            log_warning "Found Ectropy-related PM2 processes"
        fi
    else
        log_info "No PM2 processes running"
    fi
else
    log_info "PM2 not installed"
fi
echo ""

# 3. Discover Docker containers
echo "========================================"
echo "3️⃣  DOCKER CONTAINERS"
echo "========================================"
if command_exists docker; then
    log_info "Docker is installed, checking for containers..."

    # Running containers
    RUNNING_CONTAINERS=$(docker ps --filter "name=ectropy" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true)
    if [[ -n "$RUNNING_CONTAINERS" ]] && [[ "$RUNNING_CONTAINERS" != "CONTAINER ID"* ]] || [[ $(echo "$RUNNING_CONTAINERS" | wc -l) -gt 1 ]]; then
        log_warning "Found RUNNING Ectropy containers:"
        echo "$RUNNING_CONTAINERS"
        echo ""
    else
        log_info "No running Ectropy containers"
        echo ""
    fi

    # Stopped containers
    STOPPED_CONTAINERS=$(docker ps -a --filter "name=ectropy" --filter "status=exited" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}" 2>/dev/null || true)
    if [[ -n "$STOPPED_CONTAINERS" ]] && [[ "$STOPPED_CONTAINERS" != "CONTAINER ID"* ]] || [[ $(echo "$STOPPED_CONTAINERS" | wc -l) -gt 1 ]]; then
        log_info "Found STOPPED Ectropy containers:"
        echo "$STOPPED_CONTAINERS"
        echo ""
    else
        log_info "No stopped Ectropy containers"
        echo ""
    fi
else
    log_warning "Docker not installed"
    echo ""
fi

# 4. Discover native Node.js processes
echo "========================================"
echo "4️⃣  NATIVE NODE.JS PROCESSES"
echo "========================================"
log_info "Searching for Node.js processes related to Ectropy..."
NODE_PROCESSES=$(ps aux | grep -E "node.*ectropy|node.*api-gateway|node.*mcp-server|node.*web-dashboard" | grep -v grep || true)
if [[ -n "$NODE_PROCESSES" ]]; then
    log_warning "Found native Node.js processes:"
    echo "$NODE_PROCESSES"
    echo ""
else
    log_info "No native Node.js processes found"
    echo ""
fi

# 5. Discover port usage
echo "========================================"
echo "5️⃣  PORT USAGE ANALYSIS"
echo "========================================"
log_info "Checking critical ports for Ectropy services..."
PORTS=(3000 3001 3002 4000 5432 6379)
PORT_ISSUES=false

for port in "${PORTS[@]}"; do
    echo "Port $port:"
    if command_exists lsof; then
        PORT_INFO=$(lsof -i:"$port" -sTCP:LISTEN 2>/dev/null || true)
        if [[ -n "$PORT_INFO" ]]; then
            log_warning "IN USE"
            echo "$PORT_INFO"
            PORT_ISSUES=true
        else
            log_success "FREE"
        fi
    else
        # Fallback to netstat if lsof not available
        PORT_INFO=$(netstat -tlnp 2>/dev/null | grep ":$port " || true)
        if [[ -n "$PORT_INFO" ]]; then
            log_warning "IN USE"
            echo "$PORT_INFO"
            PORT_ISSUES=true
        else
            log_success "FREE"
        fi
    fi
    echo ""
done

# 6. Discover native database services
echo "========================================"
echo "6️⃣  NATIVE DATABASE SERVICES"
echo "========================================"
DATABASE_SERVICES=(postgresql redis-server)
for service in "${DATABASE_SERVICES[@]}"; do
    echo "Checking $service:"
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        log_warning "RUNNING (will conflict with Docker)"
        systemctl status "$service" --no-pager --lines=3 || true
    else
        log_success "NOT RUNNING (OK for Docker)"
    fi
    echo ""
done

# Summary
echo "========================================"
echo "📊 DISCOVERY SUMMARY"
echo "========================================"

TOTAL_ISSUES=0

if [[ -n "$SYSTEMD_SERVICES" ]]; then
    log_warning "Found systemd services that need to be stopped"
    ((TOTAL_ISSUES++))
fi

if command_exists pm2 && [[ -n "$(pm2 list 2>/dev/null | grep -i ectropy || true)" ]]; then
    log_warning "Found PM2 processes that need to be stopped"
    ((TOTAL_ISSUES++))
fi

if command_exists docker && [[ -n "$(docker ps -q --filter 'name=ectropy' 2>/dev/null || true)" ]]; then
    log_warning "Found running Docker containers that need to be stopped"
    ((TOTAL_ISSUES++))
fi

if [[ -n "$NODE_PROCESSES" ]]; then
    log_warning "Found native Node.js processes that need to be stopped"
    ((TOTAL_ISSUES++))
fi

if [[ "$PORT_ISSUES" == "true" ]]; then
    log_warning "Found ports in use that need to be freed"
    ((TOTAL_ISSUES++))
fi

echo ""
if [[ $TOTAL_ISSUES -eq 0 ]]; then
    log_success "All clear! No conflicting services found."
    echo "✅ Ready for deployment"
else
    log_warning "Found $TOTAL_ISSUES potential issues that need cleanup"
    echo "⚠️  Run cleanup-all-services.sh before deployment"
fi

echo ""
echo "========================================"
echo "Discovery completed at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

exit 0
