#!/bin/bash
# Docker Health Check Script for Ectropy Platform
# Enterprise-grade health validation for all Docker services

set -euo pipefail

echo "🏥 Running Docker Health Checks..."

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

# Configuration
MAX_RETRIES=10
RETRY_DELAY=3
HEALTH_CHECK_TIMEOUT=30

# Function to check service health
check_service() {
    local service=$1
    local url=$2
    local retry_count=0
    
    echo -n "  Checking $service..."
    
    while [ $retry_count -lt $MAX_RETRIES ]; do
        if timeout $HEALTH_CHECK_TIMEOUT curl -f -s "$url" > /dev/null 2>&1; then
            log_success "$service is healthy"
            return 0
        fi
        retry_count=$((retry_count + 1))
        sleep $RETRY_DELAY
    done
    
    log_error "$service health check failed after $MAX_RETRIES attempts"
    return 1
}

# Function to check Docker container status
check_container_status() {
    local container=$1
    local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
    local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "no_health_check")
    
    if [ "$status" = "running" ]; then
        if [ "$health" = "healthy" ] || [ "$health" = "no_health_check" ]; then
            log_success "Container $container: $status ($health)"
            return 0
        else
            log_warning "Container $container: $status but $health"
            return 1
        fi
    else
        log_error "Container $container: $status"
        return 1
    fi
}

# Function to check Docker Compose services
check_docker_compose_status() {
    log_info "Checking Docker Compose service status..."
    
    if ! command -v docker-compose >/dev/null 2>&1; then
        if ! command -v docker >/dev/null 2>&1; then
            log_error "Docker is not installed or not running"
            return 1
        fi
        # Use 'docker compose' instead of 'docker-compose'
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
    
    # Check if services are defined and running
    if [ -f "docker-compose.development.yml" ]; then
        log_info "Using docker-compose.development.yml"
        local services=$($COMPOSE_CMD -f docker-compose.development.yml ps --services 2>/dev/null || echo "")
        if [ -z "$services" ]; then
            log_warning "No Docker Compose services found. Start them with:"
            log_warning "  $COMPOSE_CMD -f docker-compose.development.yml up -d"
            return 1
        fi
        
        # Check each service status
        local all_healthy=true
        for service in $services; do
            local container_name="ectropy-${service}-dev"
            if ! check_container_status "$container_name"; then
                all_healthy=false
            fi
        done
        
        return $([ "$all_healthy" = true ] && echo 0 || echo 1)
    else
        log_warning "docker-compose.development.yml not found"
        return 1
    fi
}

# Function to check individual services
check_individual_services() {
    log_info "Checking individual service endpoints..."
    
    local services_healthy=true
    
    # Check PostgreSQL (if port is exposed)
    if netstat -tlnp 2>/dev/null | grep -q ":5432 "; then
        if command -v pg_isready >/dev/null 2>&1; then
            if pg_isready -h localhost -p 5432 -U postgres >/dev/null 2>&1; then
                log_success "PostgreSQL is ready"
            else
                log_error "PostgreSQL is not ready"
                services_healthy=false
            fi
        else
            log_info "pg_isready not available, skipping PostgreSQL check"
        fi
    else
        log_info "PostgreSQL port not exposed, skipping check"
    fi
    
    # Check Redis (if port is exposed)
    if netstat -tlnp 2>/dev/null | grep -q ":6379 "; then
        if command -v redis-cli >/dev/null 2>&1; then
            if redis-cli -h localhost -p 6379 ping >/dev/null 2>&1; then
                log_success "Redis is ready"
            else
                log_error "Redis is not ready"
                services_healthy=false
            fi
        else
            log_info "redis-cli not available, skipping Redis check"
        fi
    else
        log_info "Redis port not exposed, skipping check"
    fi
    
    # Check API Gateway
    if check_service "API Gateway" "http://localhost:3000/health"; then
        true # Success logged by check_service
    else
        services_healthy=false
    fi
    
    # Check MCP Server
    if check_service "MCP Server" "http://localhost:3001/health"; then
        true # Success logged by check_service
    else
        services_healthy=false
    fi
    
    # Check Web Dashboard
    if check_service "Web Dashboard" "http://localhost:4200"; then
        true # Success logged by check_service
    else
        log_warning "Web Dashboard not accessible (may not be running)"
    fi
    
    # Check Qdrant (if available)
    if check_service "Qdrant" "http://localhost:6333/readiness"; then
        true # Success logged by check_service
    else
        log_info "Qdrant not accessible (may not be configured)"
    fi
    
    return $([ "$services_healthy" = true ] && echo 0 || echo 1)
}

# Function to check system resources
check_system_resources() {
    log_info "Checking system resources..."
    
    # Check available memory
    if command -v free >/dev/null 2>&1; then
        local available_memory=$(free -h | awk '/^Mem:/ {print $7}')
        log_info "Available memory: $available_memory"
    fi
    
    # Check available disk space
    local available_disk=$(df -h / | awk 'NR==2 {print $4}')
    log_info "Available disk space: $available_disk"
    
    # Check Docker disk usage
    if command -v docker >/dev/null 2>&1; then
        local docker_system_df=$(docker system df --format "table {{.Type}}\t{{.TotalCount}}\t{{.Size}}" 2>/dev/null | tail -n +2)
        if [ -n "$docker_system_df" ]; then
            log_info "Docker disk usage:"
            echo "$docker_system_df" | while read line; do
                log_info "  $line"
            done
        fi
    fi
}

# Main execution
main() {
    local start_time=$(date +%s)
    local exit_code=0
    
    log_info "🏥 Starting Enhanced Health Check for Ectropy Platform"
    log_info "Configuration: MAX_RETRIES=$MAX_RETRIES, RETRY_DELAY=${RETRY_DELAY}s, TIMEOUT=${HEALTH_CHECK_TIMEOUT}s"
    
    # Run all health checks
    log_info "Running comprehensive health checks..."
    
    if ! check_docker_compose_status; then
        log_warning "Docker Compose services check failed, checking individual services..."
        if ! check_individual_services; then
            exit_code=1
        fi
    else
        log_success "Docker Compose services are healthy"
        # Still check individual services for completeness
        check_individual_services || true
    fi
    
    check_system_resources
    
    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ $exit_code -eq 0 ]; then
        log_success "🎉 All health checks passed! Duration: ${duration}s"
        log_success "Services are ready for development and testing"
    else
        log_error "❌ Some health checks failed. Duration: ${duration}s"
        log_error "Check the logs above for specific issues"
        
        # Provide quick recovery suggestions
        log_info "💡 Quick recovery suggestions:"
        log_info "  - Start services: docker compose -f docker-compose.development.yml up -d"
        log_info "  - Check logs: docker compose -f docker-compose.development.yml logs"
        log_info "  - Restart services: docker compose -f docker-compose.development.yml restart"
    fi
    
    return $exit_code
}

# Run main function with all arguments
main "$@"