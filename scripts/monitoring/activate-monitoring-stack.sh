#!/bin/bash
# Monitoring Stack Activation Script
# Activates and validates enterprise monitoring stack for production readiness
# Part of the observability requirements for enterprise deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}" >&2; }

# Script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Environment and configuration
ENVIRONMENT=${1:-staging}
MONITORING_HOST=${MONITORING_HOST:-localhost}

echo "📊 MONITORING STACK ACTIVATION"
echo "==============================="
echo "Environment: $ENVIRONMENT"
echo "Host: $MONITORING_HOST"
echo ""

cd "$PROJECT_ROOT"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Please install Docker to continue."
if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Please install Docker to continue."
    exit 1
fi

# Check if docker compose is available (either as plugin or standalone)
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose not found. Please install Docker Compose to continue."
    exit 1
fi

log_success "Docker and Docker Compose are available"

# Verify monitoring configuration files exist
log_info "Verifying monitoring configuration..."
if [[ ! -f "docker-compose.monitoring.yml" ]]; then
    log_error "Monitoring configuration file not found: docker-compose.monitoring.yml"
    exit 1
fi

if [[ ! -d "monitoring" ]]; then
    log_error "Monitoring configuration directory not found: monitoring/"
    exit 1
fi

log_success "Monitoring configuration files found"

# Start monitoring stack
log_info "Starting monitoring stack..."
if docker compose -f docker-compose.monitoring.yml up -d; then
    log_success "Monitoring stack started successfully"
else
    log_error "Failed to start monitoring stack"
    exit 1
fi

# Wait for services to be ready
log_info "Waiting for monitoring services to be ready..."
sleep 30

# Check Prometheus
log_info "Validating Prometheus metrics collection..."
PROMETHEUS_URL="http://${MONITORING_HOST}:9090"
if curl -sf "${PROMETHEUS_URL}/api/v1/query?query=up" >/dev/null 2>&1; then
    log_success "Prometheus is collecting metrics"
    
    # Get basic metrics info
    UP_TARGETS=$(curl -s "${PROMETHEUS_URL}/api/v1/query?query=up" | grep -o '"value":\[.*,"1"\]' | wc -l || echo "0")
    log_info "Active monitoring targets: $UP_TARGETS"
else
    log_warning "Prometheus not responding at $PROMETHEUS_URL"
fi

# Check Grafana
log_info "Validating Grafana dashboard access..."
GRAFANA_URL="http://${MONITORING_HOST}:3000"
if curl -sf "$GRAFANA_URL/api/health" >/dev/null 2>&1; then
    log_success "Grafana dashboard is accessible"
else
    log_warning "Grafana not responding at $GRAFANA_URL"
fi

# Check if MCP server metrics endpoint is available
log_info "Validating MCP server metrics..."
MCP_METRICS_URL="http://${MONITORING_HOST}:5000/metrics"
if curl -sf "$MCP_METRICS_URL" >/dev/null 2>&1; then
    log_success "MCP server metrics endpoint is active"
    
    # Get sample metrics
    METRICS_COUNT=$(curl -s "$MCP_METRICS_URL" | grep -c "^[a-zA-Z]" || echo "0")
    log_info "Available metrics: $METRICS_COUNT"
else
    log_warning "MCP server metrics not available at $MCP_METRICS_URL"
    log_info "This is expected if MCP server is not running"
fi

# Validate monitoring stack health
log_info "Performing comprehensive monitoring stack health check..."

# Check if all expected containers are running
EXPECTED_CONTAINERS=("prometheus" "grafana")
RUNNING_CONTAINERS=0

for container in "${EXPECTED_CONTAINERS[@]}"; do
    if docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"; then
        log_success "$container container is running"
        RUNNING_CONTAINERS=$((RUNNING_CONTAINERS + 1))
    else
        log_warning "$container container is not running"
    fi
done

# Create monitoring validation report
REPORT_FILE="/tmp/monitoring-validation-report.json"
cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "environment": "$ENVIRONMENT",
  "monitoring_host": "$MONITORING_HOST",
  "validation_results": {
    "prometheus": {
      "url": "$PROMETHEUS_URL",
      "status": "$(curl -sf "${PROMETHEUS_URL}/api/v1/query?query=up" >/dev/null 2>&1 && echo "healthy" || echo "unhealthy")",
      "active_targets": $UP_TARGETS
    },
    "grafana": {
      "url": "$GRAFANA_URL", 
      "status": "$(curl -sf "$GRAFANA_URL/api/health" >/dev/null 2>&1 && echo "healthy" || echo "unhealthy")"
    },
    "mcp_metrics": {
      "url": "$MCP_METRICS_URL",
      "status": "$(curl -sf "$MCP_METRICS_URL" >/dev/null 2>&1 && echo "healthy" || echo "not_available")",
      "metrics_count": $METRICS_COUNT
    },
    "containers": {
      "expected": ${#EXPECTED_CONTAINERS[@]},
      "running": $RUNNING_CONTAINERS
    }
  }
}
EOF

log_success "Monitoring validation report created: $REPORT_FILE"

# Display monitoring stack summary
echo ""
echo "📊 MONITORING STACK SUMMARY"
echo "==========================="
echo "• Prometheus: $PROMETHEUS_URL"
echo "• Grafana: $GRAFANA_URL (admin/admin)"
echo "• MCP Metrics: $MCP_METRICS_URL"
echo ""
echo "Monitoring Stack Commands:"
echo "• View logs: docker compose -f docker-compose.monitoring.yml logs"
echo "• Stop stack: docker compose -f docker-compose.monitoring.yml down"
echo "• Restart: docker compose -f docker-compose.monitoring.yml restart"
echo ""

# Success criteria
if [[ $RUNNING_CONTAINERS -eq ${#EXPECTED_CONTAINERS[@]} ]]; then
    log_success "Monitoring stack activation completed successfully"
    echo "✅ Enterprise observability is now active"
    exit 0
else
    log_warning "Monitoring stack activation completed with warnings"
    echo "⚠️  Some monitoring components may need attention"
    exit 0
fi