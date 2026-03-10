#!/bin/bash
# .devcontainer/compose-smoke-test.sh
# Quick smoke test for dev container configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log_info "🧪 Running dev container smoke test..."

# Test 1: Validate compose configuration
log_info "Test 1: Validating docker-compose configuration..."
if docker compose config --quiet; then
    log_success "Docker Compose configuration is valid"
else
    log_error "Docker Compose configuration is invalid"
    exit 1
fi

# Test 2: Check required files exist
log_info "Test 2: Checking required files..."
required_files=(
    "devcontainer.json"
    "docker-compose.yml"
    "Dockerfile.dev"
    ".env.dev"
    "post-create.sh"
    "validate-environment.sh"
)

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        log_success "Required file exists: $file"
    else
        log_error "Missing required file: $file"
        exit 1
    fi
done

# Test 3: Validate environment file syntax
log_info "Test 3: Validating .env.dev syntax..."
if grep -q "NODE_ENV=development" ".env.dev" && \
   grep -q "DATABASE_URL=" ".env.dev" && \
   grep -q "REDIS_URL=" ".env.dev"; then
    log_success ".env.dev contains required variables"
else
    log_error ".env.dev missing required variables"
    exit 1
fi

# Test 4: Check Dockerfile syntax
log_info "Test 4: Checking Dockerfile.dev syntax..."
if grep -q "FROM node:20-bullseye" "Dockerfile.dev" && \
   ! grep -q "<<<<<<< HEAD" "Dockerfile.dev" && \
   ! grep -q ">>>>>>> " "Dockerfile.dev"; then
    log_success "Dockerfile.dev syntax is clean"
else
    log_error "Dockerfile.dev has syntax issues or merge conflicts"
    exit 1
fi

# Test 5: Validate JSON syntax
log_info "Test 5: Validating devcontainer.json syntax..."
if command -v jq >/dev/null 2>&1; then
    if jq empty devcontainer.json >/dev/null 2>&1; then
        log_success "devcontainer.json syntax is valid"
    else
        log_error "devcontainer.json has invalid JSON syntax"
        exit 1
    fi
else
    log_warning "jq not available, skipping JSON validation"
fi

# Test 6: Check script permissions
log_info "Test 6: Checking script permissions..."
scripts=("post-create.sh" "validate-environment.sh")
for script in "${scripts[@]}"; do
    if [[ -x "$script" ]]; then
        log_success "$script is executable"
    else
        log_warning "$script is not executable, fixing..."
        chmod +x "$script"
        log_success "Fixed permissions for $script"
    fi
done

log_success "🎉 All smoke tests passed! Dev container configuration looks good."
log_info ""
log_info "Next steps:"
log_info "1. Open in VS Code with Dev Containers extension"
log_info "2. Or use GitHub Codespaces"
log_info "3. Run 'bash .devcontainer/validate-environment.sh' after container starts"
