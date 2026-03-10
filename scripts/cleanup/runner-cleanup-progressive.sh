#!/bin/bash
# Progressive runner cleanup with 3 modes: warning, aggressive, critical
# Usage: runner-cleanup-progressive.sh [warning|aggressive|critical]
# Enhanced: Includes Docker build cache cleanup for legacy Docker builder

set -e

MODE=${1:-warning}

echo "════════════════════════════════════════════════"
echo "🧹 Runner Disk Cleanup - Mode: ${MODE^^}"
echo "════════════════════════════════════════════════"

# Record initial state
INITIAL_USAGE=$(df -h / | awk 'NR==2 {print $5}')
INITIAL_FREE=$(df -BG / | awk 'NR==2 {print $4}')
echo "📊 Initial State: ${INITIAL_USAGE} used (${INITIAL_FREE} free)"
echo ""

# Function: Clean Docker build cache (legacy builder)
# This is critical for preventing the 99.84GB cache accumulation issue
cleanup_docker_cache() {
    echo "🗑️  Pruning Docker build cache (legacy builder)..."
    
    # Get cache size before cleanup using docker system df
    # Parse robustly: grep for "Build Cache" line, use $(NF-1) to get second-to-last column (size)
    # $(NF-1) is used because the last column is "Reclaimable" and size is always before it
    CACHE_BEFORE=$(docker system df 2>/dev/null | grep -i "^Build Cache" | awk '{print $(NF-1)}' || echo "unknown")
    
    # Run docker system prune to clean build cache, dangling images, and stopped containers
    # Using -af for aggressive cleanup: all unused images and cache, not just dangling
    if docker system prune -af --volumes > /dev/null 2>&1; then
        # Parse size after cleanup using same robust method
        CACHE_AFTER=$(docker system df 2>/dev/null | grep -i "^Build Cache" | awk '{print $(NF-1)}' || echo "unknown")
        echo "    ✅ Docker system pruned"
        echo "    📊 Build cache: ${CACHE_BEFORE} → ${CACHE_AFTER}"
    else
        echo "    ⚠️  Docker system prune failed (non-critical, continuing...)"
    fi
}

case "$MODE" in
  warning)
    echo "🔵 NORMAL Mode - Conservative Cleanup"
    echo "----------------------------------------"
    
    # Clean old Docker images (>7 days, untagged only)
    echo "🐳 Cleaning untagged Docker images (>7 days)..."
    docker image prune -a --filter "until=168h" -f || true
    
    # Clean Docker build cache - NEW: Critical for preventing 99.84GB accumulation
    cleanup_docker_cache
    
    # Clean old evidence files (>90 days)
    echo "📁 Cleaning old evidence files (>90 days)..."
    find evidence/ -type f -mtime +90 -delete 2>/dev/null || true
    
    # Validate pnpm cache size (<5GB per runner)
    echo "📦 Validating pnpm cache sizes..."
    bash scripts/ci/cleanup-pnpm-runner.sh || true
    
    # Clean Docker build cache (>7 days) - keeping for compatibility
    echo "🏗️ Cleaning old Docker build cache..."
    docker builder prune --filter "until=168h" -f || true
    ;;
    
  aggressive)
    echo "🟡 AGGRESSIVE Mode - Enhanced Cleanup"
    echo "----------------------------------------"
    
    # All warning cleanup first
    docker image prune -a --filter "until=168h" -f || true
    find evidence/ -type f -mtime +90 -delete 2>/dev/null || true
    bash scripts/ci/cleanup-pnpm-runner.sh || true
    
    # Docker cache cleanup - aggressive mode
    cleanup_docker_cache
    
    # PLUS: Clean all untagged images immediately
    echo "🐳 Removing ALL untagged Docker images..."
    docker image prune -a -f || true
    
    # PLUS: Clean all Docker build cache
    echo "🏗️ Removing ALL Docker build cache..."
    docker builder prune -a -f || true
    
    # PLUS: Clean Nx cache older than 30 days
    echo "⚡ Cleaning old Nx cache (>30 days)..."
    find /opt/runner-cache/*/.nx/cache -type f -mtime +30 -delete 2>/dev/null || true
    
    # PLUS: Clean npm cache
    echo "📦 Cleaning npm cache..."
    npm cache clean --force 2>/dev/null || true
    ;;
    
  critical)
    echo "🔴 EMERGENCY Mode - Maximum Cleanup"
    echo "----------------------------------------"
    
    # All aggressive cleanup first
    docker image prune -a -f || true
    docker builder prune -a -f || true
    bash scripts/ci/cleanup-pnpm-runner.sh || true
    npm cache clean --force 2>/dev/null || true
    
    # Docker cache cleanup - emergency mode (most aggressive)
    cleanup_docker_cache
    
    # PLUS: Remove ALL Docker images (keep only running containers)
    echo "🐳 Removing ALL unused Docker images..."
    docker image prune -a -f --filter "dangling=false" || true
    
    # PLUS: Clean Docker volumes (unused only)
    echo "💾 Cleaning unused Docker volumes..."
    docker volume prune -f || true
    
    # PLUS: Remove evidence files older than 30 days
    echo "📁 Cleaning evidence files (>30 days)..."
    find evidence/ -type f -mtime +30 -delete 2>/dev/null || true
    
    # PLUS: Force pnpm store cleanup (nuclear option)
    echo "📦 Force cleaning ALL pnpm stores..."
    rm -rf /opt/runner-cache/*/.pnpm-store/* 2>/dev/null || true
    
    # PLUS: Clean all Nx cache
    echo "⚡ Force cleaning ALL Nx cache..."
    rm -rf /opt/runner-cache/*/.nx/cache/* 2>/dev/null || true
    
    # PLUS: Clean system logs
    echo "📋 Cleaning old system logs (>7 days)..."
    sudo journalctl --vacuum-time=7d 2>/dev/null || true
    
    # PLUS: Clean APT cache
    echo "📦 Cleaning APT package cache..."
    sudo apt-get clean 2>/dev/null || true
    
    # PLUS: Clean old kernels (if any)
    echo "🔧 Cleaning old kernel packages..."
    sudo apt-get autoremove --purge -y 2>/dev/null || true
    ;;
    
  *)
    echo "❌ Invalid mode: $MODE"
    echo "Usage: $0 [warning|aggressive|critical]"
    exit 1
    ;;
esac

echo ""
echo "════════════════════════════════════════════════"

# Report final disk usage
FINAL_USAGE=$(df -h / | awk 'NR==2 {print $5}')
FINAL_FREE=$(df -BG / | awk 'NR==2 {print $4}')
RECOVERED=$(echo "$INITIAL_FREE $FINAL_FREE" | awk '{print $2 - $1}' | sed 's/G//')

echo "✅ Cleanup Complete!"
echo "   Initial: ${INITIAL_USAGE} (${INITIAL_FREE} free)"
echo "   Final:   ${FINAL_USAGE} (${FINAL_FREE} free)"
echo "   Recovered: ~${RECOVERED}GB"
echo "════════════════════════════════════════════════"

# Exit with success
exit 0
