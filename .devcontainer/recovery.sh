#!/bin/bash
# .devcontainer/recovery.sh - Enterprise DevContainer Recovery System
# Implements Step 5 from enterprise best practices

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}🔧 [RECOVERY]${NC} $1"; }
log_success() { echo -e "${GREEN}✅ [RECOVERY]${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠️ [RECOVERY]${NC} $1"; }
log_error() { echo -e "${RED}❌ [RECOVERY]${NC} $1"; }

# Configuration
COMPOSE_FILE=".devcontainer/docker-compose.yml"
BACKUP_DIR=".devcontainer/recovery-backups"
RECOVERY_LOG="$BACKUP_DIR/recovery-$(date +%Y%m%d-%H%M%S).log"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to log to both console and file
dual_log() {
    local level="$1"
    local message="$2"
    
    case "$level" in
        "INFO") log_info "$message" ;;
        "SUCCESS") log_success "$message" ;;
        "WARNING") log_warning "$message" ;;
        "ERROR") log_error "$message" ;;
    esac
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" >> "$RECOVERY_LOG"
}

# Function to backup environment files
backup_environment() {
    dual_log "INFO" "Creating backup of environment configuration..."
    
    local backup_env_dir="$BACKUP_DIR/env-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_env_dir"
    
    # Backup environment files
    for env_file in .env .devcontainer/.env.dev .devcontainer/.env.example; do
        if [ -f "$env_file" ]; then
            cp "$env_file" "$backup_env_dir/"
            dual_log "SUCCESS" "Backed up: $env_file"
        fi
    done
    
    # Backup compose files
    if [ -f "$COMPOSE_FILE" ]; then
        cp "$COMPOSE_FILE" "$backup_env_dir/"
        dual_log "SUCCESS" "Backed up: $COMPOSE_FILE"
    fi
    
    dual_log "SUCCESS" "Environment backup completed: $backup_env_dir"
}

# Function to stop and remove problematic containers
cleanup_containers() {
    dual_log "INFO" "Stopping and removing all containers..."
    
    # Stop compose services
    if docker compose -f "$COMPOSE_FILE" down 2>/dev/null; then
        dual_log "SUCCESS" "Docker Compose services stopped"
    else
        dual_log "WARNING" "Failed to stop compose services gracefully"
    fi
    
    # Remove specific containers that might be stuck
    local problematic_containers=(
        "ectropy-postgres-dev"
        "ectropy-redis-dev" 
        "ectropy-qdrant-dev"
        "ectropy-codespaces-dev"
    )
    
    for container in "${problematic_containers[@]}"; do
        if docker ps -a --format "{{.Names}}" | grep -q "^${container}$"; then
            dual_log "INFO" "Removing container: $container"
            docker rm -f "$container" 2>/dev/null || dual_log "WARNING" "Failed to remove $container"
        fi
    done
    
    dual_log "SUCCESS" "Container cleanup completed"
}

# Function to clean Docker resources
cleanup_docker_resources() {
    dual_log "INFO" "Cleaning up Docker resources..."
    
    # Clean up stopped containers
    if docker container prune -f >/dev/null 2>&1; then
        dual_log "SUCCESS" "Removed stopped containers"
    else
        dual_log "WARNING" "Failed to clean stopped containers"
    fi
    
    # Clean up unused images (excluding cache)
    if docker image prune -f >/dev/null 2>&1; then
        dual_log "SUCCESS" "Removed unused images"
    else
        dual_log "WARNING" "Failed to clean unused images"
    fi
    
    # Clean up unused networks
    if docker network prune -f >/dev/null 2>&1; then
        dual_log "SUCCESS" "Removed unused networks"
    else
        dual_log "WARNING" "Failed to clean unused networks"
    fi
    
    # Only clean volumes if specifically requested
    if [ "${CLEAN_VOLUMES:-false}" = "true" ]; then
        dual_log "WARNING" "Cleaning up volumes (data will be lost!)..."
        docker volume prune -f >/dev/null 2>&1 || dual_log "WARNING" "Failed to clean volumes"
    fi
    
    dual_log "SUCCESS" "Docker resource cleanup completed"
}

