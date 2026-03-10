#!/bin/bash
# validate-branch.sh - Pre-PR validation script
# Usage: ./scripts/validate-branch.sh [test-pattern]

set -e

TEST_PATTERN="${1:-}"
BRANCH=$(git branch --show-current)

echo "=============================================="
echo "  Branch Validation: $BRANCH"
echo "=============================================="
echo ""

# Check for uncommitted changes
echo "→ Checking git status..."
if [[ -n $(git status --porcelain) ]]; then
    echo "  ⚠️  Uncommitted changes detected:"
    git status --short
    echo ""
else
    echo "  ✅ Working tree clean"
fi

# TypeScript check
echo ""
echo "→ Running TypeScript validation..."
if npx tsc --noEmit 2>&1 | grep -E "error TS" | head -10; then
    echo "  ⚠️  TypeScript errors found (showing first 10)"
else
    echo "  ✅ TypeScript validation passed"
fi

# Run tests
echo ""
echo "→ Running tests..."
if [[ -n "$TEST_PATTERN" ]]; then
    echo "  Pattern: $TEST_PATTERN"
    ./node_modules/.bin/vitest run "$TEST_PATTERN" 2>&1 | tail -30
else
    echo "  Running all tests..."
    ./node_modules/.bin/vitest run 2>&1 | tail -30
fi

echo ""
echo "=============================================="
echo "  Validation Complete"
echo "=============================================="
