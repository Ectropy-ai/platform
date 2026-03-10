#!/bin/bash
set -euo pipefail

# Comprehensive Runner Health Check
# Purpose: Proactive monitoring of self-hosted runner infrastructure
# Validates: APT health, system resources, Docker, GitHub Actions runner
# Frequency: Run every 3 hours via cron (GitHub Actions workflow)
# Location: /opt/scripts/check-apt-health.sh on runner
# Cron: 0 */3 * * * /opt/scripts/check-apt-health.sh >> /var/log/apt-health.log 2>&1

HEALTH_STATUS=0
ISSUES=()

echo "🏥 Comprehensive Runner Health Check - $(date)"
echo "================================================"

# 1. APT Package Manager Health
check_apt_health() {
  echo "📦 Checking APT package manager..."
  
  # Check if unattended-upgrades is masked (CRITICAL)
  if systemctl is-enabled unattended-upgrades 2>&1 | grep -q "masked"; then
    echo "✅ unattended-upgrades: MASKED (permanent)"
  else
    echo "❌ CRITICAL: unattended-upgrades NOT MASKED"
    echo "   This will cause APT lock conflicts in E2E tests"
    ISSUES+=("unattended-upgrades service not masked - CRITICAL")
    HEALTH_STATUS=2
    
    # Attempt to fix automatically
    echo "   Attempting automatic fix..."
    sudo systemctl stop unattended-upgrades 2>/dev/null || true
    sudo systemctl mask unattended-upgrades 2>/dev/null || true
    
    # Verify fix
    if systemctl is-enabled unattended-upgrades 2>&1 | grep -q "masked"; then
      echo "   ✅ Automatically fixed"
      HEALTH_STATUS=1  # Warning (was fixed)
    fi
  fi
  
  # Check for running APT processes
  local apt_procs=$(pgrep -af "apt-get|dpkg|unattended" || true)
  if [ -n "$apt_procs" ]; then
    echo "⚠️  WARNING: Active APT processes detected:"
    echo "$apt_procs" | sed 's/^/   /'
    ISSUES+=("APT processes running - may indicate lock conflicts")
    HEALTH_STATUS=1
  else
    echo "✅ No APT processes running"
  fi
  
  # Check APT lock files
  local locks_found=0
  for lock_file in /var/lib/apt/lists/lock /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend; do
    if fuser "$lock_file" 2>/dev/null; then
      echo "❌ Lock file in use: $lock_file"
      fuser "$lock_file" 2>&1 | sed 's/^/   /'
      locks_found=1
    fi
  done
  
  if [ $locks_found -eq 0 ]; then
    echo "✅ No APT lock files in use"
  else
    ISSUES+=("APT lock files detected - potential conflict risk")
    HEALTH_STATUS=1
  fi
  
  # Test APT availability
  if timeout 10 sudo apt-get update -qq 2>/dev/null; then
    echo "✅ APT available and operational"
  else
    echo "❌ CRITICAL: APT not available or timeout"
    echo "   This will block E2E test browser installations"
    ISSUES+=("APT unavailable - CRITICAL")
    HEALTH_STATUS=2
  fi
}

# 2. System Resources
check_resources() {
  echo ""
  echo "💾 Checking system resources..."
  
  # Disk space
  local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
  if [ "$disk_usage" -gt 85 ]; then
    echo "⚠️  WARNING: Disk usage at ${disk_usage}% (threshold: 85%)"
    ISSUES+=("High disk usage: ${disk_usage}% - cleanup recommended")
    HEALTH_STATUS=1
    
    # Show largest directories
    echo "   Largest directories:"
    du -h / 2>/dev/null | sort -rh | head -5 | sed 's/^/   /'
  else
    echo "✅ Disk: ${disk_usage}% usage (healthy)"
  fi
  
  # Memory
  local mem_total=$(free -m | awk 'NR==2 {print $2}')
  local mem_used=$(free -m | awk 'NR==2 {print $3}')
  local mem_usage=$(awk "BEGIN {printf \"%.0f\", ($mem_used/$mem_total)*100}")
  
  if [ "$mem_usage" -gt 90 ]; then
    echo "⚠️  WARNING: Memory usage at ${mem_usage}% (threshold: 90%)"
    echo "   Used: ${mem_used}MB / ${mem_total}MB"
    ISSUES+=("High memory usage: ${mem_usage}% - investigate running processes")
    HEALTH_STATUS=1
    
    # Show top memory consumers
    echo "   Top memory consumers:"
    ps aux --sort=-%mem | head -6 | tail -5 | awk '{printf "   %s %s%%\n", $11, $4}'
  else
    echo "✅ Memory: ${mem_usage}% usage (${mem_used}MB / ${mem_total}MB)"
  fi
  
  # Check inode usage
  local inode_usage=$(df -i / | awk 'NR==2 {print $5}' | sed 's/%//')
  if [ "$inode_usage" -gt 80 ]; then
    echo "⚠️  WARNING: Inode usage at ${inode_usage}% (threshold: 80%)"
    ISSUES+=("High inode usage: ${inode_usage}% - too many small files")
    HEALTH_STATUS=1
  else
    echo "✅ Inodes: ${inode_usage}% usage (healthy)"
  fi
}

