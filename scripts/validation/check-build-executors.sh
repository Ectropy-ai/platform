#!/bin/bash
#
# Build Executor Validation Script
# Ensures monorepo libraries follow correct executor patterns
#
# RULE: Libraries that import from @ectropy/* MUST use bundler executors
#       Libraries without cross-imports SHOULD use @nx/js:tsc
#
# Usage: bash scripts/validation/check-build-executors.sh
# Exit: 0 if all valid, 1 if violations found
#
# Known Technical Debt (builds successfully but violates pattern):
#   - libs/ai-agents/performance
#   - libs/ai-agents/compliance  
#   - libs/ai-agents/procurement
#   - libs/ai-agents/task-manager
# These import from @ectropy/ai-agents-shared and should eventually migrate to esbuild
#

set -e

VIOLATIONS=0
WARNINGS=0
TECH_DEBT=0

# Known working violations (technical debt to be addressed in future)
KNOWN_TECH_DEBT=(
  "libs/ai-agents/performance"
  "libs/ai-agents/compliance"
  "libs/ai-agents/procurement"
  "libs/ai-agents/task-manager"
)

echo "🔍 Validating Build Executor Patterns..."
echo ""

# Find all library project.json files
LIBS=$(find libs -name "project.json" 2>/dev/null)

for PROJECT_FILE in $LIBS; do
  DIR=$(dirname "$PROJECT_FILE")
  LIB_NAME=$(basename "$DIR")
  
  # Extract executor from project.json using jq for robust parsing
  EXECUTOR=$(jq -r '.targets.build.executor // empty' "$PROJECT_FILE" 2>/dev/null)
  
  # Check if library imports from @ectropy
  # Look for actual import statements, including indented ones
  HAS_CROSS_IMPORTS=false
  if [ -d "$DIR/src" ]; then
    IMPORT_COUNT=$(grep -rE "^\s*import .* from ['\"]@ectropy/" "$DIR/src/" 2>/dev/null | grep -v node_modules | grep -v ".spec." | wc -l)
    if [ "$IMPORT_COUNT" -gt 0 ]; then
      HAS_CROSS_IMPORTS=true
    fi
  fi
  
  # Validate executor pattern
  if [ "$HAS_CROSS_IMPORTS" = true ]; then
    # Libraries with cross-imports MUST use bundlers
    if [[ "$EXECUTOR" == *"tsc"* ]]; then
      # Check if this is known technical debt
      IS_KNOWN_DEBT=false
      for debt_path in "${KNOWN_TECH_DEBT[@]}"; do
        if [[ "$DIR" == "$debt_path" ]]; then
          IS_KNOWN_DEBT=true
          break
        fi
      done
      
      if [ "$IS_KNOWN_DEBT" = true ]; then
        echo "⚠️  $LIB_NAME - Technical debt: TSC with cross-imports (builds successfully, to be migrated)"
        TECH_DEBT=$((TECH_DEBT + 1))
      else
        echo "❌ VIOLATION: $LIB_NAME"
        echo "   Location: $PROJECT_FILE"
        echo "   Issue: Uses TSC executor but imports from other @ectropy libraries"
        echo "   Fix: Change executor to '@nx/esbuild:esbuild' with proper externals"
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
      fi
    else
      echo "✅ $LIB_NAME - Correct: bundler with cross-imports"
    fi
  else
    # Libraries without cross-imports SHOULD use TSC (but bundler is allowed)
    if [[ "$EXECUTOR" == *"tsc"* ]]; then
      echo "✅ $LIB_NAME - Correct: TSC without cross-imports"
    elif [[ "$EXECUTOR" == *"esbuild"* ]] || [[ "$EXECUTOR" == *"webpack"* ]]; then
      echo "⚠️  $LIB_NAME - Using bundler without cross-imports (allowed but unnecessary)"
      WARNINGS=$((WARNINGS + 1))
    else
      echo "✅ $LIB_NAME - Using $EXECUTOR"
    fi
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $VIOLATIONS -gt 0 ]; then
  echo "❌ FAILED: Found $VIOLATIONS critical violation(s)"
  if [ $TECH_DEBT -gt 0 ]; then
    echo "⚠️  Also found $TECH_DEBT known technical debt item(s) (tracked for future migration)"
  fi
  echo ""
  echo "Build executor violations must be fixed before merging."
  echo "See docs/AGENT_GUIDE.md § Build Executor Standards for guidance."
  exit 1
elif [ $TECH_DEBT -gt 0 ]; then
  echo "✅ PASSED: No new violations"
  echo "⚠️  Found $TECH_DEBT known technical debt item(s)"
  echo ""
  echo "Technical debt items build successfully but should migrate to bundlers for consistency."
  echo "These are tracked for future migration and don't block PR merges."
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  Also found $WARNINGS warning(s) - consider optimizing to TSC for standalone libraries"
  fi
  exit 0
elif [ $WARNINGS -gt 0 ]; then
  echo "✅ PASSED: No critical violations"
  echo "⚠️  Found $WARNINGS warning(s) - consider optimizing to TSC for standalone libraries"
  exit 0
else
  echo "✅ PASSED: All libraries follow correct build executor patterns"
  echo ""
  echo "Summary:"
  echo "  - Libraries with cross-imports use bundlers ✓"
  echo "  - Libraries without cross-imports use appropriate executors ✓"
  exit 0
fi
