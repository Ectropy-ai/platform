#!/bin/bash
set -euo pipefail

###############################################################################
# Disk Usage Trend Tracking
# Purpose: Track disk usage trends for capacity planning
# Usage: track-disk-trends.sh [mount-point]
# Output: CSV log with 90-day retention at /var/log/ectropy-disk-trends.log
###############################################################################

DISK_MOUNT="${1:-/}"
TRENDS_FILE="/var/log/ectropy-disk-trends.log"

# Ensure log directory exists and is writable
if [[ ! -w "/var/log" ]]; then
  echo "⚠️  WARNING: Cannot write to /var/log, using /tmp"
  TRENDS_FILE="/tmp/ectropy-disk-trends.log"
fi

# Get current disk usage metrics
TIMESTAMP=$(date -Iseconds)
USAGE=$(df "$DISK_MOUNT" | tail -1 | awk '{print $5}' | sed 's/%//')
USED_GB=$(df -BG "$DISK_MOUNT" | tail -1 | awk '{print $3}' | sed 's/G//')
AVAIL_GB=$(df -BG "$DISK_MOUNT" | tail -1 | awk '{print $4}' | sed 's/G//')
TOTAL_GB=$(df -BG "$DISK_MOUNT" | tail -1 | awk '{print $2}' | sed 's/G//')

# Create trends file with header if it doesn't exist
if [[ ! -f "$TRENDS_FILE" ]]; then
  echo "timestamp,usage_percent,used_gb,available_gb,total_gb" > "$TRENDS_FILE"
  echo "📝 Created new trends log: $TRENDS_FILE"
fi

# Append current metrics to trends log (CSV format)
echo "${TIMESTAMP},${USAGE},${USED_GB},${AVAIL_GB},${TOTAL_GB}" >> "$TRENDS_FILE"

# Keep only last 90 days (assuming 4 samples per day = 360 lines + header)
LINE_COUNT=$(wc -l < "$TRENDS_FILE")
if [[ $LINE_COUNT -gt 361 ]]; then
  # Keep header + last 360 data lines
  {
    head -n 1 "$TRENDS_FILE"
    tail -n 360 "$TRENDS_FILE"
  } > "${TRENDS_FILE}.tmp" && mv "${TRENDS_FILE}.tmp" "$TRENDS_FILE"
  echo "🗑️  Trimmed trends log to 90 days (360 entries)"
fi

echo "📊 Current disk usage: ${USAGE}% (${USED_GB}GB used / ${TOTAL_GB}GB total, ${AVAIL_GB}GB available)"

# Calculate weekly growth rate (if enough data - 28 samples for 7 days at 4/day)
if [[ $(wc -l < "$TRENDS_FILE") -ge 29 ]]; then
  # Get usage from 7 days ago (skip header, get 28th line from end)
  USAGE_7D_AGO=$(tail -n 28 "$TRENDS_FILE" | head -n 1 | cut -d',' -f2)
  
  if [[ -n "$USAGE_7D_AGO" ]] && [[ "$USAGE_7D_AGO" =~ ^[0-9]+$ ]]; then
    GROWTH_RATE=$((USAGE - USAGE_7D_AGO))
    
    echo ""
    echo "📈 Disk Usage Trend (7-day):"
    echo "   Current usage: ${USAGE}%"
    echo "   7 days ago: ${USAGE_7D_AGO}%"
    echo "   Weekly growth: ${GROWTH_RATE}%"
    
    # Project when 90% will be reached
    if [[ $GROWTH_RATE -gt 0 ]]; then
      CAPACITY_LEFT=$((90 - USAGE))
      WEEKS_TO_90=$((CAPACITY_LEFT / GROWTH_RATE))
      
      if [[ $WEEKS_TO_90 -le 0 ]]; then
        echo "   ⚠️  WARNING: Already at or above 90% capacity!"
      elif [[ $WEEKS_TO_90 -le 4 ]]; then
        echo "   ⚠️  CRITICAL: Projected to reach 90% in ${WEEKS_TO_90} weeks"
      elif [[ $WEEKS_TO_90 -le 8 ]]; then
        echo "   ⚠️  WARNING: Projected to reach 90% in ${WEEKS_TO_90} weeks"
      else
        echo "   ℹ️  Projected to reach 90% in ${WEEKS_TO_90} weeks"
      fi
    elif [[ $GROWTH_RATE -eq 0 ]]; then
      echo "   ℹ️  Usage stable (no growth)"
    else
      echo "   ✅ Usage decreasing (${GROWTH_RATE}% per week)"
    fi
  fi
else
  DAYS_DATA=$((($(wc -l < "$TRENDS_FILE") - 1) / 4))
  echo ""
  echo "ℹ️  Trend analysis requires 7 days of data (currently: ${DAYS_DATA} days)"
fi

echo ""
echo "✅ Trend data logged to: $TRENDS_FILE"
