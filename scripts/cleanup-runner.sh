#!/bin/bash
set -euo pipefail

###############################################################################
# Runner Cleanup Script
# Purpose: Enhanced cleanup for runner workspace, Docker, and caches after workflow execution
# Usage: cleanup-runner.sh [runner-name] [--aggressive|--emergency] [--verbose]
# Modes:
#   - Standard: Conservative cleanup (default) - for 60-75% usage
#   - Aggressive: Removes ALL caches when disk usage critical (--aggressive flag) - for 75-85% usage
#   - Emergency: Maximum cleanup including all Docker images (--emergency flag) - for 85%+ usage
###############################################################################

# Parse arguments
AGGRESSIVE_MODE=false
EMERGENCY_MODE=false
VERBOSE_MODE=false
RUNNER_NAME=""

for arg in "$@"; do
  case $arg in
    --aggressive)
      AGGRESSIVE_MODE=true
      shift
      ;;
    --emergency)
      EMERGENCY_MODE=true
      AGGRESSIVE_MODE=true  # Emergency includes all aggressive cleanup
      shift
      ;;
    --verbose)
      VERBOSE_MODE=true
      shift
      ;;
    *)
      RUNNER_NAME="$arg"
      shift
      ;;
  esac
done

# Get runner name from environment or parameter
RUNNER_NAME="${RUNNER_NAME:-${RUNNER_NAME:-$(hostname)}}"

if [[ "$EMERGENCY_MODE" == "true" ]]; then
  echo "🚨 Starting EMERGENCY runner cleanup..."
  echo "⚠️  CRITICAL: This will remove ALL Docker images, caches, and temporary files"
  echo "⚠️  This is the most aggressive cleanup mode for critical disk situations (85%+)"
elif [[ "$AGGRESSIVE_MODE" == "true" ]]; then
  echo "🧹 Starting AGGRESSIVE runner cleanup..."
  echo "⚠️  WARNING: This will remove ALL caches and temporary files"
else
  echo "🧹 Starting enhanced runner cleanup..."
fi

echo "ℹ️  Runner: $RUNNER_NAME"
[[ "$VERBOSE_MODE" == "true" ]] && echo "ℹ️  Verbose mode enabled"

# Get workspace directory from GitHub Actions environment or current directory
WORKSPACE_DIR="${GITHUB_WORKSPACE:-$PWD}"

# Safety check - ensure workspace is not root or home
if [[ "$WORKSPACE_DIR" == "/" ]] || [[ "$WORKSPACE_DIR" == "$HOME" ]]; then
  echo "⚠️  WARNING: Refusing to clean root or home directory"
  echo "ℹ️  Workspace: $WORKSPACE_DIR"
  exit 0
fi

# 1. Clean up workspace (GitHub Actions already does this, but ensure)
if [[ -n "$WORKSPACE_DIR" ]] && [[ -d "$WORKSPACE_DIR" ]]; then
  echo "📦 Cleaning workspace: $WORKSPACE_DIR"
  
  # Remove node_modules directories
  if find "$WORKSPACE_DIR" -type d -name "node_modules" -print -quit 2>/dev/null | grep -q .; then
    echo "  🗑️  Removing node_modules directories..."
    find "$WORKSPACE_DIR" -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
  fi
  
  # Remove dist directories
  if find "$WORKSPACE_DIR" -type d -name "dist" -print -quit 2>/dev/null | grep -q .; then
    echo "  🗑️  Removing dist directories..."
    find "$WORKSPACE_DIR" -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
  fi
  
  # Remove .nx cache
  if find "$WORKSPACE_DIR" -type d -name ".nx" -print -quit 2>/dev/null | grep -q .; then
    echo "  🗑️  Removing .nx cache..."
    find "$WORKSPACE_DIR" -type d -name ".nx" -exec rm -rf {} + 2>/dev/null || true
  fi
  
  # Remove build artifacts
  if find "$WORKSPACE_DIR" -type d -name "build" -print -quit 2>/dev/null | grep -q .; then
    echo "  🗑️  Removing build directories..."
    find "$WORKSPACE_DIR" -type d -name "build" -exec rm -rf {} + 2>/dev/null || true
  fi
else
  echo "ℹ️  Workspace directory not found or not accessible: $WORKSPACE_DIR"
fi

