#!/bin/bash
# .devcontainer/startup-orchestrator.sh - Enterprise Staged Container Startup
# Implements Step 4 from enterprise best practices

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}📦 [ORCHESTRATOR]${NC} $1"; }
log_success() { echo -e "${GREEN}✅ [ORCHESTRATOR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠️ [ORCHESTRATOR]${NC} $1"; }
log_error() { echo -e "${RED}❌ [ORCHESTRATOR]${NC} $1"; }

# Configuration
COMPOSE_FILE=".devcontainer/docker-compose.yml"
STAGE_TIMEOUT=120
SERVICE_CHECK_INTERVAL=5

# Function to wait for service health
wait_for_service_health() {
    local service_name="$1"
    local timeout="$2"
    local elapsed=0
    
    log_info "Waiting for $service_name to become healthy..."
    
    while [ $elapsed -lt $timeout ]; do
        # Safe jq parsing that handles both array and object formats  
        if docker compose -f "$COMPOSE_FILE" ps "$service_name" --format json | jq -r 'if type == "array" then .[0].Health // "unknown" else .Health // "unknown" end' | grep -q "healthy"; then
            log_success "$service_name is healthy"
            return 0
        fi
        
        sleep $SERVICE_CHECK_INTERVAL
        elapsed=$((elapsed + SERVICE_CHECK_INTERVAL))
        
        if [ $((elapsed % 30)) -eq 0 ]; then
            log_info "$service_name still starting... (${elapsed}s elapsed)"
        fi
    done
    
    log_error "$service_name failed to become healthy within ${timeout}s"
    return 1
}

# Function to check if container exists
container_exists() {
    local container_name="$1"
    docker ps -a --format "{{.Names}}" | grep -q "^${container_name}$"
}

# Function to stop and remove existing containers
cleanup_existing_containers() {
    log_info "Cleaning up existing containers..."
    
    local containers=("ectropy-postgres-dev" "ectropy-redis-dev" "ectropy-qdrant-dev" "ectropy-codespaces-dev")
    
    for container in "${containers[@]}"; do
        if container_exists "$container"; then
            log_info "Stopping and removing existing container: $container"
            docker stop "$container" 2>/dev/null || true
            docker rm "$container" 2>/dev/null || true
        fi
    done
}

