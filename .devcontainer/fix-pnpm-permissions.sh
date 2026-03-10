#!/bin/bash
set -euo pipefail

# Fix pnpm permissions for GitHub Codespaces
PNPM_HOME="$HOME/.local/share/pnpm"
PNPM_STORE="$HOME/.local/share/pnpm-store"
PNPM_CACHE="$HOME/.cache/pnpm"

# Ensure directories exist with correct ownership
mkdir -p "$PNPM_HOME" "$PNPM_STORE" "$PNPM_CACHE"

# Install pnpm without requiring global permissions
curl -fsSL https://get.pnpm.io/install.sh | PNPM_HOME="$PNPM_HOME" sh -

# Update shell configuration
echo "export PNPM_HOME=\"$PNPM_HOME\"" >> ~/.bashrc
echo "export PATH=\"\$PNPM_HOME:\$PATH\"" >> ~/.bashrc
source ~/.bashrc

# Configure pnpm for user space
pnpm config set store-dir "$PNPM_STORE"
pnpm config set cache-dir "$PNPM_CACHE"

# Install dependencies
cd /workspace
pnpm install --frozen-lockfile

# Build MCP server
pnpm nx build mcp-server

echo "✅ pnpm permissions fixed and MCP server built"
