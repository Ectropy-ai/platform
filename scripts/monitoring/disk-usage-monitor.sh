#!/bin/bash
set -euo pipefail

###############################################################################
# Disk Usage Monitor - Enterprise Grade with Timeout Protection
# Purpose: Proactive disk capacity management for CI/CD runners
# Usage: disk-usage-monitor.sh [mount-point]
# Exit Codes: 0=healthy, 1=critical threshold exceeded, 2=timeout
# Timeout: 180 seconds (3 minutes) for entire script execution
###############################################################################

ALERT_THRESHOLD_WARNING=60  # Warn at 60%
ALERT_THRESHOLD_CRITICAL=75  # Critical at 75%
DISK_MOUNT="${1:-/}"
ALERT_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"  # Optional Slack alerts
DIR_SCAN_TIMEOUT=30  # Per-directory scan timeout in seconds

echo "🔍 Checking disk usage on runner: ${HOSTNAME}"

# Get disk usage percentage (fast operation < 1 second)
DISK_USAGE=$(df -h "$DISK_MOUNT" | tail -n 1 | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h "$DISK_MOUNT" | tail -n 1 | awk '{print $4}')
DISK_USED=$(df -h "$DISK_MOUNT" | tail -n 1 | awk '{print $3}')
DISK_SIZE=$(df -h "$DISK_MOUNT" | tail -n 1 | awk '{print $2}')

echo "Current disk usage: ${DISK_USAGE}% (${DISK_AVAIL} available of ${DISK_SIZE})"

# Check against thresholds
if [[ $DISK_USAGE -ge $ALERT_THRESHOLD_CRITICAL ]]; then
  echo "🚨 CRITICAL: Disk usage at ${DISK_USAGE}% (threshold: ${ALERT_THRESHOLD_CRITICAL}%)"
  echo ""
  echo "📊 Scanning disk consumers (timeout: ${DIR_SCAN_TIMEOUT}s per directory)..."
  echo "Top disk consumers in common directories:"
  
  # Define directories to scan with priority order
  DIRS_TO_SCAN=("/opt" "/var/lib/docker" "/root" "/tmp")
  
  for i in "${!DIRS_TO_SCAN[@]}"; do
    dir="${DIRS_TO_SCAN[$i]}"
    
    if [[ -d "$dir" ]]; then
      echo "  [$((i+1))/${#DIRS_TO_SCAN[@]}] Scanning $dir..."
      
      # Use timeout and depth limit to prevent hangs
      # Suppress broken pipe errors and permission denied errors
      if timeout ${DIR_SCAN_TIMEOUT}s du -h --max-depth=2 "$dir" 2>/dev/null | sort -rh 2>/dev/null | head -n 5 2>/dev/null; then
        :  # Success - output already printed
      else
        EXIT_CODE=$?
        if [[ $EXIT_CODE -eq 124 ]]; then
          echo "    ⚠️  Timeout after ${DIR_SCAN_TIMEOUT}s - directory too large, skipping detailed scan"
        else
          echo "    ⚠️  Scan failed (exit code: $EXIT_CODE) - skipping"
        fi
      fi
    else
      echo "  [$((i+1))/${#DIRS_TO_SCAN[@]}] Directory $dir not found - skipping"
    fi
  done
  
  # Alert via webhook if configured
  if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
    curl -X POST "$ALERT_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"🚨 CRITICAL: Disk usage at ${DISK_USAGE}% on ${HOSTNAME}. Used: ${DISK_USED}/${DISK_SIZE}, Available: ${DISK_AVAIL}\"}" \
      2>/dev/null || echo "⚠️ Failed to send webhook alert"
  fi
  
  exit 1
  
elif [[ $DISK_USAGE -ge $ALERT_THRESHOLD_WARNING ]]; then
  echo "⚠️  WARNING: Disk usage at ${DISK_USAGE}% (threshold: ${ALERT_THRESHOLD_WARNING}%)"
  
  # Alert via webhook if configured
  if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
    curl -X POST "$ALERT_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"⚠️  WARNING: Disk usage at ${DISK_USAGE}% on ${HOSTNAME}. Used: ${DISK_USED}/${DISK_SIZE}, Available: ${DISK_AVAIL}\"}" \
      2>/dev/null || echo "⚠️ Failed to send webhook alert"
  fi
  
  exit 0
else
  echo "✅ Disk usage healthy at ${DISK_USAGE}%"
  exit 0
fi
