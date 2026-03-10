#!/usr/bin/env bash
set -euo pipefail

# ENTERPRISE DIAGNOSTIC: Playwright CLI Failure Root Cause Analysis
# Purpose: Investigate why `pnpm exec playwright --version` fails after browser installation
# Author: Claude Code (Enterprise Analysis)
# Date: 2025-12-03

echo "==================================================================="
echo "🔬 ENTERPRISE PLAYWRIGHT CLI DIAGNOSTIC"
echo "==================================================================="
echo ""

# ==========================================
# Phase 1: Environment Analysis
# ==========================================
echo "📊 Phase 1: Environment Analysis"
echo "-----------------------------------"
echo ""

echo "1.1 Node & pnpm versions:"
node --version || echo "❌ Node not found"
pnpm --version || echo "❌ pnpm not found"
echo ""

echo "1.2 Current working directory:"
pwd
echo ""

echo "1.3 Environment variables (Playwright-related):"
env | grep -i playwright || echo "No Playwright env vars set"
echo ""

echo "1.4 PATH:"
echo "$PATH"
echo ""

# ==========================================
# Phase 2: pnpm Configuration Analysis
# ==========================================
echo "📊 Phase 2: pnpm Configuration"
echo "-----------------------------------"
echo ""

echo "2.1 pnpm store path:"
pnpm store path || echo "❌ Failed to get store path"
echo ""

echo "2.2 Check if Playwright is installed:"
pnpm list --depth=0 | grep playwright || echo "❌ Playwright not in pnpm list"
echo ""

echo "2.3 Check Playwright installation in node_modules:"
if [ -d "node_modules/@playwright/test" ]; then
  echo "✅ @playwright/test found in node_modules"
  ls -lah "node_modules/@playwright/test" | head -10
else
  echo "❌ @playwright/test NOT found in node_modules"
fi
echo ""

echo "2.4 Check for .bin/playwright:"
if [ -f "node_modules/.bin/playwright" ]; then
  echo "✅ playwright binary found in node_modules/.bin"
  file "node_modules/.bin/playwright"
  cat "node_modules/.bin/playwright" | head -5
else
  echo "❌ playwright binary NOT found in node_modules/.bin"
fi
echo ""

# ==========================================
# Phase 3: Playwright CLI Testing
# ==========================================
echo "📊 Phase 3: Playwright CLI Testing"
echo "-----------------------------------"
echo ""

echo "3.1 Test: Direct node_modules/.bin/playwright --version"
if [ -f "node_modules/.bin/playwright" ]; then
  ./node_modules/.bin/playwright --version 2>&1 || echo "❌ Direct execution failed (exit code: $?)"
else
  echo "❌ Binary not found, skipping test"
fi
echo ""

echo "3.2 Test: pnpm exec playwright --version (WITHOUT redirection)"
echo "Expected: Version 1.56.1"
echo "Actual:"
pnpm exec playwright --version 2>&1 || {
  EXIT_CODE=$?
  echo "❌ pnpm exec playwright --version FAILED"
  echo "   Exit code: $EXIT_CODE"
}
echo ""

echo "3.3 Test: pnpm playwright --version (WITHOUT exec)"
pnpm playwright --version 2>&1 || {
  EXIT_CODE=$?
  echo "❌ pnpm playwright --version FAILED"
  echo "   Exit code: $EXIT_CODE"
}
echo ""

echo "3.4 Test: npx playwright --version"
npx playwright --version 2>&1 || {
  EXIT_CODE=$?
  echo "❌ npx playwright --version FAILED"
  echo "   Exit code: $EXIT_CODE"
}
echo ""

# ==========================================
# Phase 4: Playwright Package Inspection
# ==========================================
echo "📊 Phase 4: Playwright Package Inspection"
echo "-----------------------------------"
echo ""

echo "4.1 Playwright package.json:"
if [ -f "node_modules/@playwright/test/package.json" ]; then
  cat "node_modules/@playwright/test/package.json" | jq -r '.version, .bin' || cat "node_modules/@playwright/test/package.json" | head -20
else
  echo "❌ Package.json not found"
fi
echo ""

echo "4.2 Check Playwright CLI entry point:"
if [ -f "node_modules/@playwright/test/cli.js" ]; then
  echo "✅ cli.js exists"
  head -10 "node_modules/@playwright/test/cli.js"
else
  echo "❌ cli.js not found"
  echo "Looking for alternative entry points:"
  find node_modules/@playwright/test -name "*.js" -maxdepth 2 | head -10
fi
echo ""

# ==========================================
# Phase 5: Browser Path Analysis
# ==========================================
echo "📊 Phase 5: Browser Installation Path"
echo "-----------------------------------"
echo ""

echo "5.1 Playwright browsers path (default):"
BROWSER_PATH="${HOME}/.cache/ms-playwright"
if [ -d "$BROWSER_PATH" ]; then
  echo "✅ Browser cache exists: $BROWSER_PATH"
  ls -lah "$BROWSER_PATH" || echo "Failed to list contents"
else
  echo "❌ Browser cache NOT found at: $BROWSER_PATH"
fi
echo ""

echo "5.2 Alternative browser paths:"
for path in "/opt/actions-runner-3/.cache/ms-playwright" "/root/.cache/ms-playwright" ".cache/ms-playwright"; do
  if [ -d "$path" ]; then
    echo "✅ Found: $path"
    ls -1 "$path" | head -5
  fi
done
echo ""

# ==========================================
# Phase 6: Process & Permission Analysis
# ==========================================
echo "📊 Phase 6: Process & Permissions"
echo "-----------------------------------"
echo ""

echo "6.1 Current user:"
whoami
id
echo ""

echo "6.2 File permissions on playwright binary:"
if [ -f "node_modules/.bin/playwright" ]; then
  ls -l "node_modules/.bin/playwright"
  stat "node_modules/.bin/playwright"
else
  echo "❌ Binary not found"
fi
echo ""

echo "6.3 Check if pnpm is in PATH:"
which pnpm || echo "❌ pnpm not in PATH"
echo ""

# ==========================================
# Phase 7: Detailed Error Capture
# ==========================================
echo "📊 Phase 7: Detailed Error Capture"
echo "-----------------------------------"
echo ""

echo "7.1 Run playwright --version with full error output:"
echo "Command: pnpm exec playwright --version"
set +e
OUTPUT=$(pnpm exec playwright --version 2>&1)
EXIT_CODE=$?
set -e
echo "Exit code: $EXIT_CODE"
echo "Output:"
echo "$OUTPUT"
echo ""

if [ $EXIT_CODE -ne 0 ]; then
  echo "❌ FAILURE CONFIRMED"
  echo ""
  echo "7.2 Additional diagnostics:"
  echo "Checking if this is a module resolution issue..."

  # Try to require the module directly
  node -e "try { require('@playwright/test'); console.log('✅ Module loads successfully'); } catch(e) { console.error('❌ Module load failed:', e.message); }" || true
  echo ""

  # Check NODE_PATH
  echo "NODE_PATH: ${NODE_PATH:-<not set>}"
  echo ""
fi

echo "==================================================================="
echo "🏁 DIAGNOSTIC COMPLETE"
echo "==================================================================="
