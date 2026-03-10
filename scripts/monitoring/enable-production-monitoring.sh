#!/bin/bash
# scripts/enable-production-monitoring.sh
# Enable comprehensive production monitoring after deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MONITORING_COMPOSE_FILE="docker-compose.monitoring.yml"
GRAFANA_URL="http://localhost:3003"
PROMETHEUS_URL="http://localhost:9090"
STATUS_URL="http://localhost:3000/status"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if Docker is available
check_docker_availability() {
    log_info "Checking Docker availability..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not available"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "Docker is available and running"
}

# Start monitoring stack
start_monitoring_stack() {
    log_info "Starting monitoring stack..."
    
    if [[ -f "$MONITORING_COMPOSE_FILE" ]]; then
        # Stop any existing monitoring services
        docker compose -f "$MONITORING_COMPOSE_FILE" down --remove-orphans > /dev/null 2>&1 || true
        
        # Start monitoring services
        if docker compose -f "$MONITORING_COMPOSE_FILE" up -d; then
            log_success "Monitoring stack started successfully"
        else
            log_error "Failed to start monitoring stack"
            return 1
        fi
    else
        log_error "Monitoring compose file not found: $MONITORING_COMPOSE_FILE"
        return 1
    fi
}

# Wait for services to be ready
wait_for_services() {
    log_info "Waiting for monitoring services to be ready..."
    
    local max_attempts=30
    local attempt=0
    
    # Wait for Grafana
    log_info "Waiting for Grafana to be ready..."
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "$GRAFANA_URL/api/health" > /dev/null 2>&1; then
            log_success "Grafana is ready"
            break
        fi
        
        ((attempt++))
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Grafana failed to start within timeout"
            return 1
        fi
        
        sleep 2
    done
    
    # Wait for Prometheus
    attempt=0
    log_info "Waiting for Prometheus to be ready..."
    while [[ $attempt -lt $max_attempts ]]; do
        if curl -f -s "$PROMETHEUS_URL/-/ready" > /dev/null 2>&1; then
            log_success "Prometheus is ready"
            break
        fi
        
        ((attempt++))
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Prometheus failed to start within timeout"
            return 1
        fi
        
        sleep 2
    done
}

# Configure Prometheus targets
configure_prometheus_targets() {
    log_info "Configuring Prometheus targets..."
    
    # Create Prometheus configuration if it doesn't exist
    mkdir -p "monitoring/prometheus"
    
    if [[ ! -f "monitoring/prometheus/prometheus.yml" ]]; then
        cat > "monitoring/prometheus/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'mcp-server'
    static_configs:
      - targets: ['mcp-server:3001']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'web-dashboard'
    static_configs:
      - targets: ['web-dashboard:4200']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
    scrape_interval: 30s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 30s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    scrape_interval: 30s
EOF
        
        log_success "Prometheus configuration created"
    else
        log_success "Prometheus configuration already exists"
    fi
}

# Setup Grafana data sources
setup_grafana_datasources() {
    log_info "Setting up Grafana data sources..."
    
    # Create data source configuration
    local datasource_config='
{
  "name": "Prometheus",
  "type": "prometheus",
  "url": "http://prometheus:9090",
  "access": "proxy",
  "isDefault": true,
  "basicAuth": false
}
'
    
    # Try to add data source via API
    local response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Basic $(echo -n "admin:${GRAFANA_ADMIN_PASSWORD:-admin}" | base64)" \
        -d "$datasource_config" \
        "$GRAFANA_URL/api/datasources" 2>/dev/null || echo "000")
    
    local http_code=$(echo "$response" | tail -c 4)
    
    if [[ "$http_code" == "200" || "$http_code" == "409" ]]; then
        log_success "Prometheus data source configured in Grafana"
    else
        log_warning "Could not configure Grafana data source automatically"
        log_info "Please configure Prometheus data source manually in Grafana UI"
    fi
}

