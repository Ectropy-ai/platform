#!/bin/bash
# Enterprise Playwright Browser Pre-Installation Script
# Purpose: Pre-install Playwright browsers on all self-hosted GitHub Actions runners
# Target: ectropy-runner droplet with 4 runner instances
# Author: Enterprise Infrastructure Team
# Date: 2025-12-02

set -uo pipefail  # Removed -e to continue even if one runner fails

LOG_FILE="/var/log/playwright-browser-install-$(date +%Y%m%d-%H%M%S).log"
echo "==================================" | tee -a "$LOG_FILE"
echo "Playwright Browser Pre-Installation" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "==================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# ENTERPRISE PATTERN: Comprehensive logging
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

# Function to install browsers for a specific runner
install_browsers_for_runner() {
    local RUNNER_DIR="$1"
    local RUNNER_NAME=$(basename "$RUNNER_DIR")

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Installing Playwright browsers for: $RUNNER_NAME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Get the owner of the runner directory
    RUNNER_USER=$(stat -c '%U' "$RUNNER_DIR")
    echo "ℹ️  Runner directory owner: $RUNNER_USER"

    # Set HOME for the runner user
    RUNNER_HOME="$RUNNER_DIR"
    BROWSER_CACHE="$RUNNER_HOME/.cache/ms-playwright"

    # Check if browsers already installed
    if [ -d "$BROWSER_CACHE" ] && [ -n "$(find "$BROWSER_CACHE" -maxdepth 1 -name 'chromium-*' -type d 2>/dev/null)" ]; then
        echo "✅ Chromium browser already installed"
        echo "📍 Location: $BROWSER_CACHE"
        ls -lh "$BROWSER_CACHE" | grep chromium || true
        echo ""
        return 0
    fi

    echo "📥 Installing Playwright browsers..."
    echo "📍 Target location: $BROWSER_CACHE"

    # ENTERPRISE PATTERN: Install as root for system dependencies, target runner cache
    # The --with-deps flag requires sudo for APT package installation
    # Browsers will be accessible to runner user via directory permissions
    echo '📦 Installing via npx playwright (requires root for system dependencies)...'

    # Create cache directory with correct ownership
    mkdir -p "$BROWSER_CACHE"
    chown -R "$RUNNER_USER":"$RUNNER_USER" "$(dirname "$BROWSER_CACHE")"

    # Install browsers and dependencies as root, targeting runner cache
    PLAYWRIGHT_BROWSERS_PATH="$BROWSER_CACHE" npx --yes playwright@latest install chromium --with-deps

    # Set ownership to runner user after installation
    chown -R "$RUNNER_USER":"$RUNNER_USER" "$BROWSER_CACHE"

    # Verify installation
    if [ -d "$BROWSER_CACHE" ] && [ -n "$(find "$BROWSER_CACHE" -maxdepth 1 -name 'chromium-*' -type d 2>/dev/null)" ]; then
        echo "✅ Chromium browser successfully installed"
        echo "📦 Installation details:"
        ls -lah "$BROWSER_CACHE" | grep -E "chromium|total" || true

        # Get size
        INSTALL_SIZE=$(du -sh "$BROWSER_CACHE" | awk '{print $1}')
        echo "💾 Total size: $INSTALL_SIZE"

        # Verify binary
        CHROMIUM_DIR=$(find "$BROWSER_CACHE" -maxdepth 1 -name 'chromium-*' -type d | head -1)
        if [ -n "$CHROMIUM_DIR" ]; then
            CHROME_BINARY="$CHROMIUM_DIR/chrome-linux/chrome"
            if [ -f "$CHROME_BINARY" ]; then
                CHROME_VERSION=$("$CHROME_BINARY" --version 2>/dev/null || echo "version check failed")
                echo "🔍 Chrome version: $CHROME_VERSION"
            fi
        fi
    else
        echo "❌ ERROR: Browser installation failed for $RUNNER_NAME"
        return 1
    fi

    echo ""
}

# ENTERPRISE PATTERN: Validate prerequisites
echo "🔍 Validating prerequisites..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js installed: $NODE_VERSION"
else
    echo "❌ ERROR: Node.js not found"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm installed: $NPM_VERSION"
else
    echo "❌ ERROR: npm not found"
    exit 1
fi

# Check disk space
AVAILABLE_SPACE=$(df -BG /opt | tail -1 | awk '{print $4}' | sed 's/G//')
echo "💾 Available disk space: ${AVAILABLE_SPACE}GB"
if [ "$AVAILABLE_SPACE" -lt 10 ]; then
    echo "⚠️  WARNING: Less than 10GB available disk space"
    echo "   Playwright browsers require ~400MB per installation"
    echo "   Continuing anyway..."
fi

echo ""

# ENTERPRISE PATTERN: Process all runners
RUNNERS=(
    "/opt/actions-runner"
    "/opt/actions-runner-2"
    "/opt/actions-runner-3"
    "/opt/actions-runner-4"
)

TOTAL_RUNNERS=${#RUNNERS[@]}
SUCCESS_COUNT=0
FAILED_COUNT=0

for RUNNER_DIR in "${RUNNERS[@]}"; do
    if [ -d "$RUNNER_DIR" ]; then
        if install_browsers_for_runner "$RUNNER_DIR"; then
            ((SUCCESS_COUNT++))
        else
            ((FAILED_COUNT++))
        fi
    else
        echo "⚠️  WARNING: Runner directory not found: $RUNNER_DIR"
        ((FAILED_COUNT++))
    fi
done

# ENTERPRISE PATTERN: Comprehensive summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Installation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total runners: $TOTAL_RUNNERS"
echo "✅ Successful installations: $SUCCESS_COUNT"
echo "❌ Failed installations: $FAILED_COUNT"
echo ""
echo "📋 Log file: $LOG_FILE"
echo "Completed: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "⚠️  WARNING: Some installations failed"
    exit 1
fi

echo "✅ All installations completed successfully"
exit 0
