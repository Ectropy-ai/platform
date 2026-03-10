#!/bin/bash

# Playwright E2E Test Validation Script
# This script validates that the Playwright testing infrastructure is set up correctly

set -e

echo "🎭 Playwright E2E Testing Infrastructure Validation"
echo "=================================================="
echo ""

# Check if we're in the correct directory
if [ ! -f "playwright.config.ts" ]; then
    echo "❌ Error: This script must be run from apps/web-dashboard directory"
    exit 1
fi

echo "✅ In correct directory: apps/web-dashboard"
echo ""

# Check if playwright.config.ts exists
if [ -f "playwright.config.ts" ]; then
    echo "✅ playwright.config.ts exists"
else
    echo "❌ playwright.config.ts not found"
    exit 1
fi

# Check test directory structure
echo ""
echo "📁 Test Directory Structure:"
if [ -d "tests/e2e" ]; then
    echo "✅ tests/e2e/ exists"
    
    for dir in api auth dashboard mcp; do
        if [ -d "tests/e2e/$dir" ]; then
            echo "  ✅ tests/e2e/$dir/ exists"
        else
            echo "  ❌ tests/e2e/$dir/ missing"
        fi
    done
else
    echo "❌ tests/e2e/ directory not found"
    exit 1
fi

# Check test files
echo ""
echo "📄 Test Files:"
test_files=(
    "tests/e2e/api/health.spec.ts"
    "tests/e2e/auth/login.spec.ts"
    "tests/e2e/dashboard/navigation.spec.ts"
    "tests/e2e/mcp/integration.spec.ts"
)

for file in "${test_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file missing"
    fi
done

# Check package.json scripts
echo ""
echo "📦 Package.json Scripts:"
if grep -q '"test:e2e"' package.json; then
    echo "  ✅ test:e2e script exists"
else
    echo "  ❌ test:e2e script missing"
fi

if grep -q '"test:e2e:headed"' package.json; then
    echo "  ✅ test:e2e:headed script exists"
else
    echo "  ❌ test:e2e:headed script missing"
fi

if grep -q '"test:e2e:ui"' package.json; then
    echo "  ✅ test:e2e:ui script exists"
else
    echo "  ❌ test:e2e:ui script missing"
fi

# Check if @playwright/test is in dependencies
echo ""
echo "🔧 Dependencies:"
if grep -q '@playwright/test' package.json; then
    echo "  ✅ @playwright/test in devDependencies"
else
    echo "  ⚠️  @playwright/test not in package.json (it's in root, which is OK for monorepo)"
fi

echo ""
echo "=================================================="
echo "🎉 Validation Complete!"
echo ""
echo "To run tests:"
echo "  1. Install dependencies from root: cd ../../ && pnpm install"
echo "  2. Navigate to web-dashboard: cd apps/web-dashboard"
echo "  3. Run tests: pnpm run test:e2e"
echo ""
echo "For more information, see tests/e2e/README.md"
