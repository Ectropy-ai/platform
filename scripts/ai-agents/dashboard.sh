#!/bin/bash
set -euo pipefail

# AI Agents Status Dashboard
# Quick status overview for the AI development roadmap

echo "🤖 Ectropy AI Development Dashboard"
echo "=================================="
echo "Last Updated: $(date)"
echo ""

ROADMAP_FILE="docs/development/ROADMAP_AI_AGENTS.md"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ ! -f "$ROADMAP_FILE" ]]; then
  echo "❌ Roadmap file not found: $ROADMAP_FILE"
  exit 1
fi

# Count status indicators  
TOTAL_TASKS=$(grep -c "^|[0-9]" "$ROADMAP_FILE" 2>/dev/null | head -1 || echo "0")
COMPLETED=$(grep -c "🟢 COMPLETE" "$ROADMAP_FILE" 2>/dev/null | head -1 || echo "0")
IN_PROGRESS=$(grep -c "🟡 IN_PROGRESS" "$ROADMAP_FILE" 2>/dev/null | head -1 || echo "0")
BLOCKED=$(grep -c "🟠 BLOCKED" "$ROADMAP_FILE" 2>/dev/null | head -1 || echo "0")
NOT_STARTED=$(grep -c "🔴 NOT_STARTED" "$ROADMAP_FILE" 2>/dev/null | head -1 || echo "0")

if [[ $TOTAL_TASKS -gt 0 ]]; then
  COMPLETION_PERCENTAGE=$((COMPLETED * 100 / TOTAL_TASKS))
else
  COMPLETION_PERCENTAGE=0
fi

echo -e "${BLUE}📊 Overall Progress${NC}"
echo "Tasks: $COMPLETED/$TOTAL_TASKS complete ($COMPLETION_PERCENTAGE%)"
echo ""

echo -e "${GREEN}🟢 Completed: $COMPLETED${NC}"
echo -e "${YELLOW}🟡 In Progress: $IN_PROGRESS${NC}"
echo -e "${RED}🟠 Blocked: $BLOCKED${NC}"
echo -e "${RED}🔴 Not Started: $NOT_STARTED${NC}"
echo ""

# Phase breakdown
echo -e "${BLUE}📋 Phase Breakdown${NC}"

echo "Phase 1 (Critical Fixes):"
PHASE1_TASKS=$(grep -c "^|1\." "$ROADMAP_FILE" 2>/dev/null || echo "0")
PHASE1_COMPLETE=$(grep -E "^|1\." "$ROADMAP_FILE" | grep -c "🟢 COMPLETE" || echo "0")
echo "  Progress: $PHASE1_COMPLETE/$PHASE1_TASKS ($((PHASE1_COMPLETE * 100 / PHASE1_TASKS))%)"

echo "Phase 2 (Testing Infrastructure):"
PHASE2_TASKS=$(grep -c "^|2\." "$ROADMAP_FILE" 2>/dev/null || echo "0")
PHASE2_COMPLETE=$(grep -E "^|2\." "$ROADMAP_FILE" | grep -c "🟢 COMPLETE" || echo "0")
if [[ $PHASE2_TASKS -gt 0 ]]; then
  echo "  Progress: $PHASE2_COMPLETE/$PHASE2_TASKS ($((PHASE2_COMPLETE * 100 / PHASE2_TASKS))%)"
else
  echo "  Progress: 0/3 (0%) - Not yet implemented"
fi

echo "Phase 3 (AI Orchestration):"
PHASE3_TASKS=$(grep -c "^|3\." "$ROADMAP_FILE" 2>/dev/null || echo "0")
PHASE3_COMPLETE=$(grep -E "^|3\." "$ROADMAP_FILE" | grep -c "🟢 COMPLETE" || echo "0")
if [[ $PHASE3_TASKS -gt 0 ]]; then
  echo "  Progress: $PHASE3_COMPLETE/$PHASE3_TASKS ($((PHASE3_COMPLETE * 100 / PHASE3_TASKS))%)"
else
  echo "  Progress: 0/3 (0%) - Not yet implemented"
fi

echo "Phase 4 (Production Readiness):"
PHASE4_TASKS=$(grep -c "^|4\." "$ROADMAP_FILE" 2>/dev/null || echo "0")
PHASE4_COMPLETE=$(grep -E "^|4\." "$ROADMAP_FILE" | grep -c "🟢 COMPLETE" || echo "0")
if [[ $PHASE4_TASKS -gt 0 ]]; then
  echo "  Progress: $PHASE4_COMPLETE/$PHASE4_TASKS ($((PHASE4_COMPLETE * 100 / PHASE4_TASKS))%)"
else
  echo "  Progress: 0/3 (0%) - Not yet implemented"
fi

echo ""
echo -e "${BLUE}🎯 Current Focus${NC}"

# Show active tasks
IN_PROGRESS_NUM=$(echo "$IN_PROGRESS" | tr -d '\n' | head -c 10)
if [[ ${IN_PROGRESS_NUM:-0} -gt 0 ]]; then
  echo "Active Tasks:"
  grep "🟡 IN_PROGRESS" "$ROADMAP_FILE" | while IFS='|' read -r _ task_id task_name status owner _; do
    echo "  📌 Task ${task_id// /}: ${task_name// /}"
  done
else
  echo "No tasks currently in progress"
fi

# Show next tasks
echo ""
echo "Next Priority:"
if [[ $PHASE1_COMPLETE -lt $PHASE1_TASKS ]]; then
  echo "  🔥 Complete Phase 1 (Critical Fixes)"
  grep -E "^|1\." "$ROADMAP_FILE" | grep "🔴 NOT_STARTED" | head -1 | while IFS='|' read -r _ task_id task_name _; do
    echo "     → Task ${task_id// /}: ${task_name// /}"
  done
elif [[ $PHASE2_COMPLETE -lt 3 ]]; then
  echo "  🧪 Start Phase 2 (Testing Infrastructure)"
  echo "     → Implement E2E testing with Playwright"
else
  echo "  🤖 Ready for Phase 3 (AI Orchestration)"
fi

echo ""
echo -e "${BLUE}🚀 Quick Actions${NC}"
echo "Validate all tasks:     ./scripts/ai-agents/validate-all-tasks.sh"
echo "Update progress:        ./scripts/ai-agents/update-progress.sh [AGENT_ID] [STATUS] [TASK_ID]"
echo "Repository health:      ./scripts/health/repository-health-check.sh --nx-only"
echo "Build web dashboard:    pnpm nx run web-dashboard:build"

echo ""
echo "=================================="