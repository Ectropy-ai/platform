#!/bin/bash
set -euo pipefail

# AI Agent Progress Update Script
# Updates the status of tasks in the roadmap

AGENT_ID="${1:-}"
STATUS="${2:-}"
TASK_ID="${3:-}"

if [[ -z "$AGENT_ID" || -z "$STATUS" ]]; then
  echo "Usage: $0 <AGENT_ID> <STATUS> [TASK_ID]"
  echo "Example: $0 AI_AGENT_001 IN_PROGRESS 1.1"
  exit 1
fi

ROADMAP_FILE="docs/development/ROADMAP_AI_AGENTS.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Status emoji mapping
get_status_emoji() {
  case "$1" in
    "NOT_STARTED") echo "🔴" ;;
    "IN_PROGRESS") echo "🟡" ;;
    "BLOCKED") echo "🟠" ;;
    "REVIEW") echo "🟣" ;;
    "COMPLETE") echo "🟢" ;;
    *) echo "⚪" ;;
  esac
}

# Validate inputs
if [[ ! -f "$ROADMAP_FILE" ]]; then
  log_error "Roadmap file not found: $ROADMAP_FILE"
  exit 1
fi

STATUS_EMOJI=$(get_status_emoji "$STATUS")

log_info "🤖 Updating progress for $AGENT_ID"
log_info "📊 New status: $STATUS_EMOJI $STATUS"

# If TASK_ID is provided, update specific task
if [[ -n "$TASK_ID" ]]; then
  log_info "🎯 Task: $TASK_ID"
  
  # Update the specific task row in the roadmap
  # Find the line with the task ID and update the status
  if grep -q "^|$TASK_ID" "$ROADMAP_FILE"; then
    # Create a backup
    cp "$ROADMAP_FILE" "$ROADMAP_FILE.backup"
    
    # Update the status in the table - find the task line and update status column
    sed -i "/^|$TASK_ID/s/|🔴 NOT_STARTED\|🟡 IN_PROGRESS\|🟠 BLOCKED\|🟣 REVIEW\|🟢 COMPLETE/|$STATUS_EMOJI $STATUS/" "$ROADMAP_FILE"
    
    log_success "Task $TASK_ID updated to $STATUS_EMOJI $STATUS"
  else
    log_warning "Task $TASK_ID not found in roadmap"
  fi
else
  # Update any task assigned to this agent
  if grep -q "$AGENT_ID" "$ROADMAP_FILE"; then
    cp "$ROADMAP_FILE" "$ROADMAP_FILE.backup"
    
    # Update all tasks assigned to this agent
    sed -i "s/\(|[^|]*|[^|]*\)|$AGENT_ID|\([^|]*\)|🔴 NOT_STARTED\|🟡 IN_PROGRESS\|🟠 BLOCKED\|🟣 REVIEW\|🟢 COMPLETE/\1|$AGENT_ID|\2|$STATUS_EMOJI $STATUS/" "$ROADMAP_FILE"
    
    log_success "All tasks for $AGENT_ID updated to $STATUS_EMOJI $STATUS"
  else
    log_warning "Agent $AGENT_ID not found in roadmap"
  fi
fi

# Generate progress summary
echo ""
log_info "📈 Current Progress Summary:"

TOTAL_TASKS=$(grep -c "^|[0-9]" "$ROADMAP_FILE" 2>/dev/null || echo "0")
COMPLETED_TASKS=$(grep -c "🟢 COMPLETE" "$ROADMAP_FILE" 2>/dev/null || echo "0")
IN_PROGRESS_TASKS=$(grep -c "🟡 IN_PROGRESS" "$ROADMAP_FILE" 2>/dev/null || echo "0")
BLOCKED_TASKS=$(grep -c "🟠 BLOCKED" "$ROADMAP_FILE" 2>/dev/null || echo "0")

if [[ $TOTAL_TASKS -gt 0 ]]; then
  COMPLETION_PERCENTAGE=$((COMPLETED_TASKS * 100 / TOTAL_TASKS))
  echo "  📊 Completion: $COMPLETED_TASKS/$TOTAL_TASKS ($COMPLETION_PERCENTAGE%)"
  echo "  🟡 In Progress: $IN_PROGRESS_TASKS"
  echo "  🟠 Blocked: $BLOCKED_TASKS"
  echo "  🔴 Not Started: $((TOTAL_TASKS - COMPLETED_TASKS - IN_PROGRESS_TASKS - BLOCKED_TASKS))"
else
  echo "  📊 No tasks found in roadmap"
fi

# Update the weekly metrics in the roadmap
CURRENT_WEEK=$(date +%U)
CURRENT_DATE=$(date +%Y-%m-%d)

# Try to get current coverage and build time
COVERAGE="N/A"
BUILD_TIME="N/A"

if command -v pnpm >/dev/null 2>&1; then
  # Try to get build time for web-dashboard
  if BUILD_OUTPUT=$(timeout 60 bash -c "time pnpm nx run web-dashboard:build 2>&1" 2>/dev/null); then
    BUILD_TIME=$(echo "$BUILD_OUTPUT" | grep "real" | awk '{print $2}' | head -1 || echo "N/A")
  fi
fi

# Update the weekly metrics section
if grep -q "week_1:" "$ROADMAP_FILE"; then
  sed -i "s/tasks_completed: [0-9]*\/[0-9]*/tasks_completed: $COMPLETED_TASKS\/$TOTAL_TASKS/" "$ROADMAP_FILE"
  sed -i "s/build_time: [^s]*s/build_time: $BUILD_TIME/" "$ROADMAP_FILE"
fi

log_success "Progress update completed!"

# Show next steps based on current status
echo ""
log_info "🚀 Suggested Next Actions:"

if [[ "$STATUS" == "COMPLETE" ]]; then
  echo "  1. Validate task completion with validation script"
  echo "  2. Update documentation"
  echo "  3. Move to next task in sequence"
  echo "  4. Consider starting parallel tasks if dependencies allow"
elif [[ "$STATUS" == "IN_PROGRESS" ]]; then
  echo "  1. Continue implementation"
  echo "  2. Run incremental tests"
  echo "  3. Update progress regularly"
  echo "  4. Ask for help if blocked"
elif [[ "$STATUS" == "BLOCKED" ]]; then
  echo "  1. Document the blocker clearly"
  echo "  2. Create GitHub issue with 'blocked' label"
  echo "  3. Escalate to team if needed"
  echo "  4. Work on parallel tasks if possible"
fi

echo ""
log_info "📝 Backup created at: $ROADMAP_FILE.backup"
log_info "📄 Roadmap updated: $ROADMAP_FILE"

exit 0