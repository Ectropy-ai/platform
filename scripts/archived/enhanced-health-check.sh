#!/bin/bash
# Enhanced Health Check Script for CI/CD Pipeline
# Provides comprehensive service validation with retry logic and detailed reporting

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES=${MAX_RETRIES:-10}
RETRY_DELAY=${RETRY_DELAY:-5}
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-30}
LOG_FILE="/tmp/health-check-$(date +%Y%m%d-%H%M%S).log"

# Logging functions
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

# Service health check functions
check_postgres_health() {
    local attempt=1
    log_info "Checking PostgreSQL health..."
    
    while [ $attempt -le $MAX_RETRIES ]; do
        if docker compose -f .devcontainer/docker-compose.yml exec -T postgres pg_isready -U postgres -d construction_platform 2>/dev/null; then
            log_success "PostgreSQL is healthy (attempt $attempt)"
            return 0
        fi
        
        log_warning "PostgreSQL not ready (attempt $attempt/$MAX_RETRIES)"
        if [ $attempt -eq $MAX_RETRIES ]; then
            log_error "PostgreSQL health check failed after $MAX_RETRIES attempts"
            docker compose -f .devcontainer/docker-compose.yml logs postgres | tail -20 | tee -a "$LOG_FILE"
            return 1
        fi
        
        sleep $RETRY_DELAY
        ((attempt++))
    done
}

check_redis_health() {
    local attempt=1
    log_info "Checking Redis health..."
    
    while [ $attempt -le $MAX_RETRIES ]; do
        if docker compose -f .devcontainer/docker-compose.yml exec -T redis redis-cli -a dev_secure_redis_2024 --no-auth-warning ping 2>/dev/null | grep -q PONG; then
            log_success "Redis is healthy (attempt $attempt)"
            return 0
        fi
        
        log_warning "Redis not ready (attempt $attempt/$MAX_RETRIES)"
        if [ $attempt -eq $MAX_RETRIES ]; then
            log_error "Redis health check failed after $MAX_RETRIES attempts"
            docker compose -f .devcontainer/docker-compose.yml logs redis | tail -20 | tee -a "$LOG_FILE"
            return 1
        fi
        
        sleep $RETRY_DELAY
        ((attempt++))
    done
}

check_qdrant_health() {
    local attempt=1
    log_info "Checking Qdrant health..."
    
    while [ $attempt -le $MAX_RETRIES ]; do
        if timeout $HEALTH_CHECK_TIMEOUT curl -f http://localhost:6333/collections 2>/dev/null; then
            log_success "Qdrant is healthy (attempt $attempt)"
            return 0
        fi
        
        log_warning "Qdrant not ready (attempt $attempt/$MAX_RETRIES)"
        if [ $attempt -eq $MAX_RETRIES ]; then
            log_error "Qdrant health check failed after $MAX_RETRIES attempts"
            docker compose -f .devcontainer/docker-compose.yml logs qdrant | tail -20 | tee -a "$LOG_FILE"
            return 1
        fi
        
        sleep $RETRY_DELAY
        ((attempt++))
    done
}

# Container status check
check_container_status() {
    log_info "Checking container status..."
    
    local containers=("ectropy-postgres-dev" "ectropy-redis-dev" "ectropy-qdrant-dev")
    local all_healthy=true
    
    for container in "${containers[@]}"; do
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no_health_check")
        
        if [ "$status" = "running" ]; then
            if [ "$health" = "healthy" ] || [ "$health" = "no_health_check" ]; then
                log_success "Container $container: $status ($health)"
            else
                log_warning "Container $container: $status but $health"
                all_healthy=false
            fi
        else
            log_error "Container $container: $status"
            all_healthy=false
        fi
    done
    
    return $([ "$all_healthy" = true ] && echo 0 || echo 1)
}

# Network connectivity check
check_network_connectivity() {
    log_info "Checking network connectivity..."
    
    # Check if containers can communicate
    if docker compose -f .devcontainer/docker-compose.yml exec -T postgres nc -z redis 6379 2>/dev/null; then
        log_success "Inter-container networking is working"
    else
        log_warning "Inter-container networking may have issues"
    fi
    
    # Check external connectivity
    if timeout 10 curl -s http://registry.npmjs.org >/dev/null 2>&1; then
        log_success "External network connectivity is working"
    else
        log_warning "External network connectivity may be limited"
    fi
}

