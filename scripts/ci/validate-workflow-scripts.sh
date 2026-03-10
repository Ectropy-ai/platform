#!/bin/bash
set -euo pipefail

###############################################################################
# Workflow Script Validation
# Validates that all scripts referenced in GitHub Actions workflows exist
###############################################################################

echo "🔍 Validating workflow-referenced scripts..."

WORKFLOW_DIR=".github/workflows"
MISSING_SCRIPTS=()
TOTAL_CHECKED=0
CHECKED_SCRIPTS=()

# Find all script references in workflows (excluding archived workflows)
while IFS= read -r script_ref; do
  # Extract script path (handles both 'bash scripts/...' and 'run: scripts/...')
  # Remove semicolons and other shell syntax
  script_path=$(echo "$script_ref" | sed -E 's/.*scripts\//scripts\//' | awk '{print $1}' | sed 's/[;,]$//')
  
  # Skip empty paths
  if [[ -z "$script_path" ]]; then
    continue
  fi
  
  # Skip if already checked
  if [[ " ${CHECKED_SCRIPTS[@]} " =~ " ${script_path} " ]]; then
    continue
  fi
  
  CHECKED_SCRIPTS+=("$script_path")
  TOTAL_CHECKED=$((TOTAL_CHECKED + 1))
  
  if [[ ! -f "$script_path" ]]; then
    MISSING_SCRIPTS+=("$script_path")
    echo "❌ MISSING: $script_path"
  else
    echo "✅ Found: $script_path"
  fi
done < <(grep -rh "scripts/" "$WORKFLOW_DIR" --include="*.yml" --exclude-dir=".archive" | grep -E "(bash|run:)" | grep "scripts/" || true)

echo ""
echo "📊 Validation Summary:"
echo "   - Total scripts checked: $TOTAL_CHECKED"
echo "   - Missing scripts: ${#MISSING_SCRIPTS[@]}"

if [[ ${#MISSING_SCRIPTS[@]} -gt 0 ]]; then
  echo ""
  echo "❌ Validation FAILED - Missing scripts:"
  printf '   - %s\n' "${MISSING_SCRIPTS[@]}"
  exit 1
else
  echo "✅ All workflow-referenced scripts exist"
  exit 0
fi