# Main orchestration function
main() {
    echo "🚀 Enterprise DevContainer Startup Orchestrator"
    echo "================================================="
    
    # Pre-startup validation
    log_info "Running pre-startup validation..."
    
    # Check if compose file exists
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    # Validate compose configuration
    if ! docker compose -f "$COMPOSE_FILE" config >/dev/null 2>&1; then
        log_error "Invalid Docker Compose configuration"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "Pre-startup validation completed"
    
    # Optional cleanup of existing containers
    if [ "${CLEAN_START:-false}" = "true" ]; then
        cleanup_existing_containers
    fi
    
    # Stage 1: Core infrastructure services
    echo ""
    log_info "📦 Stage 1: Starting core infrastructure services..."
    
    log_info "Starting PostgreSQL database..."
    if ! docker compose -f "$COMPOSE_FILE" up -d postgres; then
        log_error "Failed to start PostgreSQL"
        exit 1
    fi
    
    log_info "Starting Redis cache..."
    if ! docker compose -f "$COMPOSE_FILE" up -d redis; then
        log_error "Failed to start Redis"
        exit 1
    fi
    
    # Stage 2: Wait for core services health
    echo ""
    log_info "⏳ Stage 2: Waiting for core services to become healthy..."
    
    # Wait for PostgreSQL
    if ! wait_for_service_health "postgres" $STAGE_TIMEOUT; then
        log_error "PostgreSQL failed to start properly"
        log_info "Checking PostgreSQL logs..."
        docker compose -f "$COMPOSE_FILE" logs postgres
        exit 1
    fi
    
    # Wait for Redis
    if ! wait_for_service_health "redis" $STAGE_TIMEOUT; then
        log_error "Redis failed to start properly"
        log_info "Checking Redis logs..."
        docker compose -f "$COMPOSE_FILE" logs redis
        exit 1
    fi
    
    # Stage 3: Secondary services
    echo ""
    log_info "📦 Stage 3: Starting secondary services..."
    
    log_info "Starting Qdrant vector database..."
    if ! docker compose -f "$COMPOSE_FILE" up -d qdrant; then
        log_error "Failed to start Qdrant"
        exit 1
    fi
    
    # Wait for Qdrant
    if ! wait_for_service_health "qdrant" $STAGE_TIMEOUT; then
        log_error "Qdrant failed to start properly"
        log_info "Checking Qdrant logs..."
        docker compose -f "$COMPOSE_FILE" logs qdrant
        exit 1
    fi
    
    # Stage 4: Application workspace
    echo ""
    log_info "📦 Stage 4: Starting application workspace..."
    
    if ! docker compose -f "$COMPOSE_FILE" up -d workspace; then
        log_error "Failed to start workspace"
        exit 1
    fi
    
    # Wait for workspace to be ready
    log_info "Waiting for workspace container to be ready..."
    local workspace_ready=false
    local elapsed=0
    
    while [ $elapsed -lt $STAGE_TIMEOUT ] && [ "$workspace_ready" = false ]; do
        if docker exec ectropy-codespaces-dev whoami >/dev/null 2>&1; then
            workspace_ready=true
            log_success "Workspace container is ready"
        else
            sleep $SERVICE_CHECK_INTERVAL
            elapsed=$((elapsed + SERVICE_CHECK_INTERVAL))
        fi
    done
    
    if [ "$workspace_ready" = false ]; then
        log_error "Workspace container failed to start properly"
        exit 1
    fi
    
    # Stage 5: Post-startup validation
    echo ""
    log_info "✅ Stage 5: Running post-startup validation..."
    
    # Validate all services are running
    local all_services=("postgres" "redis" "qdrant" "workspace")
    for service in "${all_services[@]}"; do
        # Safe jq parsing for service state
        if docker compose -f "$COMPOSE_FILE" ps "$service" --format json | jq -r 'if type == "array" then .[0].State else .State end' | grep -q "running"; then
            log_success "$service is running"
        else
            log_error "$service is not running properly"
            exit 1
        fi
    done
    
    # Run environment validation inside workspace
    log_info "Running environment validation in workspace..."
    if docker exec ectropy-codespaces-dev bash -c "cd /workspace && bash .devcontainer/validate-environment.sh" >/dev/null 2>&1; then
        log_success "Environment validation passed"
    else
        log_warning "Environment validation had issues - check logs"
    fi
    
    # Display final status
    echo ""
    echo "================================================="
    log_success "🎉 Enterprise DevContainer startup completed successfully!"
    echo ""
    log_info "📊 Service Status:"
    docker compose -f "$COMPOSE_FILE" ps --format "table {{.Service}}\t{{.State}}\t{{.Status}}"
    echo ""
    log_info "🔧 Next Steps:"
    echo "1. Attach to the workspace container"
    echo "2. Run: cd /workspace && pnpm install"
    echo "3. Start development: pnpm run dev"
    echo ""
    log_info "🛠️ Troubleshooting:"
    echo "• Logs: docker compose -f $COMPOSE_FILE logs"
    echo "• Health: bash .devcontainer/health-check.sh"
    echo "• Recovery: bash .devcontainer/recovery.sh"
    echo ""
}

# Handle script arguments
case "${1:-start}" in
    "start")
        main
        ;;
    "stop")
        log_info "Stopping all services..."
        docker compose -f "$COMPOSE_FILE" down
        log_success "All services stopped"
        ;;
    "restart")
        log_info "Restarting all services..."
        CLEAN_START=true main
        ;;
    "status")
        log_info "Service status:"
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        echo ""
        echo "Commands:"
        echo "  start   - Start services in staged order (default)"
        echo "  stop    - Stop all services"
        echo "  restart - Clean restart all services"
        echo "  status  - Show service status"
        echo ""
        echo "Environment variables:"
        echo "  CLEAN_START=true - Remove existing containers before starting"
        exit 1
        ;;
esac