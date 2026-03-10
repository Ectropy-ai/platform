#!/bin/bash
# Enterprise Rollback and Recovery Script
# Provides automated rollback capabilities for failed deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
ENVIRONMENT="${ENVIRONMENT:-staging}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
BACKUP_DIR="backups/rollback"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-300}"

log "🔄 Enterprise Rollback and Recovery System"
log "Environment: $ENVIRONMENT"
log "Compose File: $COMPOSE_FILE"

# Create backup directory
setup_rollback_environment() {
    log "📁 Setting up rollback environment..."
    
    mkdir -p "$BACKUP_DIR"
    mkdir -p "logs/rollback"
    
    success "Rollback environment prepared"
}

# Create deployment snapshot
create_deployment_snapshot() {
    local snapshot_name="$1"
    local snapshot_dir="$BACKUP_DIR/${snapshot_name}"
    
    log "📸 Creating deployment snapshot: $snapshot_name"
    
    mkdir -p "$snapshot_dir"
    
    # Save current container states
    docker compose -f "$COMPOSE_FILE" ps --format "json" > "$snapshot_dir/container_states.json" 2>/dev/null || echo "[]" > "$snapshot_dir/container_states.json"
    
    # Save current images
    docker images --format "json" | jq 'select(.Repository | contains("ectropy"))' > "$snapshot_dir/current_images.json" 2>/dev/null || echo "[]" > "$snapshot_dir/current_images.json"
    
    # Save current configuration
    if [ -f ".env" ]; then
        cp ".env" "$snapshot_dir/env_backup"
    fi
    
    # Save Docker Compose configuration
    if [ -f "$COMPOSE_FILE" ]; then
        cp "$COMPOSE_FILE" "$snapshot_dir/compose_backup.yml"
    fi
    
    # Create snapshot metadata
    cat > "$snapshot_dir/metadata.json" << EOF
{
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "environment": "$ENVIRONMENT",
    "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
    "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
    "snapshot_name": "$snapshot_name",
    "compose_file": "$COMPOSE_FILE"
}
EOF
    
    success "Deployment snapshot created: $snapshot_dir"
}

