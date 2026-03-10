#!/bin/bash
set -euo pipefail

echo "🎭 Enterprise Playwright Browser Fix v2.0"
echo "=========================================="

# Security: Verify we're in the right context
if [ ! -f "package.json" ] || [ ! -f "playwright.config.ts" ]; then
  echo "❌ Error: Must run from repository root with Playwright configuration"
  exit 1
fi

# Function to log with timestamp
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

log "🔍 Checking prerequisites..."

# Check Node.js
if ! command_exists node; then
  echo "❌ Node.js not found"
  exit 1
fi
log "✅ Node.js: $(node --version)"

# Check pnpm
if ! command_exists pnpm; then
  echo "❌ pnpm not found"
  exit 1
fi
log "✅ pnpm: $(pnpm --version)"

# Fix 1: Use Microsoft's CDN directly to avoid EPIPE errors
log "🌐 Setting Playwright download host to Microsoft CDN..."
export PLAYWRIGHT_DOWNLOAD_HOST=https://playwright.azureedge.net
export PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=60000
export PLAYWRIGHT_DOWNLOAD_PROGRESS_TIMEOUT=60000

# Fix 2: Install Playwright package if not present
log "📦 Checking Playwright installation..."
if ! pnpm exec playwright --version >/dev/null 2>&1; then
  log "📥 Installing Playwright..."
  pnpm add -D -w @playwright/test@1.54.1
fi

log "✅ Playwright installed: $(pnpm exec playwright --version)"

# Fix 3: Install browsers separately to avoid EPIPE - with retry logic
BROWSERS=("chromium" "firefox" "webkit")
for browser in "${BROWSERS[@]}"; do
  log "🌐 Installing $browser browser..."
  
  # Retry logic for browser installation
  for attempt in 1 2 3; do
    if pnpm exec playwright install "$browser" --force; then
      log "✅ $browser installed successfully"
      break
    else
      if [ $attempt -eq 3 ]; then
        log "❌ Failed to install $browser after 3 attempts"
        exit 1
      else
        log "⚠️ $browser installation failed, retrying (attempt $attempt/3)..."
        sleep $((attempt * 2))
      fi
    fi
  done
done

# Fix 4: Install system dependencies separately (if on Linux)
if [ "$(uname)" = "Linux" ]; then
  log "🐧 Installing Linux system dependencies..."
  
  # Check if we have sudo access
  if command_exists sudo && sudo -n true 2>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq \
      libatk-bridge2.0-0 \
      libxkbcommon-x11-0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libatspi2.0-0 \
      libdrm2 \
      libxss1 \
      libgtk-3-0
    log "✅ System dependencies installed"
  else
    log "⚠️ No sudo access - system dependencies may need manual installation"
  fi
fi

# Fix 5: Validate browser installation
log "🔍 Validating browser installation..."
VALIDATION_PASSED=true

for browser in "${BROWSERS[@]}"; do
  if find ~/.cache/ms-playwright -name "*${browser}*" -type d 2>/dev/null | grep -q .; then
    log "✅ $browser browser binaries found"
  else
    log "❌ $browser browser binaries not found"
    VALIDATION_PASSED=false
  fi
done

# Fix 6: Test basic functionality with timeout
log "🧪 Testing Playwright functionality..."
if timeout 60s pnpm exec playwright test --list >/dev/null 2>&1; then
  log "✅ Playwright can list tests successfully"
else
  log "❌ Playwright functionality test failed"
  VALIDATION_PASSED=false
fi

# Final validation
if [ "$VALIDATION_PASSED" = true ]; then
  log "🎉 Playwright browser installation completed successfully!"
  log "📋 Summary:"
  log "   - All browsers installed: ${BROWSERS[*]}"
  log "   - System dependencies checked"
  log "   - Basic functionality validated"
  exit 0
else
  log "❌ Playwright installation validation failed"
  log "💡 Try running with FORCE_REINSTALL=true to clean install"
  exit 1
fi