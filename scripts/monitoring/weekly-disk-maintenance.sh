#!/bin/bash
# Weekly disk maintenance for self-hosted runner
# Runs every Sunday at 2 AM UTC
# Admin installs via: (crontab -l 2>/dev/null; echo "0 2 * * 0 /opt/scripts/weekly-disk-maintenance.sh") | crontab -

LOG_FILE="/var/log/runner-maintenance.log"

echo "" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════" >> "$LOG_FILE"
echo "[$(date)] Starting weekly disk maintenance..." >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════" >> "$LOG_FILE"

# Record initial state
INITIAL_USAGE=$(df -h / | awk 'NR==2 {print $5}')
INITIAL_FREE=$(df -BG / | awk 'NR==2 {print $4}')
echo "[$(date)] Initial state: ${INITIAL_USAGE} used (${INITIAL_FREE} free)" >> "$LOG_FILE"

# Determine repo path
REPO_PATH="/root/actions-runner/_work/ectropy/ectropy"
if [ ! -d "$REPO_PATH" ]; then
  REPO_PATH="/opt/ectropy"
fi
if [ ! -d "$REPO_PATH" ]; then
  REPO_PATH="$HOME/ectropy"
fi

# Run normal cleanup
if [ -d "$REPO_PATH" ]; then
  echo "[$(date)] Executing normal cleanup mode from: $REPO_PATH" >> "$LOG_FILE"
  cd "$REPO_PATH" || cd ~ 
  bash scripts/cleanup/runner-cleanup-progressive.sh warning >> "$LOG_FILE" 2>&1
else
  echo "[$(date)] Repository not found, skipping cleanup" >> "$LOG_FILE"
fi

# Record final state
FINAL_USAGE=$(df -h / | awk 'NR==2 {print $5}')
FINAL_FREE=$(df -BG / | awk 'NR==2 {print $4}')
echo "[$(date)] Final state: ${FINAL_USAGE} used (${FINAL_FREE} free)" >> "$LOG_FILE"

# Run capacity trends analysis
echo "[$(date)] Updating capacity trends..." >> "$LOG_FILE"
if [ -d "$REPO_PATH" ]; then
  bash scripts/monitoring/disk-capacity-trends.sh >> "$LOG_FILE" 2>&1
else
  echo "[$(date)] Repository not found, skipping trends analysis" >> "$LOG_FILE"
fi

echo "[$(date)] Weekly maintenance complete ✅" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════" >> "$LOG_FILE"