# List available snapshots
list_snapshots() {
    log "📋 Available rollback snapshots:"
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        warning "No rollback snapshots found"
        return 1
    fi
    
    local count=0
    for snapshot_dir in "$BACKUP_DIR"/*; do
        if [ -d "$snapshot_dir" ] && [ -f "$snapshot_dir/metadata.json" ]; then
            count=$((count + 1))
            local snapshot_name=$(basename "$snapshot_dir")
            local timestamp=$(jq -r '.timestamp' "$snapshot_dir/metadata.json" 2>/dev/null || echo "unknown")
            local git_commit=$(jq -r '.git_commit' "$snapshot_dir/metadata.json" 2>/dev/null || echo "unknown")
            
            log "  $count. $snapshot_name (created: $timestamp, commit: ${git_commit:0:8})"
        fi
    done
    
    if [ $count -eq 0 ]; then
        warning "No valid rollback snapshots found"
        return 1
    fi
    
    success "Found $count rollback snapshots"
    return 0
}

# Validate snapshot integrity
validate_snapshot() {
    local snapshot_name="$1"
    local snapshot_dir="$BACKUP_DIR/${snapshot_name}"
    
    log "🔍 Validating snapshot: $snapshot_name"
    
    if [ ! -d "$snapshot_dir" ]; then
        error "Snapshot directory not found: $snapshot_dir"
        return 1
    fi
    
    # Check required files
    local required_files=(
        "metadata.json"
        "container_states.json"
        "current_images.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$snapshot_dir/$file" ]; then
            error "Missing snapshot file: $file"
            return 1
        fi
    done
    
    # Validate JSON files
    if ! jq empty "$snapshot_dir/metadata.json" 2>/dev/null; then
        error "Invalid metadata.json in snapshot"
        return 1
    fi
    
    success "Snapshot validation passed"
    return 0
}

# Auto-create deployment snapshot for safety
ensure_pre_deployment_snapshot() {
    local operation_type="${1:-deployment}"
    local snapshot_name="pre-${operation_type}-$(date +%Y%m%d-%H%M%S)"
    
    log "🛡️ Creating safety snapshot before $operation_type..."
    
    # Check if we have recent snapshots (within last hour)
    local recent_snapshot_count=0
    if [ -d "$BACKUP_DIR" ]; then
        recent_snapshot_count=$(find "$BACKUP_DIR" -name "pre-*" -type d -mmin -60 2>/dev/null | wc -l)
    fi
    
    if [ "$recent_snapshot_count" -gt 0 ]; then
        log "Recent snapshot found, skipping duplicate creation"
        return 0
    fi
    
    # Create the snapshot
    if create_deployment_snapshot "$snapshot_name"; then
        success "Safety snapshot created: $snapshot_name"
        return 0
    else
        warning "Failed to create safety snapshot, proceeding with caution"
        return 1
    fi
}

# Stop current deployment
stop_current_deployment() {
    log "🛑 Stopping current deployment..."
    
    # Stop all services
    if timeout "$ROLLBACK_TIMEOUT" docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>&1 | tee logs/rollback/stop_current.log; then
        success "Current deployment stopped successfully"
    else
        error "Failed to stop current deployment cleanly"
        
        # Force stop if normal stop fails
        warning "Attempting force stop..."
        docker compose -f "$COMPOSE_FILE" kill || true
        docker compose -f "$COMPOSE_FILE" down --remove-orphans --volumes || true
        
        warning "Force stop completed"
    fi
}

# Restore from snapshot
restore_from_snapshot() {
    local snapshot_name="$1"
    local snapshot_dir="$BACKUP_DIR/${snapshot_name}"
    
    log "🔄 Restoring from snapshot: $snapshot_name"
    
    # Validate snapshot first
    if ! validate_snapshot "$snapshot_name"; then
        error "Snapshot validation failed, cannot restore"
        return 1
    fi
    
    # Restore environment configuration
    if [ -f "$snapshot_dir/env_backup" ]; then
        log "🔧 Restoring environment configuration..."
        cp "$snapshot_dir/env_backup" ".env"
        success "Environment configuration restored"
    fi
    
    # Restore Docker Compose configuration
    if [ -f "$snapshot_dir/compose_backup.yml" ]; then
        log "🐳 Restoring Docker Compose configuration..."
        cp "$snapshot_dir/compose_backup.yml" "$COMPOSE_FILE"
        success "Docker Compose configuration restored"
    fi
    
    # Get image information from snapshot
    local images_to_restore
    images_to_restore=$(jq -r '.[] | select(.Repository | contains("ectropy")) | "\(.Repository):\(.Tag)"' "$snapshot_dir/current_images.json" 2>/dev/null || echo "")
    
    if [ -n "$images_to_restore" ]; then
        log "🖼️ Attempting to restore Docker images..."
        echo "$images_to_restore" | while read -r image; do
            if [ -n "$image" ] && [ "$image" != "null" ]; then
                log "Checking image: $image"
                if docker images "$image" --format "{{.Repository}}:{{.Tag}}" | grep -q "$image"; then
                    success "Image available: $image"
                else
                    warning "Image not available locally: $image"
                fi
            fi
        done
    fi
    
    success "Snapshot restoration completed"
}

# Start restored deployment
start_restored_deployment() {
    log "🚀 Starting restored deployment..."
    
    # Start services in dependency order
    log "📦 Starting infrastructure services..."
    if timeout "$ROLLBACK_TIMEOUT" docker compose -f "$COMPOSE_FILE" up -d postgres redis speckle-postgres speckle-redis 2>&1 | tee logs/rollback/start_infrastructure.log; then
        success "Infrastructure services started"
    else
        error "Failed to start infrastructure services"
        return 1
    fi
    
    # Wait for infrastructure to be ready
    log "⏳ Waiting for infrastructure services..."
    sleep 30
    
    # Start application services
    log "🏗️ Starting application services..."
    if timeout "$ROLLBACK_TIMEOUT" docker compose -f "$COMPOSE_FILE" up -d 2>&1 | tee logs/rollback/start_application.log; then
        success "Application services started"
    else
        error "Failed to start application services"
        return 1
    fi
    
    success "Restored deployment started successfully"
}

# Verify rollback success
verify_rollback() {
    log "🔍 Verifying rollback success..."
    
    local verification_failures=0
    
    # Check container health
    log "🏥 Checking container health..."
    local unhealthy_containers
    unhealthy_containers=$(docker compose -f "$COMPOSE_FILE" ps --format "json" | jq -r '.[] | select(.State != "running") | .Name' 2>/dev/null || echo "")
    
    if [ -n "$unhealthy_containers" ]; then
        error "Unhealthy containers detected:"
        echo "$unhealthy_containers" | while read -r container; do
            if [ -n "$container" ]; then
                error "  - $container"
            fi
        done
        verification_failures=$((verification_failures + 1))
    else
        success "All containers are running"
    fi
    
    # Check API health
    log "🔌 Checking API health..."
    if curl -f -s http://localhost:4000/health >/dev/null 2>&1; then
        success "API Gateway is healthy"
    else
        error "API Gateway health check failed"
        verification_failures=$((verification_failures + 1))
    fi
    
    # Check database connectivity
    log "🗄️ Checking database connectivity..."
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
        success "Database is accessible"
    else
        error "Database connectivity check failed"
        verification_failures=$((verification_failures + 1))
    fi
    
    if [ $verification_failures -eq 0 ]; then
        success "Rollback verification passed - system is healthy"
        return 0
    else
        error "Rollback verification failed - $verification_failures issues detected"
        return 1
    fi
}

# Emergency rollback function
emergency_rollback() {
    local latest_snapshot
    
    warning "🚨 Performing emergency rollback..."
    
    # Find the most recent snapshot
    if [ -d "$BACKUP_DIR" ]; then
        latest_snapshot=$(ls -t "$BACKUP_DIR" | head -1)
        
        if [ -n "$latest_snapshot" ]; then
            warning "Using latest snapshot: $latest_snapshot"
            
            # Perform rapid rollback
            stop_current_deployment
            restore_from_snapshot "$latest_snapshot"
            start_restored_deployment
            
            if verify_rollback; then
                success "Emergency rollback completed successfully"
                return 0
            else
                error "Emergency rollback verification failed"
                return 1
            fi
        else
            error "No snapshots available for emergency rollback"
            return 1
        fi
    else
        error "Backup directory not found - cannot perform emergency rollback"
        return 1
    fi
}

# Full rollback process
perform_rollback() {
    local snapshot_name="$1"
    
    if [ -z "$snapshot_name" ]; then
        error "Snapshot name required for rollback"
        log "Available snapshots:"
        list_snapshots
        return 1
    fi
    
    log "🔄 Performing rollback to snapshot: $snapshot_name"
    
    # Create a snapshot of current state before rollback
    create_deployment_snapshot "pre-rollback-$(date +%Y%m%d-%H%M%S)"
    
    # Execute rollback steps
    stop_current_deployment &&
    restore_from_snapshot "$snapshot_name" &&
    start_restored_deployment &&
    verify_rollback
    
    local rollback_status=$?
    
    if [ $rollback_status -eq 0 ]; then
        success "🎉 Rollback completed successfully"
        log "System has been rolled back to snapshot: $snapshot_name"
    else
        error "❌ Rollback failed"
        warning "System may be in an inconsistent state"
        log "Consider running emergency rollback or manual recovery"
    fi
    
    return $rollback_status
}

# Main function
main() {
    local action="${1:-list}"
    local snapshot_name="$2"
    
    setup_rollback_environment
    
    case "$action" in
        "snapshot"|"create")
            if [ -z "$snapshot_name" ]; then
                snapshot_name="manual-$(date +%Y%m%d-%H%M%S)"
            fi
            create_deployment_snapshot "$snapshot_name"
            ;;
        "list")
            list_snapshots
            ;;
        "rollback")
            if [ -z "$snapshot_name" ]; then
                error "Snapshot name required for rollback"
                log "Use: $0 rollback <snapshot_name>"
                list_snapshots
                exit 1
            fi
            perform_rollback "$snapshot_name"
            ;;
        "emergency")
            emergency_rollback
            ;;
        "verify")
            verify_rollback
            ;;
        "auto-snapshot")
            ensure_pre_deployment_snapshot "${snapshot_name:-deployment}"
            ;;
        *)
            log "Usage: $0 [action] [snapshot_name]"
            log ""
            log "Actions:"
            log "  list          - List available snapshots (default)"
            log "  snapshot      - Create new snapshot"
            log "  rollback      - Rollback to specific snapshot"
            log "  emergency     - Emergency rollback to latest snapshot"
            log "  verify        - Verify current deployment health"
            log "  auto-snapshot - Create pre-deployment safety snapshot"
            log ""
            log "Examples:"
            log "  $0 list"
            log "  $0 snapshot my-snapshot"
            log "  $0 rollback my-snapshot"
            log "  $0 emergency"
            log "  $0 auto-snapshot deployment"
            log ""
            log "💡 Tip: Use 'auto-snapshot' before deployments to ensure rollback capability"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"