#!/usr/bin/env bash
#
# Comprehensive Service Cleanup Script - Enterprise Grade
#
# Purpose: Stop ALL Ectropy services regardless of how they were started
# Handles: systemd, PM2, Docker, native processes, databases
#
# Usage: ./cleanup-all-services.sh [--dry-run] [--force]
#
# Options:
#   --dry-run: Show what would be stopped without actually stopping
#   --force: Skip confirmation prompts
#
# Exit Codes:
#   0 - All services stopped successfully
#   1 - Some services could not be stopped
#   2 - Cleanup aborted by user

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
}

# Parse arguments
DRY_RUN=false
FORCE=false

for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            ;;
        --force)
            FORCE=true
            ;;
    esac
done

echo "========================================"
echo "🛑 Ectropy Service Cleanup"
echo "========================================"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Hostname: $(hostname)"
echo "User: $(whoami)"
if [[ "$DRY_RUN" == "true" ]]; then
    echo "Mode: DRY RUN (no changes will be made)"
fi
echo ""

# Confirmation prompt (unless --force)
if [[ "$FORCE" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
    echo "⚠️  WARNING: This will stop ALL Ectropy services on this server!"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_warning "Cleanup aborted by user"
        exit 2
    fi
fi

# Helper function to execute or show command
execute_or_show() {
    local cmd="$1"
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY RUN] Would execute: $cmd"
    else
        eval "$cmd" || return 1
    fi
    return 0
}

# Track failures
FAILED_OPERATIONS=0

# =============================================================================
# 1. STOP SYSTEMD SERVICES
# =============================================================================
echo "========================================"
echo "1️⃣  Stopping Systemd Services"
echo "========================================"

SYSTEMD_SERVICES=$(systemctl list-units --all --type=service 2>/dev/null | grep -i ectropy | awk '{print $1}' || true)

if [[ -n "$SYSTEMD_SERVICES" ]]; then
    log_info "Found systemd services to stop"
    for service in $SYSTEMD_SERVICES; do
        echo "Stopping $service..."
        if execute_or_show "sudo systemctl stop $service"; then
            if execute_or_show "sudo systemctl disable $service"; then
                log_success "Stopped and disabled: $service"
            else
                log_warning "Stopped but could not disable: $service"
            fi
        else
            log_error "Failed to stop: $service"
            ((FAILED_OPERATIONS++))
        fi
    done
else
    log_info "No systemd services found"
fi
echo ""

# =============================================================================
# 2. PM2 PROCESS MANAGER CLEANUP (ENHANCED)
# =============================================================================
echo "========================================"
echo "2️⃣  PM2 Process Manager"
echo "========================================"

if command -v pm2 >/dev/null 2>&1; then
    log_info "PM2 detected, checking for processes..."

    # Get all PM2 processes (not just Ectropy-named)
    PM2_PROCESSES=$(pm2 jlist 2>/dev/null | jq -r '.[] | "\(.pm_id):\(.name)"' 2>/dev/null || true)

    if [ -n "$PM2_PROCESSES" ]; then
        log_warning "Found PM2 processes:"
        pm2 list | sed 's/^/  /'
        echo ""

        # Check for Ectropy-related processes
        ECTROPY_PM2=$(echo "$PM2_PROCESSES" | grep -iE '(ectropy|api|mcp|gateway|web-dashboard)' || true)

        if [ -n "$ECTROPY_PM2" ]; then
            log_warning "Found Ectropy-related PM2 processes"

            # Delete Ectropy processes
            echo "$ECTROPY_PM2" | while IFS=: read pm_id name; do
                log_info "Deleting PM2 process: $name (ID: $pm_id)"
                if execute_or_show "pm2 delete $pm_id"; then
                    log_success "Deleted PM2 process: $name"
                else
                    log_error "Failed to delete PM2 process: $name"
                    FAILED_OPERATIONS=$((FAILED_OPERATIONS + 1))
                fi
            done
        fi

        # Option to delete ALL PM2 processes (with confirmation)
        if [[ "$FORCE" == "true" ]]; then
            log_warning "Force mode: Deleting ALL PM2 processes"
            if execute_or_show "pm2 delete all"; then
                log_success "Deleted all PM2 processes"
            else
                log_error "Failed to delete all PM2 processes"
                FAILED_OPERATIONS=$((FAILED_OPERATIONS + 1))
            fi
        fi

        # Save PM2 state (persist deletions to prevent resurrection)
        if execute_or_show "pm2 save --force"; then
            log_success "PM2 state saved (persisted changes)"
        else
            log_warning "Failed to save PM2 state"
        fi

        # Verify cleanup
        REMAINING=$(pm2 list 2>/dev/null | grep -c online || echo "0")
        if [ "$REMAINING" -eq 0 ]; then
            log_success "All PM2 processes stopped"
        else
            log_warning "$REMAINING PM2 processes still running"
        fi

    else
        log_success "No PM2 processes running"
    fi

    # Check PM2 daemon status
    PM2_DAEMON_PID=$(pm2 ping 2>/dev/null | grep -o "PID [0-9]*" | awk '{print $2}' || echo "")
    if [ -n "$PM2_DAEMON_PID" ]; then
        log_info "PM2 daemon running (PID: $PM2_DAEMON_PID)"
        # Option to kill daemon in force mode
        if [[ "$FORCE" == "true" ]]; then
            log_warning "Force mode: Killing PM2 daemon"
            if execute_or_show "pm2 kill"; then
                log_success "PM2 daemon killed"
            fi
        fi
    fi

else
    log_info "PM2 not installed"
fi
echo ""

# =============================================================================
# 3. STOP DOCKER CONTAINERS
# =============================================================================
echo "========================================"
echo "3️⃣  Stopping Docker Containers"
echo "========================================"

if command -v docker >/dev/null 2>&1; then
    DOCKER_CONTAINERS=$(docker ps -q --filter "name=ectropy" 2>/dev/null || true)

    if [[ -n "$DOCKER_CONTAINERS" ]]; then
        log_info "Found running Docker containers to stop"
        for container in $DOCKER_CONTAINERS; do
            CONTAINER_NAME=$(docker ps --filter "id=$container" --format "{{.Names}}")
            echo "Stopping container: $CONTAINER_NAME"
            if execute_or_show "docker stop $container"; then
                log_success "Stopped: $CONTAINER_NAME"
            else
                log_error "Failed to stop: $CONTAINER_NAME"
                ((FAILED_OPERATIONS++))
            fi
        done
    else
        log_info "No running Docker containers found"
    fi

    # Remove stopped containers
    STOPPED_CONTAINERS=$(docker ps -aq --filter "name=ectropy" 2>/dev/null || true)
    if [[ -n "$STOPPED_CONTAINERS" ]]; then
        log_info "Removing stopped containers"
        for container in $STOPPED_CONTAINERS; do
            CONTAINER_NAME=$(docker ps -a --filter "id=$container" --format "{{.Names}}")
            if execute_or_show "docker rm -f $container"; then
                log_success "Removed: $CONTAINER_NAME"
            fi
        done
    fi
else
    log_info "Docker not installed"
fi
echo ""

# =============================================================================
# 4. STOP NATIVE DATABASE SERVICES
# =============================================================================
echo "========================================"
echo "4️⃣  Stopping Native Database Services"
echo "========================================"

DATABASE_SERVICES=(postgresql redis-server)
for service in "${DATABASE_SERVICES[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo "Stopping $service..."
        if execute_or_show "sudo systemctl stop $service"; then
            if execute_or_show "sudo systemctl disable $service"; then
                log_success "Stopped and disabled: $service"
            else
                log_warning "Stopped but could not disable: $service"
            fi
        else
            log_error "Failed to stop: $service"
            ((FAILED_OPERATIONS++))
        fi
    else
        log_info "$service not running"
    fi
done
echo ""

# =============================================================================
# 5. KILL PROCESSES BY PORT (LAST RESORT)
# =============================================================================
echo "========================================"
echo "5️⃣  Killing Processes by Port (Last Resort)"
echo "========================================"

PORTS=(3000 3001 3002 4000)
KILLED_ANY=false

for port in "${PORTS[@]}"; do
    if command -v lsof >/dev/null 2>&1; then
        PID=$(lsof -t -i:"$port" 2>/dev/null || true)
    else
        # Fallback to netstat/ss
        PID=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' || true)
    fi

    if [[ -n "$PID" ]]; then
        PROCESS_INFO=$(ps -p "$PID" -o comm= 2>/dev/null || echo "unknown")
        log_warning "Port $port still in use by PID $PID ($PROCESS_INFO)"

        if [[ "$DRY_RUN" != "true" ]]; then
            echo "Attempting to kill PID $PID..."
            if kill -15 "$PID" 2>/dev/null; then
                sleep 2
                if kill -0 "$PID" 2>/dev/null; then
                    log_warning "Process still running, using SIGKILL"
                    kill -9 "$PID" 2>/dev/null || true
                fi
                log_success "Killed process on port $port (PID: $PID)"
                KILLED_ANY=true
            else
                log_error "Failed to kill process on port $port"
                ((FAILED_OPERATIONS++))
            fi
        else
            echo "[DRY RUN] Would kill PID $PID on port $port"
        fi
    else
        log_success "Port $port is free"
    fi
done

if [[ "$KILLED_ANY" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
    log_info "No processes needed to be killed by port"
fi
echo ""

# =============================================================================
# 6. WAIT FOR CLEANUP TO COMPLETE
# =============================================================================
if [[ "$DRY_RUN" != "true" ]]; then
    echo "========================================"
    echo "6️⃣  Waiting for Cleanup to Complete"
    echo "========================================"
    log_info "Waiting 5 seconds for processes to fully terminate..."
    sleep 5
    echo ""
fi

# =============================================================================
# SUMMARY
# =============================================================================
echo "========================================"
echo "📊 CLEANUP SUMMARY"
echo "========================================"

if [[ "$DRY_RUN" == "true" ]]; then
    log_info "DRY RUN completed - no changes were made"
else
    if [[ $FAILED_OPERATIONS -eq 0 ]]; then
        log_success "All services stopped successfully!"
        echo "✅ System ready for Docker deployment"
        EXIT_CODE=0
    else
        log_warning "Cleanup completed with $FAILED_OPERATIONS failures"
        echo "⚠️  Some services may still be running"
        echo "💡 Run discover-services.sh to verify"
        EXIT_CODE=1
    fi
fi

echo ""
echo "========================================"
echo "Cleanup completed at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "========================================"

exit ${EXIT_CODE:-0}
