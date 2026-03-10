#!/bin/bash
# Configure Shared Browser Cache for GitHub Actions Runners
# Enterprise optimization: -60s per shard, -150MB bandwidth per run
# Created: 2025-12-05

set -e

echo "=== Ectropy CI/CD Runner: Shared Browser Cache Configuration ==="
echo "Purpose: Eliminate redundant browser downloads across 4 runners"
echo "Expected Savings: 60s per shard, 150MB bandwidth per run"
echo

# Verify shared cache directory exists
if [ ! -d "/opt/shared-playwright-cache" ]; then
    echo "ERROR: /opt/shared-playwright-cache does not exist!"
    exit 1
fi

echo "✓ Shared cache directory exists: /opt/shared-playwright-cache"
echo

# Configure each runner
for i in 1 2 3 4; do
    RUNNER_DIR="/opt/actions-runner-$i"
    ENV_FILE="$RUNNER_DIR/.env"

    if [ ! -d "$RUNNER_DIR" ]; then
        echo "⚠️  Runner $i directory not found: $RUNNER_DIR"
        continue
    fi

    # Check if already configured
    if grep -q "PLAYWRIGHT_BROWSERS_PATH" "$ENV_FILE" 2>/dev/null; then
        echo "✓ Runner $i: Already configured"
    else
        # Add configuration
        echo "PLAYWRIGHT_BROWSERS_PATH=/opt/shared-playwright-cache" | sudo tee -a "$ENV_FILE" > /dev/null
        echo "✓ Runner $i: Configured (added PLAYWRIGHT_BROWSERS_PATH)"
    fi
done

echo
echo "=== Verification ==="
echo "Checking runner-1 configuration:"
grep "PLAYWRIGHT_BROWSERS_PATH" /opt/actions-runner-1/.env 2>/dev/null || echo "Not found"

echo
echo "=== Next Steps ==="
echo "1. Restart runners: sudo systemctl restart 'actions.runner*'"
echo "2. Update workflow: .github/workflows/e2e-tests.yml cache path"
echo "3. Bump cache key version to force rebuild"
echo
echo "✅ Configuration complete!"
