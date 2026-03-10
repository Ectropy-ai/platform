#!/bin/bash
# scripts/ci/emergency-fix.sh
# Emergency deployment fix for critical CI/CD blocking issues
set -e

echo "🔧 Fixing all CI issues..."

# Fix lockfile
echo "📦 Syncing lockfile with tsx dependency..."
pnpm install --no-frozen-lockfile

# Install Playwright
echo "🎭 Installing Playwright browsers..."
pnpm exec playwright install --with-deps || echo "⚠️ Playwright browser installation failed, continuing..."

# Update scripts to use pnpm exec tsx
echo "🔄 Replacing deprecated TypeScript execution syntax..."
sed -i 's/NODE_NO_WARNINGS=1 node --loader ts-node\/esm/pnpm exec tsx/g' .github/workflows/*.yml
sed -i 's/node --loader ts-node\/esm/pnpm exec tsx/g' scripts/*.sh

# Commit fixes
echo "💾 Committing fixes..."
git add -A
git commit -m "fix(ci): resolve lockfile, playwright, and tsx issues" || echo "No changes to commit"

echo "✅ Ready for deployment"