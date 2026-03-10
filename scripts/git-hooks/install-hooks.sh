#!/bin/bash

# Git Hooks Installation Script
# Installs pre-commit validation hook

set -e

echo "🔧 Installing Git Hooks"
echo "======================"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo "❌ Error: Not in a git repository"
  echo "   Run this script from the repository root"
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy pre-commit hook
HOOK_SOURCE="scripts/git-hooks/pre-commit-validate.sh"
HOOK_DEST=".git/hooks/pre-commit"

if [ ! -f "$HOOK_SOURCE" ]; then
  echo "❌ Error: Hook source not found: $HOOK_SOURCE"
  exit 1
fi

cp "$HOOK_SOURCE" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Pre-commit hook installed successfully"
echo ""
echo "Hook Configuration:"
echo "==================="
echo "Location: .git/hooks/pre-commit"
echo "Source: $HOOK_SOURCE"
echo ""
echo "Usage Instructions:"
echo "==================="
echo ""
echo "1. Start MCP Server:"
echo "   pnpm nx serve mcp-server"
echo ""
echo "2. Make changes and commit normally:"
echo "   git add <files>"
echo "   git commit -m \"message\""
echo ""
echo "3. Hook validates automatically:"
echo "   - Approve (≥80): Commit proceeds"
echo "   - Review (50-79): Warning shown, commit proceeds"
echo "   - Reject (<50 or critical): Commit blocked"
echo ""
echo "Emergency Bypass (use sparingly):"
echo "   git commit --no-verify -m \"message\""
echo ""
echo "Detected Violations:"
echo "===================="
echo "  Critical (blocks commit):"
echo "    - @ts-ignore, @ts-nocheck, eslint-disable"
echo "    - Hardcoded secrets (passwords, API keys)"
echo "    - New documentation files (except README, CHANGELOG, etc.)"
echo ""
echo "  High (deducts 20 points):"
echo "    - Workarounds (quick fix, temporary, hack)"
echo ""
echo "  Medium (deducts 10 points):"
echo "    - TODO/FIXME comments"
echo "    - console.log statements"
echo ""
echo "  Low (deducts 5 points):"
echo "    - TypeScript 'any' type"
echo "    - Commented out code"
echo ""
echo "🎉 Installation complete!"
