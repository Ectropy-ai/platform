#!/bin/bash
# scripts/mcp-status-dashboard.sh
# Quick MCP status dashboard for production monitoring

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
MCP_ENDPOINT=${MCP_ENDPOINT:-"http://localhost:3001"}
REFRESH_INTERVAL=${REFRESH_INTERVAL:-5}

display_header() {
    clear
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    MCP Status Dashboard                     ║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║ Endpoint: ${MCP_ENDPOINT:0:45}$(printf "%*s" $((45-${#MCP_ENDPOINT})) "")║${NC}"
    echo -e "${CYAN}║ Updated: $(date '+%Y-%m-%d %H:%M:%S')                              ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo
}

check_status() {
    local service="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    if command -v curl >/dev/null 2>&1; then
        local response
        response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null) || response="000"
        
        if [[ "$response" == "$expected_status" ]]; then
            echo -e "  ${GREEN}●${NC} $service"
            return 0
        else
            echo -e "  ${RED}●${NC} $service (HTTP $response)"
            return 1
        fi
    else
        echo -e "  ${YELLOW}●${NC} $service (curl not available)"
        return 1
    fi
}

get_json_value() {
    local url="$1"
    local key="$2"
    local default="${3:-N/A}"
    
    if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
        local value
        value=$(curl -s --max-time 5 "$url" 2>/dev/null | jq -r ".$key // \"$default\"" 2>/dev/null) || value="$default"
        echo "$value"
    else
        echo "$default"
    fi
}

display_services_status() {
    echo -e "${BLUE}📊 Service Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    check_status "MCP Server Health" "$MCP_ENDPOINT/health"
    check_status "MCP Server Metrics" "$MCP_ENDPOINT/metrics"
    
    echo
}

display_health_details() {
    echo -e "${BLUE}🏥 Health Details${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local status uptime env version memory_mb
    status=$(get_json_value "$MCP_ENDPOINT/health" "status")
    uptime=$(get_json_value "$MCP_ENDPOINT/health" "uptime")
    env=$(get_json_value "$MCP_ENDPOINT/health" "env")
    version=$(get_json_value "$MCP_ENDPOINT/health" "version")
    
    # Format uptime
    if [[ "$uptime" != "N/A" ]] && [[ "$uptime" =~ ^[0-9]+$ ]]; then
        local hours=$((uptime / 3600))
        local minutes=$(((uptime % 3600) / 60))
        local seconds=$((uptime % 60))
        uptime="${hours}h ${minutes}m ${seconds}s"
    fi
    
    # Get memory usage
    local memory_obj
    memory_obj=$(get_json_value "$MCP_ENDPOINT/health" "memory")
    if [[ "$memory_obj" != "N/A" ]] && command -v jq >/dev/null 2>&1; then
        memory_mb=$(curl -s --max-time 5 "$MCP_ENDPOINT/health" 2>/dev/null | jq -r '.memory.rss // 0' 2>/dev/null | awk '{print int($1/1024/1024)}')
    else
        memory_mb="N/A"
    fi
    
    printf "  Status: %s\n" "$status"
    printf "  Uptime: %s\n" "$uptime"
    printf "  Environment: %s\n" "$env"
    printf "  Version: %s\n" "$version"
    printf "  Memory: %s MB\n" "$memory_mb"
    
    echo
}

display_agents_status() {
    echo -e "${BLUE}🤖 Agent Status${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local credentials_file="config/agent-credentials.json"
    
    if [[ -f "$credentials_file" ]]; then
        if command -v jq >/dev/null 2>&1; then
            local total_agents expired_agents
            total_agents=$(jq '. | length' "$credentials_file" 2>/dev/null || echo "0")
            
            # Count expired agents
            local now_timestamp
            now_timestamp=$(date +%s)
            expired_agents=$(jq --arg now "$now_timestamp" '[.[] | select(((.expiresAt | strptime("%Y-%m-%dT%H:%M:%S.%fZ") | mktime)) < ($now | tonumber))] | length' "$credentials_file" 2>/dev/null || echo "0")
            
            local active_agents=$((total_agents - expired_agents))
            
            printf "  Total Agents: %d\n" "$total_agents"
            printf "  Active: %d\n" "$active_agents"
            printf "  Expired: %d\n" "$expired_agents"
            
            if [[ $total_agents -gt 0 ]]; then
                echo "  Recent agents:"
                jq -r '.[] | "    - \(.name) (\(.type))"' "$credentials_file" 2>/dev/null | head -3
            fi
        else
            echo "  ⚠️ jq not available for detailed agent info"
        fi
    else
        echo "  📭 No agent credentials found"
        echo "     Run: npm run mcp:agents:create"
    fi
    
    echo
}

display_metrics_preview() {
    echo -e "${BLUE}📈 Metrics Preview${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if command -v curl >/dev/null 2>&1; then
        local metrics
        metrics=$(curl -s --max-time 5 "$MCP_ENDPOINT/metrics" 2>/dev/null)
        
        if [[ -n "$metrics" ]]; then
            # Extract key metrics
            local requests_total response_time embeddings_total
            requests_total=$(echo "$metrics" | grep "mcp_requests_total" | tail -1 | awk '{print $2}' 2>/dev/null || echo "N/A")
            response_time=$(echo "$metrics" | grep "mcp_response_time_seconds" | grep "_sum" | awk '{print $2}' 2>/dev/null || echo "N/A")
            embeddings_total=$(echo "$metrics" | grep "mcp_embeddings_total" | tail -1 | awk '{print $2}' 2>/dev/null || echo "N/A")
            
            printf "  Total Requests: %s\n" "$requests_total"
            printf "  Response Time (sum): %s\n" "$response_time"
            printf "  Embeddings Generated: %s\n" "$embeddings_total"
            
            # Count available metrics
            local metric_count
            metric_count=$(echo "$metrics" | grep -c "^[a-zA-Z]" 2>/dev/null || echo "0")
            printf "  Available Metrics: %d\n" "$metric_count"
        else
            echo "  ❌ No metrics data available"
        fi
    else
        echo "  ⚠️ curl not available for metrics"
    fi
    
    echo
}

display_quick_tests() {
    echo -e "${BLUE}🧪 Quick Tests${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Test semantic search endpoint
    if command -v curl >/dev/null 2>&1; then
        local search_response
        search_response=$(curl -s -w "%{http_code}" -o /dev/null --max-time 5 \
            -X POST "$MCP_ENDPOINT/api/tools/call" \
            -H "Content-Type: application/json" \
            -d '{"tool":"semantic_search","parameters":{"query":"test"}}' 2>/dev/null)
        
        if [[ "$search_response" == "200" ]]; then
            echo -e "  ${GREEN}✓${NC} Semantic Search API"
        elif [[ "$search_response" == "401" ]]; then
            echo -e "  ${YELLOW}⚠${NC} Semantic Search API (auth required)"
        else
            echo -e "  ${RED}✗${NC} Semantic Search API (HTTP $search_response)"
        fi
    fi
    
    # Test database connection (if environment is available)
    if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
        if psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} Database Connection"
        else
            echo -e "  ${RED}✗${NC} Database Connection"
        fi
    fi
    
    echo
}

display_footer() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}Press Ctrl+C to exit | Refresh: ${REFRESH_INTERVAL}s | Commands: npm run mcp:*${NC}"
}

