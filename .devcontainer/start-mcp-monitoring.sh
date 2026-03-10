#!/bin/bash
# MCP Monitoring Script for Codespaces
# Continuously monitors MCP server health and performance

LOG_FILE="/tmp/mcp-monitoring.log"
INTERVAL=30

echo "🖥️  Starting MCP monitoring (interval: ${INTERVAL}s)..." | tee -a "$LOG_FILE"

while true; do
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Check MCP server health
    if curl -s http://localhost:3001/health > /dev/null; then
        # Get metrics
        metrics=$(curl -s http://localhost:3001/metrics || echo "metrics_unavailable")
        
        # Extract key metrics (simplified for demo)
        requests_total=$(echo "$metrics" | grep -E "mcp_requests_total" | head -1 || echo "N/A")
        response_time=$(echo "$metrics" | grep -E "mcp_response_time" | head -1 || echo "N/A")
        
        echo "[$timestamp] ✅ MCP server healthy - Requests: $requests_total, Response time: $response_time" >> "$LOG_FILE"
        
        # Check for high error rates or slow responses (simplified monitoring)
        error_rate=$(echo "$metrics" | grep -E "mcp_errors_total" | head -1 || echo "0")
        if [[ "$error_rate" == *"error"* ]]; then
            echo "[$timestamp] ⚠️  High error rate detected" | tee -a "$LOG_FILE"
        fi
        
    else
        echo "[$timestamp] ❌ MCP server not responding" | tee -a "$LOG_FILE"
        
        # Attempt to restart if server is down
        echo "[$timestamp] 🔄 Attempting to restart MCP server..." | tee -a "$LOG_FILE"
        cd /workspace && pnpm nx serve mcp-server > /tmp/mcp-server.log 2>&1 &
        sleep 10
    fi
    
    sleep "$INTERVAL"
done