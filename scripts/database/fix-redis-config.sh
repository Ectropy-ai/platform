#!/bin/bash
set -euo pipefail

echo "🔧 Redis Configuration Validation and Fix"
echo "========================================="

# Initialize counters
FIXES=0
ISSUES=0

# Function to log with timestamp and type
log() {
    local type="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$type] $message"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; ((ISSUES++)); }
log_success() { log "SUCCESS" "$1"; }

# Validate Redis configuration syntax
validate_redis_config() {
    local config_file="$1"
    
    log_info "Validating Redis config: $config_file"
    
    if [ ! -f "$config_file" ]; then
        log_warn "Redis config file not found: $config_file"
        return 0
    fi
    
    # Check for malformed requirepass lines
    local malformed_lines=$(grep -n "requirepass.*--" "$config_file" 2>/dev/null || true)
    if [ -n "$malformed_lines" ]; then
        log_error "Found malformed requirepass configuration in $config_file:"
        echo "$malformed_lines"
        return 1
    fi
    
    # Check for multiple quoted arguments on requirepass line
    local multi_quote_lines=$(grep -n "requirepass.*\".*\".*\".*\"" "$config_file" 2>/dev/null || true)
    if [ -n "$multi_quote_lines" ]; then
        log_error "Found requirepass with multiple quoted arguments in $config_file:"
        echo "$multi_quote_lines"
        return 1
    fi
    
    log_success "Redis config validation passed: $config_file"
    return 0
}

# Fix Redis configuration issues
fix_redis_config() {
    local config_file="$1"
    
    if [ ! -f "$config_file" ]; then
        return 0
    fi
    
    log_info "Fixing Redis config: $config_file"
    
    # Create backup
    cp "$config_file" "$config_file.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Fix malformed requirepass lines
    if grep -q "requirepass.*--" "$config_file" 2>/dev/null; then
        log_info "Fixing malformed requirepass configuration..."
        
        # Replace malformed requirepass lines with proper format
        sed -i 's/requirepass.*"--appendonly".*"yes"/# Fixed malformed requirepass - use command line option instead\n# requirepass will be set via docker command line/' "$config_file"
        
        log_info "Fixed malformed requirepass configuration in $config_file"
        ((FIXES++))
    fi
    
    # Ensure proper Redis configuration structure
    if ! grep -q "^# SECURITY" "$config_file" 2>/dev/null; then
        cat >> "$config_file" << 'EOF'

# SECURITY
# Password will be set via command line --requirepass option
# This prevents configuration file parsing errors
protected-mode yes
EOF
        log_info "Added security section to $config_file"
        ((FIXES++))
    fi
}

# Validate Docker Compose Redis command syntax
validate_docker_compose_redis() {
    log_info "Validating Docker Compose Redis configurations..."
    
    local compose_files=(
        ".devcontainer/docker-compose.yml"
        "docker-compose.dev.yml"
        "docker-compose.staging.yml"
        "docker-compose.production.yml"
    )
    
    for compose_file in "${compose_files[@]}"; do
        if [ -f "$compose_file" ]; then
            log_info "Checking Redis command in: $compose_file"
            
            # Check for proper Redis command syntax
            local redis_cmd=$(grep -A 5 -B 5 "redis-server.*--requirepass" "$compose_file" 2>/dev/null || true)
            if [ -n "$redis_cmd" ]; then
                # Validate that environment variables are properly formatted
                if echo "$redis_cmd" | grep -q "redis-server --requirepass \${.*} --appendonly yes"; then
                    log_success "Redis command syntax is correct in $compose_file"
                else
                    log_warn "Redis command syntax may need review in $compose_file"
                    echo "Current command:"
                    echo "$redis_cmd"
                fi
            fi
        fi
    done
}

# Create Redis configuration template
create_redis_config_template() {
    local template_file="redis/redis.dev.template.conf"
    
    if [ ! -f "$template_file" ]; then
        log_info "Creating Redis development configuration template..."
        
        mkdir -p "$(dirname "$template_file")"
        
        cat > "$template_file" << 'EOF'
# ====================================
# ECTROPY REDIS DEVELOPMENT CONFIGURATION TEMPLATE
# Safe configuration for development environments
# ====================================

# NETWORK
bind 0.0.0.0
port 6379
tcp-backlog 511
timeout 300
tcp-keepalive 300

# GENERAL
daemonize no
supervised no
loglevel notice
databases 16

# SNAPSHOTTING
save 900 1
save 300 10
save 60 10000

stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

# SECURITY
# NOTE: Password should be set via command line --requirepass option
# Example: redis-server --requirepass ${REDIS_DEV_PASSWORD} --appendonly yes
# DO NOT set requirepass in this config file to avoid parsing errors
protected-mode yes

# Disable dangerous commands in development
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG "CONFIG_dev_safe"

# MEMORY MANAGEMENT
maxmemory 256mb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# APPEND ONLY FILE (AOF)
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 32mb
aof-load-truncated yes
aof-use-rdb-preamble yes

# PERFORMANCE
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64

# MONITORING
slowlog-log-slower-than 10000
slowlog-max-len 128
latency-monitor-threshold 100

# CLIENT LIMITS
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60

# FREQUENCY
hz 10
EOF
        
        log_success "Created Redis development configuration template: $template_file"
        ((FIXES++))
    fi
}

# Main execution
main() {
    log_info "Starting Redis configuration validation and fix..."
    
    # Find and validate Redis configuration files
    local redis_configs=(
        "redis/redis.conf"
        "redis/speckle-redis.conf"
    )
    
    local config_valid=true
    
    for config in "${redis_configs[@]}"; do
        if ! validate_redis_config "$config"; then
            config_valid=false
            fix_redis_config "$config"
        fi
    done
    
    # Validate Docker Compose configurations
    validate_docker_compose_redis
    
    # Create development template
    create_redis_config_template
    
    # Final validation
    log_info "Performing final validation..."
    for config in "${redis_configs[@]}"; do
        validate_redis_config "$config" || true
    done
    
    log_success "Redis configuration validation and fix completed"
    log_info "Configurations fixed: $FIXES"
    log_info "Issues found: $ISSUES"
    
    exit 0
}

# Run main function
main "$@"