show_usage() {
    echo "MCP Status Dashboard"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --endpoint <url>    MCP endpoint (default: http://localhost:3001)"
    echo "  --interval <sec>    Refresh interval (default: 5)"
    echo "  --once              Run once and exit"
    echo "  --help              Show this help"
    echo
    echo "Environment Variables:"
    echo "  MCP_ENDPOINT        MCP server endpoint"
    echo "  REFRESH_INTERVAL    Refresh interval in seconds"
    echo "  DATABASE_URL        Database connection for additional checks"
    echo
}

main() {
    local run_once=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --endpoint)
                MCP_ENDPOINT="$2"
                shift 2
                ;;
            --interval)
                REFRESH_INTERVAL="$2"
                shift 2
                ;;
            --once)
                run_once=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate refresh interval
    if ! [[ "$REFRESH_INTERVAL" =~ ^[0-9]+$ ]] || [[ "$REFRESH_INTERVAL" -lt 1 ]]; then
        echo "Error: Invalid refresh interval: $REFRESH_INTERVAL"
        exit 1
    fi
    
    if [[ "$run_once" == true ]]; then
        display_header
        display_services_status
        display_health_details
        display_agents_status
        display_metrics_preview
        display_quick_tests
        display_footer
    else
        # Continuous mode
        while true; do
            display_header
            display_services_status
            display_health_details
            display_agents_status
            display_metrics_preview
            display_quick_tests
            display_footer
            
            sleep "$REFRESH_INTERVAL"
        done
    fi
}

# Handle Ctrl+C gracefully
trap 'echo -e "\n${CYAN}Dashboard stopped.${NC}"; exit 0' SIGINT

# Run main function
main "$@"