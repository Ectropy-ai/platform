#!/bin/bash
# .devcontainer/security-hardening.sh
set -e

log_info() { echo "🔒 [SECURITY] $1"; }
log_success() { echo "✅ [SECURITY] $1"; }

log_info "Applying enterprise security hardening..."

# Remove global package managers with elevated privileges
log_info "Removing global npm/pnpm with sudo access..."
sudo npm uninstall -g npm 2>/dev/null || true
sudo rm -rf /usr/local/lib/node_modules/npm 2>/dev/null || true
sudo rm -rf /usr/local/share/pnpm* 2>/dev/null || true

# Secure file permissions
log_info "Setting secure file permissions..."
chmod 755 /workspace
find /workspace -type f -name "*.sh" -exec chmod +x {} \;
find /workspace -type f -name "*.json" -exec chmod 644 {} \;
find /workspace -type f -name "*.ts" -exec chmod 644 {} \;

# NPM security configuration
log_info "Configuring NPM security settings..."
su - vscode -c "
  npm config set audit-level moderate
  npm config set fund false
  npm config set save-exact true
  npm config set engine-strict true
"

# Git security configuration
log_info "Configuring Git security..."
su - vscode -c "
  git config --global core.autocrlf input
  git config --global core.fileMode false
  git config --global init.defaultBranch main
  git config --global pull.rebase false
"

# Environment variable validation
log_info "Validating environment variables..."
REQUIRED_VARS=("NODE_ENV" "PNPM_HOME" "MCP_SERVER_URL")
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    log_error "Required environment variable $var is not set"
    exit 1
  fi
done

log_success "Security hardening completed!"