# 2. Enhanced Docker cleanup
if command -v docker &> /dev/null; then
  echo "🐳 Enhanced Docker cleanup..."
  
  echo "  📊 Docker disk usage before cleanup:"
  docker system df 2>/dev/null || true
  
  # Smart Docker cleanup (keep recent images - only in normal mode)
  if [[ "$AGGRESSIVE_MODE" != "true" ]]; then
    echo "  🧠 Smart Docker cleanup (keeping recent images)..."
    
    # Remove stopped containers (older than 1 hour)
    echo "  🗑️  Removing stopped containers (>1 hour)..."
    docker container prune -f --filter "until=1h" 2>/dev/null || true
    
    # Remove dangling images
    echo "  🗑️  Removing dangling images..."
    docker image prune -f 2>/dev/null || true
    
    # Remove unused images older than 7 days (keep recent builds)
    echo "  🗑️  Removing unused images (>7 days)..."
    docker image prune -af --filter "until=168h" 2>/dev/null || true
    
    # Remove unused volumes
    echo "  🗑️  Removing unused volumes..."
    docker volume prune -f --filter "label!=keep" 2>/dev/null || true
    
    # Remove build cache older than 7 days (keep 10GB)
    echo "  🗑️  Removing old build cache (>7 days, keep 10GB)..."
    docker builder prune -f --filter "until=168h" --keep-storage 10GB 2>/dev/null || true
  else
    # Aggressive/Emergency mode - remove more aggressively
    echo "  ⚠️  Aggressive Docker cleanup mode..."
    
    # Remove stopped containers (older than 1 hour)
    echo "  🗑️  Removing stopped containers (>1 hour)..."
    docker container prune -f --filter "until=1h" 2>/dev/null || true
    
    # Remove dangling images
    echo "  🗑️  Removing dangling images..."
    docker image prune -f 2>/dev/null || true
    
    # Remove unused images (not just dangling)
    echo "  🗑️  Removing unused images (>48 hours)..."
    docker image prune -af --filter "until=48h" 2>/dev/null || true
    
    # Remove unused volumes
    echo "  🗑️  Removing unused volumes..."
    docker volume prune -f --filter "label!=keep" 2>/dev/null || true
    
    # Remove build cache (keep last 7 days)
    echo "  🗑️  Removing old build cache (>7 days, keep 10GB)..."
    docker builder prune -f --filter "until=168h" --keep-storage 10GB 2>/dev/null || true
  fi
  
  echo "  ✅ Docker cleanup complete"
  echo "  📊 Docker disk usage after cleanup:"
  docker system df 2>/dev/null || true
else
  echo "ℹ️  Docker not available, skipping Docker cleanup"
fi

# 3. Clean old workflow evidence (older than 30 days)
echo ""
echo "📁 Cleaning old evidence files (>30 days)..."
EVIDENCE_DIRS=(
  "/opt/actions-runner-${RUNNER_NAME}/_work/Ectropy/Ectropy/evidence"
  "${WORKSPACE_DIR}/evidence"
)

for EVIDENCE_DIR in "${EVIDENCE_DIRS[@]}"; do
  if [[ -d "$EVIDENCE_DIR" ]]; then
    echo "  🔍 Checking: $EVIDENCE_DIR"
    OLD_FILES=$(find "$EVIDENCE_DIR" -type f -mtime +30 2>/dev/null | wc -l)
    if [[ $OLD_FILES -gt 0 ]]; then
      echo "  🗑️  Removing ${OLD_FILES} evidence files older than 30 days..."
      find "$EVIDENCE_DIR" -type f -mtime +30 -delete 2>/dev/null || true
      echo "  ✅ Evidence cleanup complete"
    else
      echo "  ℹ️  No old evidence files found"
    fi
  fi
done

# 4. Clean GitHub Actions cache (older than 7 days)
echo ""
echo "📦 Cleaning old Actions cache (>7 days)..."
ACTIONS_CACHE_DIR="${HOME}/.cache/actions"
if [[ -d "$ACTIONS_CACHE_DIR" ]]; then
  CACHE_SIZE_BEFORE=$(du -sm "$ACTIONS_CACHE_DIR" 2>/dev/null | cut -f1)
  echo "  ℹ️  Actions cache size: ${CACHE_SIZE_BEFORE}MB"
  find "$ACTIONS_CACHE_DIR" -type f -mtime +7 -delete 2>/dev/null || true
  CACHE_SIZE_AFTER=$(du -sm "$ACTIONS_CACHE_DIR" 2>/dev/null | cut -f1)
  echo "  ✅ Cleaned $((CACHE_SIZE_BEFORE - CACHE_SIZE_AFTER))MB from Actions cache"
else
  echo "  ℹ️  Actions cache directory not found"
fi

