#!/bin/bash
# Post-cleanup verification script to capture repository baseline

set -euo pipefail

LOG_FILE="verification-$(date +%Y%m%d-%H%M%S).log"

run_tree() {
  if command -v tree >/dev/null 2>&1; then
    tree -L 2 -d -I 'node_modules|dist|build' | head -20
  else
    echo "(tree command not available)"
  fi
}

{
  echo "=== POST-CLEANUP VERIFICATION ==="
  echo "Date: $(date)"
  echo ""

  echo "📁 Repository Structure:"
  run_tree

  echo -e "\n📋 Active Workflows:"
  ls -la .github/workflows/

  echo -e "\n📚 Documentation Files:"
  find docs -type f -name "*.md" 2>/dev/null | sort

  echo -e "\n🔨 Build Test:"
  pnpm nx run web-dashboard:build --skip-nx-cache 2>&1 | tail -5 || true
  pnpm nx run api-gateway:build --skip-nx-cache 2>&1 | tail -5 || true
  pnpm nx run mcp-server:build --skip-nx-cache 2>&1 | tail -5 || true

  echo -e "\n📝 TypeScript Compilation:"
  npx tsc --noEmit 2>&1 | grep -c "error" | xargs -I {} echo "Errors: {}" || echo "Errors: unable to determine"

  echo -e "\n🐳 Infrastructure Status:"
  if docker compose config > /dev/null 2>&1; then
    echo "Docker Compose: Valid"
  else
    echo "Docker Compose: Invalid"
  fi

  echo -e "\nResults saved to: ${LOG_FILE}"
} | tee "${LOG_FILE}"
