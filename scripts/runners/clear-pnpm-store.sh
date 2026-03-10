#!/usr/bin/env bash
# Script: Clear PNPM Store on Self-Hosted Runner
# Purpose: Fix corrupted or incomplete pnpm store causing deployment failures
# Usage: bash scripts/runners/clear-pnpm-store.sh <runner-name>
# Example: bash scripts/runners/clear-pnpm-store.sh ectropy-runner-3
#
# Evidence: evidence/RUNNER_PNPM_STORE_MISSING_PACKAGE_2025-12-02.md
# Root Cause: ERR_PNPM_NO_OFFLINE_TARBALL - Missing @types/passport@1.0.17

set -euo pipefail

# Validate input
RUNNER_NAME="${1:-}"
if [ -z "$RUNNER_NAME" ]; then
  echo "❌ Error: Runner name required"
  echo ""
  echo "Usage: $0 <runner-name>"
  echo "Example: $0 ectropy-runner-3"
  echo ""
  echo "Available runners:"
  echo "  - ectropy-runner-1"
  echo "  - ectropy-runner-2"
  echo "  - ectropy-runner-3"
  echo "  - ectropy-runner-4"
  exit 1
fi

echo "🧹 Clearing pnpm store on $RUNNER_NAME..."
echo ""

# SSH into runner and clear store
ssh "$RUNNER_NAME" << 'ENDSSH'
  set -euo pipefail

  echo "📍 Step 1: Checking current store status..."
  if [ -d ~/.local/share/pnpm/store ]; then
    STORE_SIZE=$(du -sh ~/.local/share/pnpm/store | cut -f1)
    echo "   Current store size: $STORE_SIZE"
  else
    echo "   Store directory does not exist"
  fi
  echo ""

  echo "📍 Step 2: Stopping runner service..."
  # Find the runner service name
  SERVICE_NAME=$(systemctl list-units --type=service --all | grep "actions.runner" | awk '{print $1}' | head -n 1)
  if [ -n "$SERVICE_NAME" ]; then
    echo "   Found service: $SERVICE_NAME"
    sudo systemctl stop "$SERVICE_NAME" || echo "   ⚠️  Could not stop service (may not be running)"
  else
    echo "   ⚠️  No runner service found (runner may be running as process)"
  fi
  echo ""

  echo "📍 Step 3: Clearing pnpm store..."
  if [ -d ~/.local/share/pnpm/store ]; then
    rm -rf ~/.local/share/pnpm/store
    echo "   ✅ Store directory removed"
  else
    echo "   ℹ️  Store directory already empty"
  fi

  # Also clear pnpm cache
  if command -v pnpm &> /dev/null; then
    pnpm store prune || echo "   ⚠️  pnpm store prune failed (expected if store is empty)"
  fi
  echo ""

  echo "📍 Step 4: Restarting runner service..."
  if [ -n "$SERVICE_NAME" ]; then
    sudo systemctl start "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      echo "   ✅ Runner service restarted successfully"
    else
      echo "   ⚠️  Runner service may not have started"
      systemctl status "$SERVICE_NAME" --no-pager || true
    fi
  else
    echo "   ℹ️  No service to restart (runner may be running as process)"
  fi
  echo ""

  echo "✅ Store cleared on $(hostname)"
  echo ""
  echo "📊 Next deployment will rebuild store from scratch"
  echo "   Expected first install duration: 5-15 minutes (downloading packages)"
  echo "   Subsequent installs: 3-8 minutes (packages cached)"
ENDSSH

echo ""
echo "✅ Done"
echo ""
echo "📝 Next Steps:"
echo "   1. Trigger a staging deployment to rebuild store"
echo "   2. Monitor installation duration (should be 5-15min for first run)"
echo "   3. Verify no ERR_PNPM_NO_OFFLINE_TARBALL errors"
echo "   4. Subsequent deployments should be faster (3-8min)"
