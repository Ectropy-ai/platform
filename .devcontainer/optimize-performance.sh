#!/bin/bash
# .devcontainer/optimize-performance.sh
set -e

log_info() { echo "⚡ [PERFORMANCE] $1"; }
log_success() { echo "✅ [PERFORMANCE] $1"; }

log_info "Optimizing development environment performance..."

# Node.js performance tuning
log_info "Configuring Node.js performance settings..."
export NODE_OPTIONS="--max-old-space-size=4096 --experimental-vm-modules"

# PNPM performance configuration
log_info "Optimizing PNPM configuration..."
su - vscode -c "
  export PNPM_HOME='/home/vscode/.local/share/pnpm'
  export PATH='\$PNPM_HOME:\$PATH'
  
  # Performance optimizations
  pnpm config set network-timeout 300000
  pnpm config set fetch-retries 3
  pnpm config set fetch-retry-factor 2
  pnpm config set fetch-retry-mintimeout 10000
  pnpm config set fetch-retry-maxtimeout 60000
  
  # Enable linking for faster installs
  pnpm config set prefer-symlinked-executables false
  pnpm config set hoist-pattern '*'
  
  # Cache optimization
  pnpm config set verify-store-integrity false
  pnpm config set package-import-method copy
"

# Workspace optimization
log_info "Optimizing workspace configuration..."
cd /workspace

# Pre-compile TypeScript for faster startups
if [ -f "tsconfig.json" ]; then
  log_info "Pre-compiling TypeScript..."
  su - vscode -c "
    export PNPM_HOME='/home/vscode/.local/share/pnpm'
    export PATH='\$PNPM_HOME:\$PATH'
    cd /workspace
    
    # Build only if needed
    if [ ! -d 'dist' ] || [ 'src' -nt 'dist' ]; then
      pnpm nx build --all --skip-nx-cache=false
    fi
  "
fi

# System performance tuning
log_info "Applying system performance tuning..."
# Increase file watches for development
echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p 2>/dev/null || true

log_success "Performance optimization completed!"