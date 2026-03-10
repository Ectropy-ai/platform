#!/bin/bash
set -euo pipefail

###############################################################################
# Disk Usage Report
# Purpose: Generate comprehensive disk usage report for monitoring and capacity planning
# Usage: disk-usage-report.sh
# Timeout: Individual operations have 60s timeouts to prevent hangs
###############################################################################

echo "📊 Ectropy Runner Disk Usage Report"
echo "Generated: $(date)"
echo "Runner: ${HOSTNAME}"
echo ""

# Overall disk usage
echo "=== Overall Disk Usage ==="
df -h / | tail -n 1
echo ""

# Calculate percentage breakdown
DISK_USAGE=$(df / | tail -n 1 | awk '{print $5}' | sed 's/%//')
echo "Status: "
if [[ $DISK_USAGE -ge 75 ]]; then
  echo "🚨 CRITICAL (${DISK_USAGE}% used)"
elif [[ $DISK_USAGE -ge 60 ]]; then
  echo "⚠️  WARNING (${DISK_USAGE}% used)"
else
  echo "✅ HEALTHY (${DISK_USAGE}% used)"
fi
echo ""

# Top 20 disk consumers in runner work directories
echo "=== Top 20 Disk Consumers in Runner Work Directories ==="
if compgen -G "/opt/actions-runner*" > /dev/null 2>&1; then
  timeout 60s du -h --max-depth=3 /opt/actions-runner* 2>/dev/null | sort -rh 2>/dev/null | head -n 20 || echo "Unable to scan runner directories (timeout or error)"
else
  echo "No runner work directories found"
fi
echo ""

# Docker disk usage
echo "=== Docker Disk Usage ==="
if command -v docker &> /dev/null; then
  docker system df -v 2>/dev/null || echo "Unable to get Docker disk usage"
else
  echo "Docker not available"
fi
echo ""

# pnpm cache sizes
echo "=== pnpm Cache Sizes ==="
if [ -d "/opt/runner-cache" ]; then
  echo "Runner-specific caches:"
  timeout 30s du -sh /opt/runner-cache/*/pnpm-store 2>/dev/null || echo "No pnpm caches found or timeout"
  echo ""
  echo "Total runner cache size:"
  timeout 30s du -sh /opt/runner-cache 2>/dev/null || echo "Unable to calculate or timeout"
else
  echo "No runner cache directory found"
fi
echo ""

# Evidence files
echo "=== Evidence Files ==="
if compgen -G "/opt/actions-runner*/_work/Ectropy/Ectropy/evidence" > /dev/null 2>&1 && \
   timeout 10s find /opt/actions-runner*/_work/Ectropy/Ectropy/evidence -type f 2>/dev/null | head -n 1 > /dev/null; then
  RECENT_COUNT=$(timeout 30s find /opt/actions-runner*/_work/Ectropy/Ectropy/evidence -type f -mtime -30 2>/dev/null | wc -l || echo "0")
  OLD_COUNT=$(timeout 30s find /opt/actions-runner*/_work/Ectropy/Ectropy/evidence -type f -mtime +30 2>/dev/null | wc -l || echo "0")
  TOTAL_SIZE=$(timeout 30s du -sh /opt/actions-runner*/_work/Ectropy/Ectropy/evidence 2>/dev/null | cut -f1 || echo "unknown")
  
  echo "Recent evidence files (last 30 days): ${RECENT_COUNT}"
  echo "Old evidence files (>30 days): ${OLD_COUNT}"
  echo "Total evidence size: ${TOTAL_SIZE}"
  
  if [[ "$OLD_COUNT" != "0" ]] && [[ $OLD_COUNT -gt 0 ]]; then
    echo ""
    echo "Oldest evidence files (cleanup candidates):"
    timeout 30s find /opt/actions-runner*/_work/Ectropy/Ectropy/evidence -type f -printf '%T@ %p\n' 2>/dev/null | \
      sort -n | head -n 5 | while read -r timestamp file; do
        date -d @"${timestamp%%.*}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "Unknown date"
        echo "  $file"
      done || echo "Unable to list oldest files"
  fi
else
  echo "No evidence files found"
fi
echo ""

# GitHub Actions cache
echo "=== GitHub Actions Cache ==="
if [ -d "$HOME/.cache/actions" ]; then
  du -sh "$HOME/.cache/actions" 2>/dev/null || echo "Unable to calculate"
else
  echo "No GitHub Actions cache found"
fi
echo ""

# NX cache
echo "=== NX Cache ==="
if compgen -G "/opt/actions-runner*/_work/Ectropy/Ectropy/.nx/cache" > /dev/null 2>&1; then
  timeout 30s du -sh /opt/actions-runner*/_work/Ectropy/Ectropy/.nx/cache 2>/dev/null || echo "Unable to calculate or timeout"
else
  echo "No NX cache found"
fi
echo ""

# Recommendations
echo "=== Recommendations ==="
if [[ $DISK_USAGE -ge 75 ]]; then
  echo "🚨 URGENT: Disk usage is critical. Immediate cleanup required."
  echo "   1. Run: bash scripts/cleanup-runner.sh"
  echo "   2. Clean Docker: docker system prune -af"
  echo "   3. Archive/delete old evidence files"
elif [[ $DISK_USAGE -ge 60 ]]; then
  echo "⚠️  CAUTION: Disk usage approaching capacity. Proactive cleanup recommended."
  echo "   1. Run scheduled cleanup: bash scripts/cleanup-runner.sh"
  echo "   2. Prune Docker images: docker image prune -a"
  echo "   3. Review and archive evidence files >30 days old"
else
  echo "✅ Disk usage is healthy. Continue monitoring."
  echo "   - Next scheduled cleanup: Weekly (Sunday 2 AM)"
  echo "   - Monitor trends for capacity planning"
fi
echo ""
echo "=== End of Report ==="
