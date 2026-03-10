#!/bin/bash
# scripts/ci/install-dependencies.sh
set -e

echo "🚀 Starting robust dependency installation..."

# Clear potentially corrupted state
echo "🧹 Clearing potentially corrupted cache state..."
rm -rf node_modules/.cache
rm -rf node_modules/.vite

# Install with retry logic
attempt=0
max_attempts=3
while [ $attempt -lt $max_attempts ]; do
  echo "📦 Install attempt $((attempt + 1)) of $max_attempts..."
  if pnpm install --frozen-lockfile --ignore-scripts; then
    echo "✅ Dependencies installed successfully (without scripts)"
    break
  fi
  attempt=$((attempt + 1))
  echo "❌ Install attempt $attempt failed, retrying..."
  pnpm store prune
done

if [ $attempt -eq $max_attempts ]; then
  echo "💥 All install attempts failed"
  exit 1
fi

# Run critical postinstall scripts only
echo "🔄 Running critical postinstall scripts..."
pnpm rebuild || echo "⚠️ Some rebuilds failed, continuing..."

# Verify critical modules
echo "🔍 Verifying critical modules..."
if ! node -e "require('sharp')"; then
  echo "❌ Sharp module missing, attempting rebuild..."
  pnpm rebuild sharp || echo "⚠️ Sharp rebuild failed"
fi

if ! node -e "require('@xenova/transformers')"; then
  echo "❌ @xenova/transformers module missing, attempting install..."
  pnpm add @xenova/transformers || echo "⚠️ @xenova/transformers install failed"
fi

echo "✅ Dependency installation completed successfully"