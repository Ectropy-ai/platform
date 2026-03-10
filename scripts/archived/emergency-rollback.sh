#!/bin/bash
# Emergency Rollback Script for Ectropy Platform
# Provides quick recovery from deployment failures

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKUP_DIR="/tmp/ectropy-emergency-backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/tmp/emergency-rollback-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Create backup of current state
create_backup() {
    log_info "Creating emergency backup..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup configuration files
    if [ -f ".devcontainer/.env.dev" ]; then
        cp .devcontainer/.env.dev "$BACKUP_DIR/env.dev.backup"
        log_success "Backed up .env.dev"
    fi
    
    if [ -f ".devcontainer/docker-compose.yml" ]; then
        cp .devcontainer/docker-compose.yml "$BACKUP_DIR/docker-compose.yml.backup"
        log_success "Backed up docker-compose.yml"
    fi
    
    # Backup any running container logs
    if docker compose -f .devcontainer/docker-compose.yml ps --services 2>/dev/null | grep -q .; then
        docker compose -f .devcontainer/docker-compose.yml logs > "$BACKUP_DIR/container-logs.txt" 2>&1 || true
        log_success "Backed up container logs"
    fi
    
    log_success "Backup created at: $BACKUP_DIR"
}

# Stop all services gracefully
stop_services() {
    log_info "Stopping all services gracefully..."
    
    # Stop Docker Compose services
    if docker compose -f .devcontainer/docker-compose.yml ps --services 2>/dev/null | grep -q .; then
        log_info "Stopping Docker Compose services..."
        docker compose -f .devcontainer/docker-compose.yml down --timeout 30 || {
            log_warning "Graceful stop failed, forcing stop..."
            docker compose -f .devcontainer/docker-compose.yml down --timeout 5 -v || true
        }
        log_success "Docker Compose services stopped"
    else
        log_info "No Docker Compose services running"
    fi
    
    # Stop any standalone containers
    local ectropy_containers=$(docker ps --filter "name=ectropy-" --format "{{.Names}}" 2>/dev/null || true)
    if [ -n "$ectropy_containers" ]; then
        log_info "Stopping standalone Ectropy containers..."
        echo "$ectropy_containers" | xargs docker stop --time 10 || true
        log_success "Standalone containers stopped"
    fi
}

# Clean up resources
cleanup_resources() {
    log_info "Cleaning up resources..."
    
    # Remove stopped containers
    docker container prune -f > /dev/null 2>&1 || true
    
    # Remove unused images (but keep base images)
    docker image prune -f > /dev/null 2>&1 || true
    
    # Remove unused networks
    docker network prune -f > /dev/null 2>&1 || true
    
    log_success "Resource cleanup completed"
}

# Reset to known good state
reset_to_known_good_state() {
    log_info "Resetting to known good state..."
    
    # Restore environment file to safe defaults if corrupted
    if [ ! -f ".devcontainer/.env.dev" ] || ! grep -q "dev_secure_postgres_2024" .devcontainer/.env.dev; then
        log_warning ".env.dev missing or corrupted, restoring safe defaults..."
        cat > .devcontainer/.env.dev << 'EOF'
# Emergency restored environment file
NODE_ENV=development
POSTGRES_DEV_PASSWORD=dev_secure_postgres_2024
REDIS_DEV_PASSWORD=dev_secure_redis_2024
POSTGRES_DB=construction_platform
POSTGRES_USER=postgres
DATABASE_URL=postgresql://postgres:dev_secure_postgres_2024@postgres:5432/construction_platform
REDIS_URL=redis://:dev_secure_redis_2024@redis:6379
JWT_SECRET=dev_jwt_secret_PLACEHOLDER
SPECKLE_SERVER_URL=
SPECKLE_API_KEY=
EOF
        log_success "Restored .env.dev with safe defaults"
    fi
    
    # Reset file permissions
    if [ -f "scripts/fix-file-permissions.sh" ]; then
        bash scripts/fix-file-permissions.sh > /dev/null 2>&1 || true
        log_success "Reset file permissions"
    fi
}

# Validate system state
validate_system_state() {
    log_info "Validating system state..."
    
    # Check Docker availability
    if ! docker version > /dev/null 2>&1; then
        log_error "Docker is not available"
        return 1
    fi
    log_success "Docker is available"
    
    # Check Docker Compose configuration
    if ! docker compose -f .devcontainer/docker-compose.yml config > /dev/null 2>&1; then
        log_error "Docker Compose configuration is invalid"
        return 1
    fi
    log_success "Docker Compose configuration is valid"
    
    # Check essential files
    local essential_files=(".devcontainer/.env.dev" ".devcontainer/docker-compose.yml" "package.json")
    for file in "${essential_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Essential file missing: $file"
            return 1
        fi
    done
    log_success "Essential files are present"
    
    return 0
}

