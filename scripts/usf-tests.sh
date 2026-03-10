#!/bin/bash
# test-usf.sh - Run all USF tests
# Usage: ./scripts/test-usf.sh [--watch]

set -e

USF_TESTS=(
    "apps/mcp-server/src/services/__tests__/usf-decision-lifecycle.spec.ts"
    "apps/mcp-server/src/services/__tests__/usf-voxel-integration.spec.ts"
)

echo "=============================================="
echo "  USF Test Suite"
echo "=============================================="
echo ""

if [[ "$1" == "--watch" ]]; then
    echo "Running in watch mode..."
    ./node_modules/.bin/vitest "${USF_TESTS[@]}"
else
    echo "Running tests..."
    ./node_modules/.bin/vitest run "${USF_TESTS[@]}"
fi

echo ""
echo "=============================================="
echo "  USF Tests Complete"
echo "=============================================="