# 3. Docker Health
check_docker() {
  echo ""
  echo "🐳 Checking Docker health..."
  
  if ! systemctl is-active docker >/dev/null 2>&1; then
    echo "❌ ERROR: Docker service not running"
    ISSUES+=("Docker service down - CRITICAL")
    HEALTH_STATUS=2
    
    # Attempt to start
    echo "   Attempting to start Docker..."
    sudo systemctl start docker || true
    sleep 2
    
    if systemctl is-active docker >/dev/null 2>&1; then
      echo "   ✅ Docker started successfully"
      HEALTH_STATUS=1
    fi
  else
    echo "✅ Docker: Service active"
    
    # Check for zombie containers
    if command -v docker >/dev/null 2>&1; then
      local zombie_count=$(docker ps -a -f status=dead -f status=exited --format '{{.ID}}' 2>/dev/null | wc -l)
      if [ "$zombie_count" -gt 10 ]; then
        echo "⚠️  WARNING: $zombie_count stopped containers (cleanup recommended)"
        ISSUES+=("High stopped container count: $zombie_count - run 'docker system prune'")
        HEALTH_STATUS=1
      else
        echo "✅ Stopped containers: $zombie_count (normal)"
      fi
      
      # Check Docker disk usage
      local docker_disk=$(docker system df 2>/dev/null | tail -1 | awk '{print $3}')
      if [ -n "$docker_disk" ]; then
        echo "✅ Docker disk usage: $docker_disk"
      fi
    fi
  fi
}

# 4. GitHub Actions Runner
check_runner() {
  echo ""
  echo "🏃 Checking GitHub Actions runner..."
  
  # Check if runner service is active
  if systemctl is-active actions.runner.*.service >/dev/null 2>&1; then
    echo "✅ Runner: Service active"
    
    # Check runner logs for errors (last 10 lines)
    local runner_service=$(systemctl list-units "actions.runner.*.service" --no-legend | awk '{print $1}' | head -1)
    if [ -n "$runner_service" ]; then
      local error_count=$(journalctl -u "$runner_service" -n 50 --no-pager 2>/dev/null | grep -ci "error" || echo 0)
      if [ "$error_count" -gt 5 ]; then
        echo "⚠️  WARNING: $error_count errors in recent runner logs"
        ISSUES+=("Runner errors detected - review logs")
        HEALTH_STATUS=1
      fi
    fi
  else
    echo "❌ ERROR: GitHub Actions runner service not running"
    ISSUES+=("Runner service down - CRITICAL")
    HEALTH_STATUS=2
  fi
}

# 5. Network Connectivity
check_network() {
  echo ""
  echo "🌐 Checking network connectivity..."
  
  # Check GitHub API connectivity
  if curl -s --max-time 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "✅ GitHub API: Reachable"
  else
    echo "⚠️  WARNING: GitHub API unreachable"
    ISSUES+=("GitHub API connectivity issue")
    HEALTH_STATUS=1
  fi
  
  # Check DNS resolution
  if nslookup github.com >/dev/null 2>&1; then
    echo "✅ DNS: Working"
  else
    echo "⚠️  WARNING: DNS resolution issues"
    ISSUES+=("DNS resolution failures")
    HEALTH_STATUS=1
  fi
}

# Run all checks
check_apt_health
check_resources
check_docker
check_runner
check_network

# Summary
echo ""
echo "================================================"

if [ $HEALTH_STATUS -eq 0 ]; then
  echo "✅ HEALTH CHECK PASSED - All systems operational"
  echo ""
  echo "Summary:"
  echo "- APT: Operational"
  echo "- Resources: Within limits"
  echo "- Docker: Healthy"
  echo "- Runner: Active"
  echo "- Network: Connected"
  exit 0
elif [ $HEALTH_STATUS -eq 1 ]; then
  echo "⚠️  HEALTH CHECK WARNING - Issues detected (non-critical):"
  printf '%s\n' "${ISSUES[@]}" | sed 's/^/- /'
  echo ""
  echo "🔧 Recommended Actions:"
  echo "1. Review warnings listed above"
  echo "2. Schedule maintenance if needed"
  echo "3. Monitor for recurring issues"
  exit 0  # Warning, but not critical
else
  echo "❌ HEALTH CHECK FAILED - Critical issues detected:"
  printf '%s\n' "${ISSUES[@]}" | sed 's/^/- /'
  echo ""
  echo "🔧 Immediate Actions Required:"
  echo "1. Review critical issues listed above"
  echo "2. Run manual remediation if needed:"
  echo "   - APT: sudo systemctl mask unattended-upgrades"
  echo "   - Docker: sudo systemctl start docker"
  echo "   - Runner: sudo systemctl start actions.runner.*.service"
  echo "3. Re-run health check to verify fixes"
  exit 1
fi
