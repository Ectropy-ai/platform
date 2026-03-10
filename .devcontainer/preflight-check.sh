#!/bin/bash
# .devcontainer/preflight-check.sh - Enterprise Pre-Flight Validation
# Implements Step 1 from enterprise best practices

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}🔍 [PREFLIGHT]${NC} $1"; }
log_success() { echo -e "${GREEN}✅ [PREFLIGHT]${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠️ [PREFLIGHT]${NC} $1"; }
log_error() { echo -e "${RED}❌ [PREFLIGHT]${NC} $1"; }

# Global status tracking
PREFLIGHT_ERRORS=0
PREFLIGHT_WARNINGS=0

# Function to record check results
record_check() {
    local status="$1"
    local message="$2"
    
    if [ "$status" = "ERROR" ]; then
        PREFLIGHT_ERRORS=$((PREFLIGHT_ERRORS + 1))
        log_error "$message"
    elif [ "$status" = "WARNING" ]; then
        PREFLIGHT_WARNINGS=$((PREFLIGHT_WARNINGS + 1))
        log_warning "$message"
    else
        log_success "$message"
    fi
}

echo "🔍 Running pre-flight checks..."
echo "========================================"

# Check Docker daemon
log_info "Checking Docker daemon..."
if docker info >/dev/null 2>&1; then
    record_check "SUCCESS" "Docker daemon is running"
    
    # Check Docker version compatibility
    DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")
    log_info "Docker version: $DOCKER_VERSION"
    
    # Check if Docker daemon has sufficient resources
    if docker system df >/dev/null 2>&1; then
        record_check "SUCCESS" "Docker system is accessible"
    else
        record_check "WARNING" "Docker system df command failed"
    fi
else
    record_check "ERROR" "Docker daemon not running"
fi

# Validate compose files
log_info "Validating Docker Compose configuration..."
COMPOSE_FILE=".devcontainer/docker-compose.yml"

if [ -f "$COMPOSE_FILE" ]; then
    if docker compose -f "$COMPOSE_FILE" config >/dev/null 2>&1; then
        record_check "SUCCESS" "Docker Compose configuration is valid"
    else
        record_check "ERROR" "Invalid Docker Compose configuration"
        log_info "Run: docker compose -f $COMPOSE_FILE config"
    fi
else
    record_check "ERROR" "Docker Compose file not found: $COMPOSE_FILE"
fi

# Check disk space (minimum 10GB required)
log_info "Checking disk space..."
if command -v df >/dev/null 2>&1; then
    # Get available space in KB
    available=$(df /workspace 2>/dev/null | awk 'NR==2 {print $4}' || df / | awk 'NR==2 {print $4}')
    min_required=10485760  # 10GB in KB
    
    if [ "$available" -gt "$min_required" ]; then
        available_gb=$((available / 1024 / 1024))
        record_check "SUCCESS" "Sufficient disk space: ${available_gb}GB available"
    else
        available_gb=$((available / 1024 / 1024))
        record_check "WARNING" "Low disk space: ${available_gb}GB available (minimum 10GB recommended)"
    fi
else
    record_check "WARNING" "Cannot check disk space - df command not available"
fi

# Check memory (minimum 4GB recommended)
log_info "Checking available memory..."
if command -v free >/dev/null 2>&1; then
    # Get available memory in MB
    available_mem=$(free -m | awk '/^Mem:/ {print $7}' || echo "0")
    min_mem=4096  # 4GB in MB
    
    if [ "$available_mem" -gt "$min_mem" ]; then
        record_check "SUCCESS" "Sufficient memory: ${available_mem}MB available"
    else
        record_check "WARNING" "Low memory: ${available_mem}MB available (minimum 4GB recommended)"
    fi
else
    record_check "WARNING" "Cannot check memory - free command not available"
fi

# Check Node.js and package managers
log_info "Checking Node.js toolchain..."

if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    if [[ "$NODE_VERSION" =~ v20\. ]]; then
        record_check "SUCCESS" "Node.js version: $NODE_VERSION"
    else
        record_check "WARNING" "Node.js version ($NODE_VERSION) - v20.x recommended"
    fi
else
    record_check "ERROR" "Node.js not found"
fi

if command -v pnpm >/dev/null 2>&1; then
    PNPM_VERSION=$(pnpm --version)
    if [[ "$PNPM_VERSION" =~ ^10\. ]]; then
        record_check "SUCCESS" "pnpm version: $PNPM_VERSION"
    else
        record_check "WARNING" "pnpm version ($PNPM_VERSION) - v10.x recommended"
    fi
else
    record_check "WARNING" "pnpm not found - will be installed during setup"
fi

# Check environment files
log_info "Checking environment configuration..."

if [ -f ".devcontainer/.env.dev" ]; then
    record_check "SUCCESS" "Development environment file exists"
else
    record_check "WARNING" "Development environment file missing (.devcontainer/.env.dev)"
fi

if [ -f ".env" ]; then
    record_check "SUCCESS" "Main environment file exists"
else
    record_check "WARNING" "Main environment file missing (.env) - will be created"
fi

# Check for required directories
log_info "Checking workspace structure..."

required_dirs=("apps" "libs" "scripts" ".devcontainer")
for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        record_check "SUCCESS" "Required directory exists: $dir"
    else
        record_check "ERROR" "Required directory missing: $dir"
    fi
done

# Check for essential files
essential_files=("package.json" "pnpm-lock.yaml" "nx.json")
for file in "${essential_files[@]}"; do
    if [ -f "$file" ]; then
        record_check "SUCCESS" "Essential file exists: $file"
    else
        record_check "ERROR" "Essential file missing: $file"
    fi
done

# Check network connectivity (GitHub)
log_info "Checking network connectivity..."
if curl -s --connect-timeout 5 https://registry.npmjs.org >/dev/null 2>&1; then
    record_check "SUCCESS" "NPM registry accessible"
else
    record_check "WARNING" "NPM registry not accessible - check network connectivity"
fi

# Check for conflicting processes
log_info "Checking for port conflicts..."
conflicting_ports=(3000 3001 3002 4000 4200 5432 6379 6333)
for port in "${conflicting_ports[@]}"; do
    if command -v lsof >/dev/null 2>&1 && lsof -i ":$port" >/dev/null 2>&1; then
        record_check "WARNING" "Port $port is already in use"
    elif command -v netstat >/dev/null 2>&1 && netstat -ln 2>/dev/null | grep ":$port " >/dev/null; then
        record_check "WARNING" "Port $port is already in use"
    fi
done

# Summary
echo "========================================"
log_info "Pre-flight check summary:"

if [ $PREFLIGHT_ERRORS -eq 0 ] && [ $PREFLIGHT_WARNINGS -eq 0 ]; then
    log_success "✅ Pre-flight checks passed - environment ready"
    exit 0
elif [ $PREFLIGHT_ERRORS -eq 0 ]; then
    log_warning "⚠️ Pre-flight checks completed with $PREFLIGHT_WARNINGS warnings"
    log_info "Environment is usable but some optimizations recommended"
    exit 0
else
    log_error "❌ Pre-flight checks failed with $PREFLIGHT_ERRORS errors and $PREFLIGHT_WARNINGS warnings"
    log_error "Critical issues must be resolved before proceeding"
    exit 1
fi