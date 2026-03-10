#!/bin/bash
# Track 90-day disk usage trends for capacity planning
# Integrated with weekly maintenance cron job

set -e

LOG_FILE="/var/log/disk-capacity-trends.log"
USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
FREE_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
TOTAL_GB=$(df -BG / | awk 'NR==2 {print $2}' | sed 's/G//')

# Create log file if doesn't exist
touch "$LOG_FILE" 2>/dev/null || LOG_FILE="/tmp/disk-capacity-trends.log"

# Append current usage to log (CSV format)
echo "$(date +%Y-%m-%d),$USAGE,$FREE_GB,$TOTAL_GB" >> "$LOG_FILE"

# Keep only last 90 days
tail -n 90 "$LOG_FILE" > "${LOG_FILE}.tmp"
mv "${LOG_FILE}.tmp" "$LOG_FILE"

echo ""
echo "════════════════════════════════════════════════"
echo "📊 Disk Capacity Trends Analysis"
echo "════════════════════════════════════════════════"
echo "Current Usage: ${USAGE}%"
echo "Free Space: ${FREE_GB}GB / ${TOTAL_GB}GB"
echo "Data Points: $(wc -l < "$LOG_FILE") days"
echo ""

# Calculate growth rate if enough data (7+ days)
if [ $(wc -l < "$LOG_FILE") -ge 7 ]; then
  WEEK_AGO=$(tail -n 7 "$LOG_FILE" | head -n 1 | cut -d',' -f2)
  GROWTH_RATE=$(echo "scale=2; ($USAGE - $WEEK_AGO) / 7" | bc 2>/dev/null || echo "0")
  
  echo "📈 Weekly Growth Rate: ${GROWTH_RATE}%/day"
  
  # Project to 90% capacity
  if [ "$GROWTH_RATE" != "0" ] && [ $(echo "$GROWTH_RATE > 0" | bc) -eq 1 ]; then
    DAYS_TO_90=$(echo "scale=0; (90 - $USAGE) / $GROWTH_RATE" | bc 2>/dev/null || echo "N/A")
    echo "⏱️  Days to 90% capacity: ${DAYS_TO_90} days"
    
    # Alert if projected to reach 90% within 30 days
    if [ "$DAYS_TO_90" != "N/A" ] && [ "$DAYS_TO_90" -lt 30 ] 2>/dev/null; then
      echo ""
      echo "⚠️  WARNING: Projected to reach 90% capacity in ${DAYS_TO_90} days!"
      echo "   Recommendation: Review capacity upgrade options"
    fi
  else
    echo "📉 Disk usage stable or decreasing (growth rate: ${GROWTH_RATE}%/day)"
  fi
  
  # Calculate 30-day trend if available
  if [ $(wc -l < "$LOG_FILE") -ge 30 ]; then
    MONTH_AGO=$(tail -n 30 "$LOG_FILE" | head -n 1 | cut -d',' -f2)
    MONTHLY_GROWTH=$(echo "scale=2; $USAGE - $MONTH_AGO" | bc 2>/dev/null || echo "0")
    echo "📅 30-Day Growth: ${MONTHLY_GROWTH}% total"
  fi
  
  # Calculate 90-day trend if available
  if [ $(wc -l < "$LOG_FILE") -ge 90 ]; then
    QUARTER_AGO=$(tail -n 90 "$LOG_FILE" | head -n 1 | cut -d',' -f2)
    QUARTERLY_GROWTH=$(echo "scale=2; $USAGE - $QUARTER_AGO" | bc 2>/dev/null || echo "0")
    echo "📆 90-Day Growth: ${QUARTERLY_GROWTH}% total"
  fi
else
  echo "ℹ️  Need 7+ days of data for growth rate analysis"
  echo "   Current data points: $(wc -l < "$LOG_FILE") days"
fi

echo "════════════════════════════════════════════════"
echo ""

exit 0