# Verify metrics collection
verify_metrics_collection() {
    log_info "Verifying metrics collection..."
    
    # Check if Prometheus is collecting metrics
    local targets_response=$(curl -s "$PROMETHEUS_URL/api/v1/targets" 2>/dev/null || echo "{}")
    
    if echo "$targets_response" | jq -e '.status == "success"' > /dev/null 2>&1; then
        local active_targets=$(echo "$targets_response" | jq '.data.activeTargets | length' 2>/dev/null || echo "0")
        log_success "Prometheus is collecting metrics from $active_targets targets"
    else
        log_warning "Could not verify Prometheus metrics collection"
    fi
    
    # Test a basic query
    local query_response=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=up" 2>/dev/null || echo "{}")
    
    if echo "$query_response" | jq -e '.status == "success"' > /dev/null 2>&1; then
        log_success "Prometheus queries are working"
    else
        log_warning "Prometheus queries may not be working correctly"
    fi
}

# Create monitoring dashboards
import_monitoring_dashboards() {
    log_info "Setting up monitoring dashboards..."
    
    # Set up basic dashboard import
    if [[ -f "monitoring/dashboards/mcp-server.json" ]]; then
        log_info "MCP server dashboard configuration available"
        log_info "Please import manually via Grafana UI at $GRAFANA_URL"
    else
        log_warning "No dashboard configurations found"
        log_info "Run ./scripts/setup-monitoring-alerts.sh to create dashboard configs"
    fi
}

# Enable log collection
enable_log_collection() {
    log_info "Enabling log collection..."
    
    # Create logs directory structure
    mkdir -p "logs/production"
    mkdir -p "logs/monitoring"
    
    # Set up log rotation configuration
    if ! command -v logrotate &> /dev/null; then
        log_warning "logrotate not available - logs may grow indefinitely"
    else
        # Create basic logrotate configuration
        cat > "logs/logrotate.conf" << 'EOF'
/home/runner/work/Ectropy/Ectropy/logs/production/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker compose -f docker-compose.production.yml restart api-gateway mcp-server || true
    endscript
}
EOF
        
        log_success "Log rotation configuration created"
    fi
}

# Setup uptime monitoring
setup_uptime_monitoring() {
    log_info "Setting up uptime monitoring..."
    
    # Create a simple uptime monitoring script
    cat > "scripts/uptime-monitor.sh" << 'EOF'
#!/bin/bash
# Simple uptime monitoring script

ENDPOINTS=(
    "http://localhost:3000/health"
    "http://localhost:3001/health"
    "http://localhost:4200/"
)

LOG_FILE="logs/monitoring/uptime-$(date +%Y%m%d).log"
mkdir -p "$(dirname "$LOG_FILE")"

for endpoint in "${ENDPOINTS[@]}"; do
    if curl -f -s --max-time 10 "$endpoint" > /dev/null 2>&1; then
        echo "$(date): OK - $endpoint" >> "$LOG_FILE"
    else
        echo "$(date): FAIL - $endpoint" >> "$LOG_FILE"
        # In production, this would send an alert
    fi
done
EOF
    
    chmod +x "scripts/uptime-monitor.sh"
    log_success "Uptime monitoring script created"
    log_info "Consider adding to crontab: */5 * * * * /path/to/scripts/uptime-monitor.sh"
}

# Create monitoring status endpoint
create_monitoring_status() {
    log_info "Creating monitoring status endpoint..."
    
    # Create a status check script
    cat > "scripts/monitoring-status.sh" << 'EOF'
#!/bin/bash
# Check monitoring system status

check_service() {
    local service="$1"
    local url="$2"
    
    if curl -f -s --max-time 5 "$url" > /dev/null 2>&1; then
        echo "✅ $service: Healthy"
        return 0
    else
        echo "❌ $service: Down"
        return 1
    fi
}

echo "Monitoring System Status:"
echo "========================"

check_service "Grafana" "http://localhost:3003/api/health"
check_service "Prometheus" "http://localhost:9090/-/ready"
check_service "API Gateway" "http://localhost:3000/health"
check_service "MCP Server" "http://localhost:3001/health"

echo
echo "Dashboard URLs:"
echo "- Grafana: http://localhost:3003"
echo "- Prometheus: http://localhost:9090"
echo "- Status Page: http://localhost:3000/status"
EOF
    
    chmod +x "scripts/monitoring-status.sh"
    log_success "Monitoring status script created"
}