# 5. Aggressive cleanup (only when --aggressive flag is set)
if [[ "$AGGRESSIVE_MODE" == "true" ]]; then
  echo ""
  echo "⚠️  AGGRESSIVE MODE: Removing ALL caches and temporary files..."
  
  # Purge ALL pnpm stores
  if [[ -d "/opt/runner-cache" ]]; then
    echo "  🗑️  Purging ALL pnpm stores..."
    find /opt/runner-cache -type d -name "pnpm-store" -exec rm -rf {} + 2>/dev/null || true
    find /opt/runner-cache -type d -name ".pnpm-store" -exec rm -rf {} + 2>/dev/null || true
    find /opt/runner-cache -type d -name ".pnpm-cache" -exec rm -rf {} + 2>/dev/null || true
    echo "  ✅ pnpm stores purged"
  fi
  
  # Purge ALL NX caches (with TTL in emergency, complete purge in aggressive)
  if [[ "$EMERGENCY_MODE" == "true" ]]; then
    echo "  🗑️  EMERGENCY: Purging ALL NX caches completely..."
    # Emergency mode - remove everything
    if [[ -d "/opt/runner-cache/.nx/cache" ]]; then
      rm -rf /opt/runner-cache/.nx/cache/* 2>/dev/null || true
    fi
    if [[ -d "${HOME}/.nx/cache" ]]; then
      rm -rf "${HOME}/.nx/cache"/* 2>/dev/null || true
    fi
    echo "  ✅ ALL NX caches purged"
  else
    echo "  🗑️  Cleaning NX caches (TTL: 30 days)..."
    # Aggressive mode - use TTL
    if [[ -d "/opt/runner-cache/.nx/cache" ]]; then
      DELETED_COUNT=$(find /opt/runner-cache/.nx/cache -type f -mtime +30 -delete -print 2>/dev/null | wc -l)
      echo "  ✅ Deleted ${DELETED_COUNT} NX cache files older than 30 days"
    fi
    if [[ -d "${HOME}/.nx/cache" ]]; then
      find "${HOME}/.nx/cache" -type f -mtime +30 -delete 2>/dev/null || true
    fi
    
    # Check NX cache size and enforce 20GB limit
    if [[ -d "/opt/runner-cache/.nx/cache" ]]; then
      CACHE_SIZE=$(du -sb /opt/runner-cache/.nx/cache 2>/dev/null | cut -f1)
      MAX_SIZE=$((20 * 1024 * 1024 * 1024))  # 20 GB in bytes
      
      if [[ $CACHE_SIZE -gt $MAX_SIZE ]]; then
        echo "  ⚠️  NX cache exceeds 20 GB ($(numfmt --to=iec "$CACHE_SIZE")), purging oldest files..."
        # Remove oldest files until we're under the limit
        find /opt/runner-cache/.nx/cache -type f -printf '%T+ %p\n' 2>/dev/null | \
          sort | \
          head -n 1000 | \
          cut -d' ' -f2- | \
          xargs -r rm -f 2>/dev/null || true
        
        NEW_SIZE=$(du -sb /opt/runner-cache/.nx/cache 2>/dev/null | cut -f1)
        echo "  ✅ NX cache reduced from $(numfmt --to=iec "$CACHE_SIZE") to $(numfmt --to=iec "$NEW_SIZE")"
      else
        echo "  ✅ NX cache size healthy ($(numfmt --to=iec "$CACHE_SIZE") / 20 GB limit)"
      fi
    fi
  fi
  
  # Remove ALL Docker images in emergency mode (not just unused)
  if [[ "$EMERGENCY_MODE" == "true" ]] && command -v docker &> /dev/null; then
    echo "  🗑️  EMERGENCY: Removing ALL Docker images..."
    # shellcheck disable=SC2046
    docker rmi $(docker images -q) -f 2>/dev/null || true
    docker system prune -af --volumes 2>/dev/null || true
    echo "  ✅ Docker images removed"
  fi
  
  # Clean package manager caches
  echo "  🗑️  Cleaning package manager caches..."
  rm -rf /root/.npm /root/.pnpm-store /root/.cache 2>/dev/null || true
  rm -rf "$HOME/.npm" "$HOME/.pnpm-store" "$HOME/.cache" 2>/dev/null || true
  
  # Clean apt cache in emergency mode
  if [[ "$EMERGENCY_MODE" == "true" ]]; then
    echo "  🗑️  Cleaning apt cache..."
    apt-get clean 2>/dev/null || sudo apt-get clean 2>/dev/null || true
  fi
  
  echo "  ✅ Package manager caches cleaned"
  
  # Remove old evidence files (>30 days)
  echo "  🗑️  Removing old evidence files (>30 days)..."
  EVIDENCE_PATTERNS=(
    "/opt/actions-runner-*/work/Ectropy/Ectropy/evidence"
    "${WORKSPACE_DIR}/evidence"
  )
  for pattern in "${EVIDENCE_PATTERNS[@]}"; do
    if compgen -G "$pattern" > /dev/null 2>&1; then
      find "$pattern" -type f -mtime +30 -delete 2>/dev/null || true
    fi
  done
  echo "  ✅ Old evidence files removed"
  
  # Clean temp directories
  echo "  🗑️  Cleaning temporary directories..."
  rm -rf /tmp/* 2>/dev/null || true
  echo "  ✅ Temporary directories cleaned"
  
  # Clean system logs in emergency mode
  if [[ "$EMERGENCY_MODE" == "true" ]]; then
    echo "  🗑️  Cleaning system logs (journal)..."
    journalctl --vacuum-time=7d 2>/dev/null || sudo journalctl --vacuum-time=7d 2>/dev/null || true
    journalctl --vacuum-size=500M 2>/dev/null || sudo journalctl --vacuum-size=500M 2>/dev/null || true
    echo "  ✅ System logs cleaned"
  fi
  
  echo ""
  if [[ "$EMERGENCY_MODE" == "true" ]]; then
    echo "✅ Emergency cleanup complete"
  else
    echo "✅ Aggressive cleanup complete"
  fi
fi

# 6. Report final disk usage
echo ""
echo "📊 Final Disk Usage:"
df -h / | tail -n 1

# 7. Check if disk usage is still high
DISK_USAGE=$(df / | tail -n 1 | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h / | tail -n 1 | awk '{print $4}')

if [[ $DISK_USAGE -ge 85 ]]; then
  echo ""
  if [[ "$EMERGENCY_MODE" == "true" ]]; then
    echo "❌ CRITICAL: Disk usage still at ${DISK_USAGE}% after emergency cleanup"
    echo "💡 Immediate manual intervention required - disk capacity exhausted"
    echo "   Recommended actions:"
    echo "   1. Check for large files: find / -type f -size +1G 2>/dev/null"
    echo "   2. Review runner work directories: du -h /opt/actions-runner-* --max-depth=2"
    echo "   3. Check for log file growth: du -sh /var/log/*"
    echo "   4. Consider capacity expansion or moving to larger runner"
    echo ""
    echo "❌ Emergency cleanup failed - critical intervention required"
    exit 1
  else
    echo "❌ CRITICAL: Disk usage still at ${DISK_USAGE}% after cleanup"
    echo "💡 Immediate action required:"
    echo "   Run emergency cleanup: bash scripts/cleanup-runner.sh --emergency"
    exit 1
  fi
elif [[ $DISK_USAGE -ge 75 ]]; then
  echo ""
  if [[ "$AGGRESSIVE_MODE" == "true" ]]; then
    echo "⚠️  WARNING: Disk usage still at ${DISK_USAGE}% after aggressive cleanup"
    echo "💡 Recommended action:"
    echo "   Run emergency cleanup: bash scripts/cleanup-runner.sh --emergency"
    exit 1
  else
    echo "❌ CRITICAL: Disk usage at ${DISK_USAGE}% after cleanup"
    echo "💡 Recommended action:"
    echo "   Run aggressive cleanup: bash scripts/cleanup-runner.sh --aggressive"
    exit 1
  fi
elif [[ $DISK_USAGE -ge 65 ]]; then
  echo ""
  echo "⚠️  WARNING: Disk usage at ${DISK_USAGE}% after cleanup (${DISK_AVAIL} available)"
  if [[ "$AGGRESSIVE_MODE" != "true" ]]; then
    echo "💡 Consider running aggressive cleanup if needed"
  fi
elif [[ $DISK_USAGE -ge 60 ]]; then
  echo ""
  echo "ℹ️  Disk usage at ${DISK_USAGE}% (${DISK_AVAIL} available) - monitoring recommended"
else
  echo ""
  echo "✅ Disk usage healthy at ${DISK_USAGE}% (${DISK_AVAIL} available)"
fi

echo ""
if [[ "$EMERGENCY_MODE" == "true" ]]; then
  echo "✅ Enhanced runner cleanup complete (EMERGENCY MODE)"
elif [[ "$AGGRESSIVE_MODE" == "true" ]]; then
  echo "✅ Enhanced runner cleanup complete (AGGRESSIVE MODE)"
else
  echo "✅ Enhanced runner cleanup complete"
fi
