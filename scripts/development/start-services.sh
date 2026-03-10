#!/bin/bash

# Ectropy Platform Cross-Platform Service Startup
# Unix/Linux/macOS shell script for enterprise service management

set -e

SERVICE=${1:-"all"}
PRODUCTION=${2:-false}
DEBUG=${3:-false}

# Enterprise environment setup
export NODE_OPTIONS="--loader tsx --experimental-specifier-resolution=node --enable-source-maps"
export NODE_NO_WARNINGS=1
export ESM_LOADER_ENABLED=true

# Production environment overrides
if [[ "$PRODUCTION" == "true" ]]; then
    export NODE_ENV=production
    export NODE_OPTIONS="$NODE_OPTIONS --max-old-space-size=4096"
fi

# Debug environment setup
if [[ "$DEBUG" == "true" ]]; then
    export NODE_OPTIONS="$NODE_OPTIONS --inspect"
    echo "🐛 Debug mode enabled - attach debugger to process"
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${BLUE}$1${NC}"
}

function log_success() {
    echo -e "${GREEN}$1${NC}"
}

function log_warning() {
    echo -e "${YELLOW}$1${NC}"
}

function log_error() {
    echo -e "${RED}$1${NC}"
}

function check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

function wait_for_service() {
    local name=$1
    local port=$2
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if check_port $port; then
            log_success "✅ $name is ready on port $port"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 1
    done
    
    log_warning "⚠️  $name health check pending..."
    return 1
}

function start_service() {
    local name=$1
    local command=$2
    local port=$3
    
    log_info "🚀 Starting $name on port $port..."
    
    # Check if port is already in use
    if check_port $port; then
        log_warning "⚠️  Port $port already in use - stopping existing service"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Start service in background
    eval "$command" &
    local service_pid=$!
    echo $service_pid > "/tmp/ectropy-${name,,}-${port}.pid"
    
    # Wait for service to be ready
    wait_for_service "$name" $port
}

function start_all_services() {
    echo -e "${CYAN}🏢 Starting Ectropy Platform - Enterprise Mode${NC}"
    echo -e "${CYAN}==============================================${NC}"
    
    # Start infrastructure services
    log_info "📦 Starting infrastructure services..."
    docker compose -f docker-compose.dev.yml up -d
    sleep 10
    
    # Start application services
    start_service "API Gateway" "node --import tsx apps/api-gateway/src/main.ts" 4000
    start_service "MCP Server" "node --import tsx apps/mcp-server/src/main.ts" 3001
    start_service "Edge Server" "node --import tsx apps/edge-server/src/main.ts" 3002
    start_service "Web Dashboard" "pnpm nx serve web-dashboard" 4200
    
    echo ""
    log_success "🎯 All services started successfully!"
    echo -e "${WHITE}Dashboard: http://localhost:4200${NC}"
    echo -e "${WHITE}API Gateway: http://localhost:4000${NC}"
    echo -e "${WHITE}MCP Server: http://localhost:3001${NC}"
}

function stop_all_services() {
    echo -e "${CYAN}🛑 Stopping all Ectropy services...${NC}"
    
    # Stop PID-tracked services
    for pidfile in /tmp/ectropy-*.pid; do
        if [[ -f "$pidfile" ]]; then
            local pid=$(cat "$pidfile")
            if ps -p $pid > /dev/null 2>&1; then
                kill -TERM $pid
                log_info "Stopped service with PID $pid"
            fi
            rm -f "$pidfile"
        fi
    done
    
    # Stop infrastructure services
    docker compose -f docker-compose.dev.yml down
    
    log_success "✅ All services stopped"
}

# Main execution logic
echo -e "${CYAN}🏗️  Ectropy Platform Unix Startup${NC}"
echo -e "${CYAN}==================================${NC}"

case "$SERVICE" in
    "all")
        start_all_services
        ;;
    "api")
        start_service "API Gateway" "node --import tsx apps/api-gateway/src/main.ts" 4000
        ;;
    "mcp")
        start_service "MCP Server" "node --import tsx apps/mcp-server/src/main.ts" 3001
        ;;
    "edge")
        start_service "Edge Server" "node --import tsx apps/edge-server/src/main.ts" 3002
        ;;
    "web")
        start_service "Web Dashboard" "pnpm nx serve web-dashboard" 4200
        ;;
    "infra")
        log_info "📦 Starting infrastructure services only..."
        docker compose -f docker-compose.dev.yml up -d
        ;;
    "stop")
        stop_all_services
        ;;
    *)
        log_error "❌ Invalid service: $SERVICE"
        echo -e "${WHITE}Valid options: all, api, mcp, edge, web, infra, stop${NC}"
        exit 1
        ;;
esac