# Resource usage check
check_resource_usage() {
    log_info "Checking resource usage..."
    
    # Check Docker system resources
    local disk_usage=$(docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}" | tail -n +2)
    log_info "Docker resource usage:"
    echo "$disk_usage" | tee -a "$LOG_FILE"
    
    # Check available memory
    local available_memory=$(free -h | awk '/^Mem:/ {print $7}')
    log_info "Available memory: $available_memory"
    
    # Check available disk space
    local available_disk=$(df -h / | awk 'NR==2 {print $4}')
    log_info "Available disk space: $available_disk"
}

# Main health check function
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    log_info "🏥 Starting Enhanced Health Check for Ectropy Platform"
    log_info "Log file: $LOG_FILE"
    log_info "Configuration: MAX_RETRIES=$MAX_RETRIES, RETRY_DELAY=${RETRY_DELAY}s, TIMEOUT=${HEALTH_CHECK_TIMEOUT}s"
    
    # Check if Docker Compose services are running
    if ! docker compose -f .devcontainer/docker-compose.yml ps --services --filter "status=running" | grep -q .; then
        log_error "No running Docker Compose services found. Please start services first:"
        log_error "  docker compose -f .devcontainer/docker-compose.yml up -d"
        exit 1
    fi
    
    # Run all health checks
    log_info "Running comprehensive health checks..."
    
    check_container_status || exit_code=1
    check_postgres_health || exit_code=1
    check_redis_health || exit_code=1  
    check_qdrant_health || exit_code=1
    check_network_connectivity
    check_resource_usage
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ $exit_code -eq 0 ]; then
        log_success "🎉 All health checks passed! Duration: ${duration}s"
        log_success "Services are ready for development and testing"
    else
        log_error "❌ Some health checks failed. Duration: ${duration}s"
        log_error "Check the logs above for specific issues"
        log_error "Log file saved to: $LOG_FILE"
    fi
    
    # Provide quick recovery suggestions
    if [ $exit_code -ne 0 ]; then
        log_info ""
        log_info "💡 Quick Recovery Steps:"
        log_info "1. Restart services: docker compose -f .devcontainer/docker-compose.yml restart"
        log_info "2. Check logs: docker compose -f .devcontainer/docker-compose.yml logs"
        log_info "3. Reset environment: docker compose -f .devcontainer/docker-compose.yml down -v && docker compose -f .devcontainer/docker-compose.yml up -d"
        log_info "4. Run preflight check: bash .devcontainer/preflight-check.sh"
    fi
    
    exit $exit_code
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Enhanced Health Check Script for Ectropy Platform"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h          Show this help message"
        echo "  --max-retries N     Set maximum retry attempts (default: $MAX_RETRIES)"
        echo "  --retry-delay N     Set delay between retries in seconds (default: $RETRY_DELAY)"
        echo "  --timeout N         Set health check timeout in seconds (default: $HEALTH_CHECK_TIMEOUT)"
        echo ""
        echo "Environment Variables:"
        echo "  MAX_RETRIES         Maximum retry attempts"
        echo "  RETRY_DELAY         Delay between retries in seconds"
        echo "  HEALTH_CHECK_TIMEOUT Timeout for individual checks"
        echo ""
        echo "Examples:"
        echo "  $0                  Run with default settings"
        echo "  $0 --max-retries 20 Run with 20 retry attempts"
        echo "  MAX_RETRIES=15 $0   Run with environment variable"
        exit 0
        ;;
    --max-retries)
        MAX_RETRIES="$2"
        shift 2
        ;;
    --retry-delay)
        RETRY_DELAY="$2"
        shift 2
        ;;
    --timeout)
        HEALTH_CHECK_TIMEOUT="$2"
        shift 2
        ;;
    *)
        if [ $# -gt 0 ]; then
            log_error "Unknown option: $1"
            log_error "Use --help for usage information"
            exit 1
        fi
        ;;
esac

# Run main function
main