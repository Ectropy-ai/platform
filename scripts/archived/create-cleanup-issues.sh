#!/bin/bash

# Documentation Cleanup - Create GitHub Issues
# Run from repository root: bash evidence/create-cleanup-issues.sh

echo "🚀 Creating Documentation Cleanup Issues..."
echo ""

# Phase 1
echo "Creating Phase 1: Remove Historical Files..."
gh issue create \
  --title "[AGENT] Documentation Cleanup Phase 1: Remove Historical Files" \
  --body-file evidence/issue-phase1-doc-cleanup.md \
  --label "agent-task,documentation,cleanup"

echo "✅ Phase 1 issue created"
echo ""

# Phase 2  
echo "Creating Phase 2: Consolidate Archive Directory..."
gh issue create \
  --title "[AGENT] Documentation Cleanup Phase 2: Consolidate Archive Directory" \
  --body-file evidence/issue-phase2-doc-cleanup.md \
  --label "agent-task,documentation,cleanup"

echo "✅ Phase 2 issue created"
echo ""

# Phase 3 & 4
echo "Creating Phases 3 & 4: Final Cleanup..."
gh issue create \
  --title "[AGENT] Documentation Cleanup Phases 3 & 4: Auth/Deployment/Strategy Removal" \
  --body-file evidence/issue-phase3-4-doc-cleanup.md \
  --label "agent-task,documentation,cleanup"

echo "✅ Phase 3 & 4 issue created"
echo ""
echo "🎉 All issues created successfully!"
echo ""
echo "Next steps:"
echo "1. Assign Phase 1 to agent"
echo "2. Wait for Phase 1 PR to merge"
echo "3. Assign Phase 2 to agent"
echo "4. Wait for Phase 2 PR to merge"
echo "5. Assign Phases 3 & 4 to agent"
echo "6. Validate final state: find docs -name '*.md' | wc -l (should be ≤12)"
