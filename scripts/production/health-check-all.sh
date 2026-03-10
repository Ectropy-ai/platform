#!/bin/bash

# Health Check Script for All Production Services
# Validates that all production services are running and healthy

set -euo pipefail

echo "🏥 Ectropy Production Health Check"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Health check results
HEALTHY_SERVICES=0
TOTAL_SERVICES=0

check_service() {
    local service_name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    TOTAL_SERVICES=$((TOTAL_SERVICES + 1))
    
    echo -n "🔍 Checking $service_name... "
    
    if curl -s -f --max-time 10 "$url" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        HEALTHY_SERVICES=$((HEALTHY_SERVICES + 1))
        return 0
    else
        echo -e "${RED}❌ UNHEALTHY${NC}"
        return 1
    fi
}

check_port() {
    local service_name="$1"
    local host="$2"
    local port="$3"
    
    TOTAL_SERVICES=$((TOTAL_SERVICES + 1))
    
    echo -n "🔍 Checking $service_name ($host:$port)... "
    
    if nc -z "$host" "$port" 2>/dev/null; then
        echo -e "${GREEN}✅ LISTENING${NC}"
        HEALTHY_SERVICES=$((HEALTHY_SERVICES + 1))
        return 0
    else
        echo -e "${RED}❌ NOT LISTENING${NC}"
        return 1
    fi
}

echo "🌐 Web Services"
echo "---------------"
check_service "Web Dashboard" "http://localhost:4200/health"
check_service "API Gateway" "http://localhost:3001/api/health"
check_service "MCP Server" "http://localhost:5000/api/mcp/health"

echo ""
echo "📊 Monitoring Services"
echo "----------------------"
check_service "Prometheus" "http://localhost:9090/metrics"
check_service "Grafana" "http://localhost:3000/api/health"
check_service "Alertmanager" "http://localhost:9093/api/v1/status"

echo ""
echo "🗄️ Data Services"
echo "----------------"
check_port "PostgreSQL" "localhost" "5432"
check_port "Redis" "localhost" "6379"
check_port "Speckle Server" "localhost" "3000"

echo ""
echo "🔄 Load Balancer"
echo "----------------"
check_port "Nginx" "localhost" "80"
check_port "Nginx SSL" "localhost" "443"

echo ""
echo "📋 Health Summary"
echo "=================="
echo ""

HEALTH_PERCENTAGE=$((HEALTHY_SERVICES * 100 / TOTAL_SERVICES))

echo -e "📊 Overall Health: ${HEALTHY_SERVICES}/${TOTAL_SERVICES} services (${HEALTH_PERCENTAGE}%)"

if [ "$HEALTH_PERCENTAGE" -ge 90 ]; then
    echo -e "🎉 ${GREEN}EXCELLENT HEALTH${NC}"
    echo -e "✅ ${GREEN}All critical services operational${NC}"
elif [ "$HEALTH_PERCENTAGE" -ge 70 ]; then
    echo -e "⚠️  ${YELLOW}DEGRADED PERFORMANCE${NC}"
    echo -e "🔧 ${YELLOW}Some services need attention${NC}"
else
    echo -e "🚨 ${RED}CRITICAL ISSUES${NC}"
    echo -e "❌ ${RED}Multiple services down - immediate attention required${NC}"
fi

echo ""
echo "📄 Health report saved: reports/health-check-$(date +%Y%m%d-%H%M%S).json"

# Create detailed health report
mkdir -p reports
cat > "reports/health-check-$(date +%Y%m%d-%H%M%S).json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "overall_health": "${HEALTH_PERCENTAGE}%",
  "healthy_services": $HEALTHY_SERVICES,
  "total_services": $TOTAL_SERVICES,
  "status": "$([ "$HEALTH_PERCENTAGE" -ge 90 ] && echo "healthy" || [ "$HEALTH_PERCENTAGE" -ge 70 ] && echo "degraded" || echo "critical")"
}
EOF

# Exit with appropriate code
exit $([ "$HEALTH_PERCENTAGE" -ge 70 ] && echo 0 || echo 1)