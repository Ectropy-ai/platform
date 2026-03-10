#!/bin/bash
# E2E Test Success Rate Monitoring Script
# Date: November 2, 2025
# Purpose: Monitor E2E test workflow runs to validate the Nov 1 fix
# Expected: Success rate should improve from 24.1% to 95%+

set -e

# Configuration - can be overridden via environment variables
REPO="${REPO:-luhtech/Ectropy}"
WORKFLOW="${WORKFLOW:-e2e-tests.yml}"
BASELINE_RATE=24.1  # Pre-fix success rate (Oct 27-Nov 1, 2025)

# Success rate thresholds
TARGET_SUCCESS_RATE=95    # Target success rate (must achieve)
GOOD_PROGRESS_RATE=80     # Good progress threshold
MODERATE_PROGRESS_RATE=50 # Moderate progress threshold

echo "=================================================="
echo "E2E Test Success Rate Monitoring"
echo "Monitoring Period: Nov 2-7, 2025"
echo "Target Success Rate: ≥${TARGET_SUCCESS_RATE}%"
echo "=================================================="
echo ""

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed"
  echo "   Install: https://cli.github.com/"
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "❌ jq is not installed (required for JSON parsing)"
  echo "   Install:"
  echo "   - macOS: brew install jq"
  echo "   - Linux: sudo apt-get install jq"
  echo "   - Or see: https://stedolan.github.io/jq/"
  exit 1
fi

# Check if bc is available
if ! command -v bc &> /dev/null; then
  echo "❌ bc is not installed (required for calculations)"
  echo "   Install:"
  echo "   - macOS: brew install bc"
  echo "   - Linux: sudo apt-get install bc"
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub CLI"
  echo "   Run: gh auth login"
  exit 1
fi

# Runtime parameters
LIMIT="${1:-20}"  # Default to 20 runs, but allow override via first argument

echo "Fetching last $LIMIT E2E test workflow runs..."
echo ""

# Fetch workflow runs
RUNS=$(gh run list \
  --repo "$REPO" \
  --workflow "$WORKFLOW" \
  --limit "$LIMIT" \
  --json databaseId,status,conclusion,createdAt,event,headBranch \
  2>/dev/null || echo "[]")

if [ "$RUNS" = "[]" ] || [ -z "$RUNS" ]; then
  echo "⚠️  No workflow runs found"
  echo "   This might indicate:"
  echo "   1. Workflow hasn't run yet since the fix"
  echo "   2. Authentication issue with gh CLI"
  echo "   3. Workflow name incorrect"
  exit 1
fi

# Parse results using jq
TOTAL=$(echo "$RUNS" | jq 'length')
SUCCESS=$(echo "$RUNS" | jq '[.[] | select(.conclusion == "success")] | length')
FAILURE=$(echo "$RUNS" | jq '[.[] | select(.conclusion == "failure")] | length')
CANCELLED=$(echo "$RUNS" | jq '[.[] | select(.conclusion == "cancelled")] | length')
IN_PROGRESS=$(echo "$RUNS" | jq '[.[] | select(.status == "in_progress" or .status == "queued")] | length')
OTHER=$(echo "$RUNS" | jq '[.[] | select(.conclusion != "success" and .conclusion != "failure" and .conclusion != "cancelled" and .status != "in_progress" and .status != "queued")] | length')

echo "=== Workflow Run Statistics ==="
echo "Total Runs: $TOTAL"
echo "✅ Successful: $SUCCESS"
echo "❌ Failed: $FAILURE"
echo "🚫 Cancelled: $CANCELLED"
echo "⏳ In Progress: $IN_PROGRESS"
echo "❓ Other: $OTHER"
echo ""

# Calculate success rate (excluding in-progress and cancelled)
COMPLETED=$((SUCCESS + FAILURE))
if [ $COMPLETED -gt 0 ]; then
  SUCCESS_RATE=$(echo "scale=1; ($SUCCESS * 100) / $COMPLETED" | bc)
  echo "=== Success Rate ==="
  echo "Completed Runs: $COMPLETED (excluding cancelled/in-progress)"
  echo "Success Rate: $SUCCESS_RATE%"
  echo "Target: ≥${TARGET_SUCCESS_RATE}%"
  echo ""
  
  # Compare to pre-fix baseline
  IMPROVEMENT=$(echo "scale=1; $SUCCESS_RATE - $BASELINE_RATE" | bc)
  
  echo "=== Comparison to Pre-Fix Baseline ==="
  echo "Pre-Fix (Oct 27-Nov 1): ${BASELINE_RATE}%"
  echo "Post-Fix (Current): $SUCCESS_RATE%"
  echo "Improvement: +$IMPROVEMENT percentage points"
  echo ""
  
  # Determine status based on configurable thresholds
  if (( $(echo "$SUCCESS_RATE >= $TARGET_SUCCESS_RATE" | bc) )); then
    echo "✅ SUCCESS: Target achieved! Fix is working as expected."
    exit 0
  elif (( $(echo "$SUCCESS_RATE >= $GOOD_PROGRESS_RATE" | bc) )); then
    echo "⚠️  GOOD PROGRESS: Success rate improving but not yet at target."
    echo "   Continue monitoring. May need 5-7 days to reach ${TARGET_SUCCESS_RATE}%."
    exit 0
  elif (( $(echo "$SUCCESS_RATE >= $MODERATE_PROGRESS_RATE" | bc) )); then
    echo "⚠️  MODERATE IMPROVEMENT: Success rate improved but below expectations."
    echo "   Investigate recent failures to identify remaining issues."
    exit 0
  else
    echo "❌ WARNING: Success rate still below ${MODERATE_PROGRESS_RATE}%."
    echo "   The fix may not be working as expected."
    echo "   Action required:"
    echo "   1. Review recent failure logs"
    echo "   2. Verify fix deployment with: bash scripts/e2e/verify-nov1-fix.sh"
    echo "   3. Consider rollback if failures persist"
    exit 1
  fi
else
  echo "⚠️  No completed runs yet (all in-progress or cancelled)"
  echo "   Check back later once runs complete"
  exit 0
fi
