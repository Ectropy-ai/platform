#!/bin/bash
set -euo pipefail

# Health check all Docker services
echo "🏥 Docker Services Health Check"
echo "================================"

# Change to repository root
cd "$(dirname "$0")/.."

# Function to check service health
check_service() {
    local service=$1
    local port=$2
    local endpoint=${3:-/health}
    
    echo -n "Checking $service... "
    
    if curl -f -s "http://localhost:${port}${endpoint}" > /dev/null 2>&1; then
        echo "✅ Healthy"
        return 0
    else
        echo "❌ Unhealthy"
        return 1
    fi
}

# Check Docker containers status
echo "📦 Container Status:"
docker compose -f docker-compose.development.yml ps

echo ""
echo "🔍 Service Health Checks:"

# Check each service
check_service "API Gateway" 3000 /health
check_service "MCP Server" 3001 /health
check_service "Web Dashboard" 3002 /

echo ""
echo "📊 Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"