# Function to validate and fix Docker daemon
check_docker_daemon() {
    dual_log "INFO" "Checking Docker daemon status..."
    
    if ! docker info >/dev/null 2>&1; then
        dual_log "ERROR" "Docker daemon is not running or not accessible"
        dual_log "INFO" "Please ensure Docker is running and restart this script"
        return 1
    fi
    
    # Check Docker disk usage
    local docker_space
    docker_space=$(docker system df --format "{{.Active}}" | head -n1 || echo "unknown")
    dual_log "INFO" "Docker space usage: $docker_space"
    
    dual_log "SUCCESS" "Docker daemon is healthy"
    return 0
}

# Function to rebuild containers from scratch
rebuild_containers() {
    dual_log "INFO" "Rebuilding containers with no cache..."
    
    # Build with no cache
    if docker compose -f "$COMPOSE_FILE" build --no-cache workspace; then
        dual_log "SUCCESS" "Workspace container rebuilt successfully"
    else
        dual_log "ERROR" "Failed to rebuild workspace container"
        return 1
    fi
    
    dual_log "SUCCESS" "Container rebuild completed"
}

# Function to restore environment from backup
restore_environment() {
    local backup_path="$1"
    
    if [ ! -d "$backup_path" ]; then
        dual_log "ERROR" "Backup directory not found: $backup_path"
        return 1
    fi
    
    dual_log "INFO" "Restoring environment from: $backup_path"
    
    # Restore environment files
    for file in "$backup_path"/*; do
        if [ -f "$file" ]; then
            local filename=$(basename "$file")
            local target_path
            
            case "$filename" in
                ".env") target_path=".env" ;;
                ".env.dev") target_path=".devcontainer/.env.dev" ;;
                ".env.example") target_path=".devcontainer/.env.example" ;;
                "docker-compose.yml") target_path=".devcontainer/docker-compose.yml" ;;
                *) continue ;;
            esac
            
            cp "$file" "$target_path"
            dual_log "SUCCESS" "Restored: $target_path"
        fi
    done
    
    dual_log "SUCCESS" "Environment restoration completed"
}

# Function to run comprehensive diagnostics
run_diagnostics() {
    dual_log "INFO" "Running comprehensive diagnostics..."
    
    local diag_file="$BACKUP_DIR/diagnostics-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "=== Ectropy DevContainer Diagnostics ==="
        echo "Timestamp: $(date)"
        echo "Recovery Log: $RECOVERY_LOG"
        echo ""
        
        echo "=== System Information ==="
        echo "Host OS: $(uname -a)"
        echo "Docker Version: $(docker --version 2>/dev/null || echo 'Docker not available')"
        echo "Docker Compose: $(docker compose version 2>/dev/null || echo 'Docker Compose not available')"
        echo ""
        
        echo "=== Docker System Info ==="
        docker system df 2>/dev/null || echo "Docker system info not available"
        echo ""
        
        echo "=== Running Containers ==="
        docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "No containers running"
        echo ""
        
        echo "=== Docker Compose Status ==="
        if [ -f "$COMPOSE_FILE" ]; then
            docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "Compose services not available"
        else
            echo "Compose file not found: $COMPOSE_FILE"
        fi
        echo ""
        
        echo "=== Disk Usage ==="
        df -h . 2>/dev/null || echo "Disk usage info not available"
        echo ""
        
        echo "=== Memory Usage ==="
        free -h 2>/dev/null || echo "Memory usage info not available"
        echo ""
        
        echo "=== Network Connectivity ==="
        curl -s --connect-timeout 5 https://registry.npmjs.org >/dev/null && echo "NPM registry: OK" || echo "NPM registry: FAILED"
        curl -s --connect-timeout 5 https://github.com >/dev/null && echo "GitHub: OK" || echo "GitHub: FAILED"
        echo ""
        
    } > "$diag_file"
    
    dual_log "SUCCESS" "Diagnostics saved to: $diag_file"
}

# Main recovery function
main_recovery() {
    echo "🔧 Ectropy DevContainer Recovery System"
    echo "======================================="
    
    dual_log "INFO" "Starting recovery process..."
    dual_log "INFO" "Recovery log: $RECOVERY_LOG"
    
    # Step 1: Backup current state
    backup_environment
    
    # Step 2: Run diagnostics
    run_diagnostics
    
    # Step 3: Check Docker daemon
    if ! check_docker_daemon; then
        dual_log "ERROR" "Cannot proceed without functional Docker daemon"
        exit 1
    fi
    
    # Step 4: Clean up containers and resources
    cleanup_containers
    cleanup_docker_resources
    
    # Step 5: Rebuild containers if needed
    if [ "${REBUILD:-true}" = "true" ]; then
        rebuild_containers
    fi
    
    # Step 6: Start services
    dual_log "INFO" "Starting services with orchestrator..."
    if bash .devcontainer/startup-orchestrator.sh start; then
        dual_log "SUCCESS" "Services started successfully"
    else
        dual_log "ERROR" "Failed to start services"
        dual_log "INFO" "Check logs: docker compose -f $COMPOSE_FILE logs"
        exit 1
    fi
    
    # Step 7: Final validation
    dual_log "INFO" "Running final validation..."
    if bash .devcontainer/validate-environment.sh >/dev/null 2>&1; then
        dual_log "SUCCESS" "Environment validation passed"
    else
        dual_log "WARNING" "Environment validation had issues"
    fi
    
    echo ""
    echo "======================================="
    dual_log "SUCCESS" "✅ Recovery completed successfully!"
    echo ""
    dual_log "INFO" "📋 Recovery Summary:"
    echo "  • Environment backed up to: $BACKUP_DIR"
    echo "  • Recovery log: $RECOVERY_LOG"
    echo "  • Diagnostics available in: $BACKUP_DIR"
    echo ""
    dual_log "INFO" "🔧 Next Steps:"
    echo "  1. Reload VS Code window if using devcontainers"
    echo "  2. Run: pnpm install (inside container)"
    echo "  3. Test: pnpm run dev"
    echo ""
    dual_log "INFO" "🛠️ If issues persist:"
    echo "  • Check recovery log: $RECOVERY_LOG"
    echo "  • Run diagnostics: bash .devcontainer/recovery.sh diagnose"
    echo "  • Contact DevOps team with recovery log"
    echo ""
}

# Handle command line arguments
case "${1:-recover}" in
    "recover")
        main_recovery
        ;;
    "diagnose")
        run_diagnostics
        dual_log "INFO" "Diagnostics completed - check $BACKUP_DIR"
        ;;
    "backup")
        backup_environment
        ;;
    "restore")
        if [ -z "${2:-}" ]; then
            dual_log "ERROR" "Usage: $0 restore <backup_directory>"
            exit 1
        fi
        restore_environment "$2"
        ;;
    "clean")
        dual_log "WARNING" "This will remove ALL Docker volumes and data!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            CLEAN_VOLUMES=true cleanup_docker_resources
        else
            dual_log "INFO" "Clean operation cancelled"
        fi
        ;;
    *)
        echo "Ectropy DevContainer Recovery System"
        echo ""
        echo "Usage: $0 {recover|diagnose|backup|restore|clean}"
        echo ""
        echo "Commands:"
        echo "  recover  - Full recovery process (default)"
        echo "  diagnose - Run diagnostics only"
        echo "  backup   - Backup environment only"
        echo "  restore  - Restore from backup directory"
        echo "  clean    - Clean all Docker resources (DESTRUCTIVE)"
        echo ""
        echo "Environment variables:"
        echo "  REBUILD=false     - Skip container rebuild"
        echo "  CLEAN_VOLUMES=true - Remove volumes during clean"
        echo ""
        exit 1
        ;;
esac