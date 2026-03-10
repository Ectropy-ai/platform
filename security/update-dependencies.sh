#!/bin/bash
# Automated dependency update with security focus
set -euo pipefail

echo "🔄 Starting secure dependency update process..."

# Backup current lockfile
cp pnpm-lock.yaml pnpm-lock.yaml.backup

# Update dependencies with audit
echo "📦 Updating dependencies..."
pnpm update --latest

# Run security audit
echo "🔒 Running security audit..."
if ! pnpm audit --audit-level moderate; then
    echo "⚠️ Security vulnerabilities found! Review and fix before proceeding."
    exit 1
fi

# Run tests to ensure compatibility
echo "🧪 Running tests..."
if pnpm test; then
    echo "✅ All tests passed"
else
    echo "❌ Tests failed, reverting changes..."
    mv pnpm-lock.yaml.backup pnpm-lock.yaml
    pnpm install --frozen-lockfile
    exit 1
fi

# Clean up backup
rm pnpm-lock.yaml.backup

echo "🎉 Dependency update completed successfully!"
