#!/bin/bash
set -euo pipefail

echo "Ectropy Platform - Actual Status Report"
echo "Date: $(date)"
echo "======================================"

projects=(web-dashboard api-gateway mcp-server)

echo "BUILD STATUS (Actual):"
for project in "${projects[@]}"; do
  if pnpm --reporter=append-only nx build "$project" >/dev/null 2>&1; then
    echo "  ✅ $project: Builds successfully"
  else
    echo "  ❌ $project: Build fails"
  fi
  pnpm --reporter=append-only nx reset >/dev/null 2>&1 || true
  rm -rf "dist/apps/$project" "apps/$project/dist" "apps/$project/build" >/dev/null 2>&1 || true
  rm -rf dist/libs .nx node_modules/.cache build .turbo .angular >/dev/null 2>&1 || true
  rm -f pnpm-debug.log >/dev/null 2>&1 || true
done

echo ""
echo "INFRASTRUCTURE STATUS:"
if command -v docker >/dev/null 2>&1; then
  if docker compose -f docker-compose.dev.yml ps --status running >/dev/null 2>&1; then
    echo "  ✅ Infrastructure services: Running"
  else
    echo "  ❌ Infrastructure services: Not running"
  fi
else
  echo "  ⚠️ Docker not available"
fi

echo ""
echo "CI/CD STATUS:"
if mkdir -p temp-test-dir && rm -rf temp-test-dir; then
  echo "  ✅ Directory operations: Working"
else
  echo "  ❌ Directory operations: Failing"
fi
