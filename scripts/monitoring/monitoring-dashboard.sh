#!/bin/bash

# Real-time Monitoring Dashboard for Ectropy Platform
# Collects metrics from all services and displays real-time health

set -euo pipefail

# Configuration
API_GATEWAY_URL="${API_GATEWAY_URL:-http://localhost:4000}"
MCP_SERVER_URL="${MCP_SERVER_URL:-http://localhost:3001}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REFRESH_INTERVAL="${REFRESH_INTERVAL:-5}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Metrics collection functions
get_api_gateway_health() {
    local start_time=$(date +%s%3N)
    local response_code
    local response_time
    
    response_code=$(curl -s -w "%{http_code}" -o /dev/null --max-time 5 "$API_GATEWAY_URL/health" 2>/dev/null || echo "000")
    local end_time=$(date +%s%3N)
    response_time=$((end_time - start_time))
    
    echo "${response_code}:${response_time}"
}

get_mcp_server_health() {
    local start_time=$(date +%s%3N)
    local response_code
    local response_time
    
    response_code=$(curl -s -w "%{http_code}" -o /dev/null --max-time 5 "$MCP_SERVER_URL/health" 2>/dev/null || echo "000")
    local end_time=$(date +%s%3N)
    response_time=$((end_time - start_time))
    
    echo "${response_code}:${response_time}"
}

get_database_connections() {
    local connections
    connections=$(docker exec postgres-dev psql -U postgres -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | tr -d ' ' || echo "N/A")
    echo "$connections"
}

get_redis_connections() {
    local connections
    connections=$(redis-cli -h "$REDIS_HOST" info clients 2>/dev/null | grep connected_clients | cut -d: -f2 | tr -d '\r' || echo "N/A")
    echo "$connections"
}

get_system_metrics() {
    local cpu_usage
    local memory_usage
    local disk_usage
    
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 || echo "N/A")
    memory_usage=$(free | grep Mem | awk '{printf "%.1f", ($3/$2) * 100.0}' || echo "N/A")
    disk_usage=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//' || echo "N/A")
    
    echo "${cpu_usage}:${memory_usage}:${disk_usage}"
}

format_health_status() {
    local code=$1
    local time=$2
    local service=$3
    
    if [[ "$code" == "200" ]]; then
        printf "${GREEN}✅ %s${NC} (%dms)\n" "$service" "$time"
    elif [[ "$code" == "000" ]]; then
        printf "${RED}❌ %s${NC} (Timeout/Error)\n" "$service"
    else
        printf "${YELLOW}⚠️ %s${NC} (HTTP %s, %dms)\n" "$service" "$code" "$time"
    fi
}

display_header() {
    clear
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}         🏗️ ECTROPY PLATFORM - REAL-TIME MONITORING DASHBOARD${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo
    echo -e "${BLUE}Monitoring Interval:${NC} ${REFRESH_INTERVAL}s | ${BLUE}Last Update:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
    echo
}

display_services_health() {
    echo -e "${BLUE}🚀 SERVICE HEALTH STATUS${NC}"
    echo "─────────────────────────────────────────"
    
    # API Gateway
    local api_health=$(get_api_gateway_health)
    local api_code="${api_health%:*}"
    local api_time="${api_health#*:}"
    format_health_status "$api_code" "$api_time" "API Gateway ($API_GATEWAY_URL)"
    
    # MCP Server
    local mcp_health=$(get_mcp_server_health)
    local mcp_code="${mcp_health%:*}"
    local mcp_time="${mcp_health#*:}"
    format_health_status "$mcp_code" "$mcp_time" "MCP Server ($MCP_SERVER_URL)"
    
    echo
}

display_database_status() {
    echo -e "${BLUE}💾 DATABASE & CACHE STATUS${NC}"
    echo "─────────────────────────────────────────"
    
    local db_connections=$(get_database_connections)
    local redis_connections=$(get_redis_connections)
    
    if [[ "$db_connections" != "N/A" ]]; then
        printf "${GREEN}🐘 PostgreSQL:${NC} %s active connections\n" "$db_connections"
    else
        printf "${RED}🐘 PostgreSQL:${NC} Connection failed\n"
    fi
    
    if [[ "$redis_connections" != "N/A" ]]; then
        printf "${GREEN}📦 Redis:${NC} %s connected clients\n" "$redis_connections"
    else
        printf "${RED}📦 Redis:${NC} Connection failed\n"
    fi
    
    echo
}

display_system_metrics() {
    echo -e "${BLUE}🖥️ SYSTEM RESOURCE USAGE${NC}"
    echo "─────────────────────────────────────────"
    
    local system_metrics=$(get_system_metrics)
    local cpu="${system_metrics%%:*}"
    local memory_disk="${system_metrics#*:}"
    local memory="${memory_disk%%:*}"
    local disk="${memory_disk#*:}"
    
    printf "${GREEN}CPU Usage:${NC} %s%%\n" "$cpu"
    printf "${GREEN}Memory Usage:${NC} %s%%\n" "$memory"
    printf "${GREEN}Disk Usage:${NC} %s%%\n" "$disk"
    
    echo
}

display_performance_thresholds() {
    echo -e "${BLUE}⚡ PERFORMANCE THRESHOLDS${NC}"
    echo "─────────────────────────────────────────"
    echo -e "${GREEN}✅ Response Time:${NC} <200ms (Target)"
    echo -e "${GREEN}✅ Availability:${NC} >99.9%"
    echo -e "${GREEN}✅ Error Rate:${NC} <0.1%"
    echo -e "${GREEN}✅ Database Connections:${NC} <100"
    echo
}

display_quick_actions() {
    echo -e "${BLUE}🛠️ QUICK ACTIONS${NC}"
    echo "─────────────────────────────────────────"
    echo "• Press Ctrl+C to stop monitoring"
    echo "• View logs: docker compose logs -f"
    echo "• Check CI/CD: ./scripts/health/repository-health-check.sh"
    echo "• Load test: ./scripts/load-test.sh"
    echo
}

main_monitoring_loop() {
    echo "🔍 Starting Ectropy Platform Monitoring Dashboard..."
    echo "Press Ctrl+C to stop"
    sleep 2
    
    while true; do
        display_header
        display_services_health
        display_database_status
        display_system_metrics
        display_performance_thresholds
        display_quick_actions
        
        # Alert if any service is down
        local api_health=$(get_api_gateway_health)
        local mcp_health=$(get_mcp_server_health)
        local api_code="${api_health%:*}"
        local mcp_code="${mcp_health%:*}"
        
        if [[ "$api_code" != "200" ]] || [[ "$mcp_code" != "200" ]]; then
            echo -e "${RED}🚨 ALERT: One or more services are unhealthy!${NC}"
            echo "Run diagnostics: ./scripts/health/repository-health-check.sh --verbose"
            echo
        fi
        
        sleep "$REFRESH_INTERVAL"
    done
}

# Handle interruption gracefully
trap 'echo -e "\n${BLUE}Monitoring dashboard stopped.${NC}"; exit 0' INT

# Start monitoring
main_monitoring_loop