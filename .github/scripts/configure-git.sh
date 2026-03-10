#!/bin/bash

# Enterprise Git Configuration Script
# Ensures consistent Git settings across all CI environments

set -euo pipefail

echo "🔧 Configuring Git for enterprise standards..."

# Set consistent default branch
git config --global init.defaultBranch main
git config --global advice.defaultBranchName false

# Set CI user identity
git config --global user.email "ci@ectropy.com"
git config --global user.name "Ectropy CI"

# Configure safe.directory for security
git config --global --add safe.directory "*"

# Set consistent line ending handling
git config --global core.autocrlf input
git config --global core.eol lf

# Configure merge and pull strategies
git config --global pull.rebase false
git config --global merge.ff false

# Enable helpful features
git config --global help.autocorrect 1
git config --global color.ui auto

# Security settings
git config --global http.sslVerify true
git config --global transfer.fsckObjects true
git config --global fetch.fsckObjects true
git config --global receive.fsckObjects true

echo "✅ Git configured with enterprise standards:"
echo "   - Default branch: main"
echo "   - User: Ectropy CI <ci@ectropy.com>"
echo "   - Line endings: LF"
echo "   - Security: Enhanced verification enabled"