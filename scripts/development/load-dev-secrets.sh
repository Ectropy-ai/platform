#!/bin/bash
# Load development secrets from GitHub Secrets
# Requires: gh CLI (GitHub CLI)
# Usage: source scripts/load-dev-secrets.sh

if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) not installed"
    echo "Install: https://cli.github.com/"
    exit 1
fi

echo "🔐 Loading development secrets from GitHub..."

# Fetch development secrets from GitHub
export GOOGLE_CLIENT_ID=$(gh secret list | grep GOOGLE_CLIENT_ID_DEVELOPMENT | awk '{print $1}' | xargs gh secret get)
export GOOGLE_CLIENT_SECRET=$(gh secret list | grep GOOGLE_CLIENT_SECRET_DEVELOPMENT | awk '{print $1}' | xargs gh secret get)

echo "✅ Secrets loaded into environment"
echo "   GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "   GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:10}..."
echo ""
echo "⚠️  Note: These are only available in this shell session"
echo "💡 Run: source scripts/load-dev-secrets.sh"