# Start services in safe mode
start_safe_mode() {
    log_info "Starting services in safe mode..."
    
    # Start services with extended timeouts
    export COMPOSE_HTTP_TIMEOUT=120
    export DOCKER_CLIENT_TIMEOUT=120
    
    # Start services one by one for better error tracking
    log_info "Starting PostgreSQL..."
    docker compose -f .devcontainer/docker-compose.yml up -d postgres
    sleep 10
    
    log_info "Starting Redis..."
    docker compose -f .devcontainer/docker-compose.yml up -d redis
    sleep 5
    
    log_info "Starting Qdrant..."
    docker compose -f .devcontainer/docker-compose.yml up -d qdrant
    sleep 10
    
    # Wait for services to be healthy
    log_info "Waiting for services to become healthy..."
    local timeout=120
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        local all_healthy=true
        
        # Check PostgreSQL
        if ! docker compose -f .devcontainer/docker-compose.yml exec -T postgres pg_isready -U postgres 2>/dev/null; then
            all_healthy=false
        fi
        
        # Check Redis
        if ! docker compose -f .devcontainer/docker-compose.yml exec -T redis redis-cli -a dev_secure_redis_2024 --no-auth-warning ping 2>/dev/null | grep -q PONG; then
            all_healthy=false
        fi
        
        # Check Qdrant
        if ! curl -f http://localhost:6333/collections 2>/dev/null; then
            all_healthy=false
        fi
        
        if [ "$all_healthy" = true ]; then
            log_success "All services are healthy"
            return 0
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    log_warning "Services did not become fully healthy within timeout"
    return 1
}

# Run health checks
run_health_checks() {
    log_info "Running health checks..."
    
    if [ -f "scripts/enhanced-health-check.sh" ]; then
        if bash scripts/enhanced-health-check.sh; then
            log_success "Health checks passed"
            return 0
        else
            log_warning "Health checks failed"
            return 1
        fi
    else
        log_warning "Enhanced health check script not found, running basic checks..."
        
        # Basic connectivity tests
        if docker compose -f .devcontainer/docker-compose.yml exec -T postgres pg_isready -U postgres 2>/dev/null; then
            log_success "PostgreSQL is responding"
        else
            log_error "PostgreSQL is not responding"
            return 1
        fi
        
        return 0
    fi
}

# Main emergency rollback function
main() {
    local start_time=$(date +%s)
    
    log_info "🚨 Emergency Rollback Started for Ectropy Platform"
    log_info "Log file: $LOG_FILE"
    
    # Create backup before making changes
    create_backup
    
    # Stop services
    stop_services
    
    # Clean up resources
    cleanup_resources
    
    # Reset to known good state
    reset_to_known_good_state
    
    # Validate system state
    if ! validate_system_state; then
        log_error "System validation failed, manual intervention required"
        exit 1
    fi
    
    # Start services in safe mode
    if ! start_safe_mode; then
        log_error "Failed to start services in safe mode"
        log_error "Manual recovery required. Check logs and service configuration."
        exit 1
    fi
    
    # Run health checks
    if run_health_checks; then
        log_success "Health checks passed after rollback"
    else
        log_warning "Health checks failed after rollback, but services are running"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "🎉 Emergency rollback completed successfully"
    log_success "Duration: ${duration}s"
    log_success "Backup location: $BACKUP_DIR"
    log_info ""
    log_info "Next steps:"
    log_info "1. Verify application functionality"
    log_info "2. Review logs for root cause: $LOG_FILE"
    log_info "3. Run comprehensive validation: bash scripts/validate-pipeline-fixes.sh"
    log_info "4. Consider gradual re-deployment of failed changes"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Emergency Rollback Script for Ectropy Platform"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "This script performs emergency rollback procedures:"
        echo "1. Creates backup of current state"
        echo "2. Stops all services gracefully"
        echo "3. Cleans up resources"
        echo "4. Resets to known good configuration"
        echo "5. Starts services in safe mode"
        echo "6. Runs health checks"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        echo "The script is designed to be safe and can be run multiple times."
        echo "All actions are logged for troubleshooting."
        exit 0
        ;;
    *)
        if [ $# -gt 0 ]; then
            log_error "Unknown option: $1"
            log_error "Use --help for usage information"
            exit 1
        fi
        ;;
esac

# Ensure we're in the right directory
if [ ! -f "package.json" ] || [ ! -d ".devcontainer" ]; then
    log_error "This script must be run from the Ectropy repository root"
    log_error "Expected files: package.json, .devcontainer/"
    exit 1
fi

# Run main function
main