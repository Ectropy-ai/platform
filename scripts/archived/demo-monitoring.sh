#!/bin/bash
# Demo of MCP Server Auto-Monitoring Capabilities
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_PORT=3001

echo "🎬 MCP Auto-Monitoring Demo"
echo "=========================="

cd "$REPO_ROOT"

# Start MCP server in background
echo "🚀 Starting MCP Server..."
node dist/apps/mcp-server/main.js &
MCP_PID=$!

# Wait for server to start
sleep 3

# Function to call MCP endpoints
call_endpoint() {
    local endpoint=$1
    local description=$2
    echo
    echo "📡 $description"
    echo "   Endpoint: http://localhost:$MCP_PORT$endpoint"
    
    if curl -s "http://localhost:$MCP_PORT$endpoint" | python3 -m json.tool 2>/dev/null; then
        echo "   ✅ Success"
    else
        echo "   ❌ Failed"
    fi
}

# Test all endpoints
call_endpoint "/health" "Basic Health Check"
call_endpoint "/monitor/health" "Comprehensive Health Analysis" 
call_endpoint "/monitor/start" "Start Auto-Monitoring"

echo
echo "⏳ Monitoring system is now running..."
echo "   • Health checks every 5 minutes"
echo "   • Auto-remediation for issues"
echo "   • Alerts when score < 90"
echo "   • Dashboard updates in tmp/health-dashboard.json"

# Show dashboard content
echo
echo "📊 Current Health Dashboard:"
if [ -f "tmp/health-dashboard.json" ]; then
    cat tmp/health-dashboard.json | python3 -m json.tool | head -20
    echo "   ..."
else
    echo "   Dashboard not yet created (run /monitor/health first)"
fi

call_endpoint "/monitor/stop" "Stop Auto-Monitoring"

# Cleanup
echo
echo "🧹 Cleaning up..."
kill $MCP_PID 2>/dev/null || true
wait $MCP_PID 2>/dev/null || true

echo
echo "✅ Demo completed!"
echo
echo "🎯 Key Features Demonstrated:"
echo "   • MCP Server with auto-monitoring"
echo "   • Health scoring (builds, tests, security, performance)"
echo "   • Automatic issue detection and remediation"
echo "   • Real-time dashboard updates"
echo "   • RESTful monitoring API"
echo
echo "🔗 Available Endpoints:"
echo "   • GET /health - Basic operational status"
echo "   • GET /monitor/health - Full health analysis"
echo "   • POST /monitor/start - Begin proactive monitoring"
echo "   • POST /monitor/stop - End monitoring"
echo "   • GET /truth - Repository truth baseline"
echo "   • GET /validate?app=<name> - Validate specific app build"