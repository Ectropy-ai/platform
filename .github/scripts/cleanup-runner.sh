#!/bin/bash
set -e

# Get runner name from GitHub Actions context (passed as argument)
RUNNER_NAME="${1:-}"

if [ -z "$RUNNER_NAME" ]; then
    echo "❌ ERROR: Runner name not provided"
    echo "Usage: $0 <runner-name>"
    exit 1
fi

echo "🏃 Cleaning runner: $RUNNER_NAME"

# Define work directory
WORK_DIR="/opt/actions-runner-${RUNNER_NAME}/_work"

# Verify directory exists
if [ ! -d "$WORK_DIR" ]; then
    echo "⚠️  Work directory does not exist: $WORK_DIR"
    exit 0
fi

# Safe cleanup with verification
cd "$WORK_DIR" || exit 1
pwd
ls -la

# Remove node_modules and build artifacts
echo "🧹 Removing build artifacts..."
find . -type d -name "node_modules" -prune -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".nx" -prune -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "dist" -prune -exec rm -rf {} + 2>/dev/null || true

echo "✅ Cleanup completed successfully"
