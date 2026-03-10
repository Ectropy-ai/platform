#!/bin/bash
set -euo pipefail

# Demo Environment Startup Script
echo "🎯 ECTROPY DEMO ENVIRONMENT STARTUP"
echo "===================================="

# Change to repository root
cd "$(dirname "$0")/.."

# Clean start - stop any existing services
echo "🧹 Cleaning up existing services..."
docker compose -f docker-compose.development.yml down --remove-orphans --volumes 2>/dev/null || true

# Start services with proper dependency order
echo "🚀 Starting demo services..."
docker compose -f docker-compose.development.yml up -d

# Wait for services to initialize
echo "⏱️  Waiting 30 seconds for services to initialize..."
sleep 30

# Function to check service health with retries
check_service_with_retry() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-/health}
    local max_retries=10
    local retry_delay=3
    
    echo -n "🔍 Checking $service_name (port $port)... "
    
    for i in $(seq 1 $max_retries); do
        if curl -f -s --max-time 5 "http://localhost:${port}${endpoint}" > /dev/null 2>&1; then
            echo "✅ Healthy"
            return 0
        fi
        
        if [ $i -lt $max_retries ]; then
            sleep $retry_delay
        fi
    done
    
    echo "❌ Failed after $max_retries attempts"
    return 1
}

# Health check all services
echo ""
echo "🏥 Service Health Validation:"
echo "=============================="

HEALTH_STATUS=0

# Check infrastructure services first
check_service_with_retry "PostgreSQL" 5432 "" || HEALTH_STATUS=1
check_service_with_retry "Redis" 6379 "" || HEALTH_STATUS=1

# Check application services
check_service_with_retry "API Gateway" 3000 /health || HEALTH_STATUS=1
check_service_with_retry "MCP Server" 3001 /health || HEALTH_STATUS=1

echo ""
if [ $HEALTH_STATUS -eq 0 ]; then
    echo "✅ ✅ ✅ ALL SERVICES HEALTHY ✅ ✅ ✅"
    echo ""
    echo "🌟 Demo Environment Ready!"
    echo "=========================="
    echo "  🔗 API Gateway:   http://localhost:3000"
    echo "  🤖 MCP Server:    http://localhost:3001"
    echo "  🗄️  PostgreSQL:    localhost:5432"
    echo "  🔴 Redis:         localhost:6379"
    echo ""
    echo "🎬 Ready for demo scenario validation!"
else
    echo "❌ ❌ ❌ SERVICE STARTUP FAILED ❌ ❌ ❌"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "==================="
    echo "1. Check Docker logs: docker compose -f docker-compose.development.yml logs"
    echo "2. Check container status: docker compose -f docker-compose.development.yml ps"
    echo "3. Restart services: ./scripts/demo-startup.sh"
    exit 1
fi

# Show container status
echo ""
echo "📦 Container Status:"
echo "==================="
docker compose -f docker-compose.development.yml ps

echo ""
echo "✅ Demo startup complete - ready for scenario validation"