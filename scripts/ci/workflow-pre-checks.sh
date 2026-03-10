#!/bin/bash
# scripts/ci/workflow-pre-checks.sh
set -e

echo "🔍 Running workflow pre-checks..."

# Check required files
required_files=(
  "docker-compose.staging.yml"
  "package.json"
  "pnpm-lock.yaml"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "❌ Missing required file: $file"
    exit 1
  fi
done

echo "✅ All pre-checks passed"