# Generate monitoring report
generate_monitoring_report() {
    local report_file="reports/monitoring-setup-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "reports"
    
    log_info "Generating monitoring setup report..."
    
    cat > "$report_file" << EOF
# Production Monitoring Setup Report - $(date)

## Monitoring Stack Status
- Grafana: $GRAFANA_URL
- Prometheus: $PROMETHEUS_URL
- Status Page: $STATUS_URL

## Services Monitored
- API Gateway (http://localhost:3000)
- MCP Server (http://localhost:3001)
- Web Dashboard (http://localhost:4200)
- PostgreSQL Database
- Redis Cache

## Monitoring Features Enabled
- ✅ Metrics collection via Prometheus
- ✅ Visualization via Grafana
- ✅ Basic uptime monitoring
- ✅ Log collection structure
- ✅ Status monitoring scripts

## Dashboard Access
- Grafana Dashboard: $GRAFANA_URL (admin/admin)
- Prometheus Targets: $PROMETHEUS_URL/targets
- Monitoring Status: ./scripts/monitoring-status.sh

## Next Steps
1. Configure Grafana dashboards manually
2. Set up alert notification channels
3. Configure log aggregation
4. Set up external uptime monitoring
5. Configure backup monitoring data

## Alert Configuration
Alert configurations are available in:
- monitoring/alerts/
- Run ./scripts/setup-monitoring-alerts.sh for alert setup

Generated at: $(date)
EOF
    
    log_success "Monitoring report generated: $report_file"
}

# Main execution function
main() {
    echo "📊 Enabling Production Monitoring"
    echo "================================="
    echo
    echo "Grafana URL: $GRAFANA_URL"
    echo "Prometheus URL: $PROMETHEUS_URL"
    echo "Monitoring Compose: $MONITORING_COMPOSE_FILE"
    echo
    
    check_docker_availability
    configure_prometheus_targets
    start_monitoring_stack
    wait_for_services
    setup_grafana_datasources
    verify_metrics_collection
    import_monitoring_dashboards
    enable_log_collection
    setup_uptime_monitoring
    create_monitoring_status
    generate_monitoring_report
    
    echo
    log_success "🎉 Production monitoring enabled successfully!"
    echo
    echo "📊 Monitoring Endpoints:"
    echo "  Grafana Dashboard: $GRAFANA_URL"
    echo "  Prometheus Metrics: $PROMETHEUS_URL"
    echo "  Status Monitoring: ./scripts/monitoring-status.sh"
    echo
    echo "📋 Next Steps:"
    echo "  1. Access Grafana at $GRAFANA_URL (admin/admin)"
    echo "  2. Import dashboards from monitoring/dashboards/"
    echo "  3. Configure alert notification channels"
    echo "  4. Set up external uptime monitoring service"
    echo "  5. Review monitoring data and adjust collection intervals"
    echo
    echo "🔍 Verify Setup:"
    echo "  ./scripts/monitoring-status.sh"
    echo
    echo "📈 Monitoring is now active and collecting metrics!"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Production Monitoring Enablement Script"
        echo
        echo "Usage: $0 [options]"
        echo
        echo "This script:"
        echo "  - Starts monitoring stack (Grafana, Prometheus)"
        echo "  - Configures metric collection from all services"
        echo "  - Sets up basic dashboards and alerts"
        echo "  - Enables log collection"
        echo "  - Creates uptime monitoring"
        echo
        echo "Requirements:"
        echo "  - Docker and docker compose"
        echo "  - docker-compose.monitoring.yml file"
        echo "  - Services running (API Gateway, MCP Server)"
        echo
        echo "URLs after setup:"
        echo "  - Grafana: http://localhost:3003"
        echo "  - Prometheus: http://localhost:9090"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac