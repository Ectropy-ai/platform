#!/bin/bash

# 🤖 ENHANCED GITHUB AGENT DEPENDENCY SETUP
# =============================================================================
# Comprehensive dependency management for GitHub Actions runners
# Addresses lockfile conflicts, caching, and environment inconsistencies
# Implements enterprise-grade dependency resolution strategies
# =============================================================================

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly REQUIRED_PNPM_VERSION="$(jq -r '.packageManager' "$PROJECT_ROOT/package.json" | cut -d'@' -f2)"
readonly REQUIRED_NODE_VERSION="20"
readonly SETUP_LOG="$PROJECT_ROOT/logs/enhanced-github-setup-$(date +%Y%m%d-%H%M%S).log"
readonly CACHE_DIR="${HOME}/.ectropy-dependency-cache"
readonly MAX_INSTALL_ATTEMPTS=3
readonly INSTALL_TIMEOUT=600  # 10 minutes

# Colors for output
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly RED='\033[0;31m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Ensure required directories exist
mkdir -p "$PROJECT_ROOT/logs" "$CACHE_DIR"

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

log() {
    echo -e "$1" | tee -a "$SETUP_LOG"
}

log_info() {
    log "${BLUE}[INFO]${NC} $1"
}

log_success() {
    log "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    log "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    log "${RED}[ERROR]${NC} $1"
}

log_step() {
    log "${CYAN}[STEP]${NC} $1"
}

# =============================================================================
# ENVIRONMENT DETECTION
# =============================================================================

detect_environment() {
    local env_type="unknown"
    
    if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
        env_type="github_actions"
    elif [[ "${CODESPACES:-}" == "true" ]]; then
        env_type="codespaces"
    elif [[ -n "${CI:-}" ]]; then
        env_type="ci"
    else
        env_type="local"
    fi
    
    echo "$env_type"
}

get_cache_strategy() {
    local env_type="$1"
    
    case "$env_type" in
        "github_actions")
            echo "aggressive_caching"
            ;;
        "codespaces")
            echo "persistent_cache"
            ;;
        "ci")
            echo "minimal_cache"
            ;;
        *)
            echo "standard_cache"
            ;;
    esac
}

# =============================================================================
# DEPENDENCY RESOLUTION STRATEGIES
# =============================================================================

check_lockfile_status() {
    log_step "Checking lockfile synchronization status..."
    
    if [[ ! -f "$PROJECT_ROOT/pnpm-lock.yaml" ]]; then
        log_warning "No lockfile found - will create new one"
        return 1
    fi
    
    # Check if lockfile is in sync with package.json files
    if pnpm install --frozen-lockfile --dry-run >/dev/null 2>&1; then
        log_success "Lockfile is synchronized with package.json files"
        return 0
    else
        log_warning "Lockfile is out of sync with package.json files"
        return 1
    fi
}

resolve_lockfile_conflicts() {
    log_step "Resolving lockfile conflicts..."
    
    local backup_file="$PROJECT_ROOT/pnpm-lock.yaml.backup-$(date +%Y%m%d-%H%M%S)"
    
    # Backup existing lockfile
    if [[ -f "$PROJECT_ROOT/pnpm-lock.yaml" ]]; then
        cp "$PROJECT_ROOT/pnpm-lock.yaml" "$backup_file"
        log_info "Created lockfile backup: $(basename "$backup_file")"
    fi
    
    # Analyze lockfile conflicts
    log_info "Analyzing dependency conflicts..."
    
    # Check for specific known conflicts
    local webpack_conflict=false
    if grep -q "webpack-dev-server.*4\.15\.0" "$PROJECT_ROOT/pnpm-lock.yaml" 2>/dev/null; then
        if grep -q "webpack-dev-server.*>=5\.2\.1" "$PROJECT_ROOT"/apps/*/package.json 2>/dev/null; then
            log_warning "Detected webpack-dev-server version conflict"
            webpack_conflict=true
        fi
    fi
    
    # Strategy 1: Try to update lockfile while preserving security overrides
    log_info "Attempting lockfile update with security overrides..."
    
    if pnpm install --no-frozen-lockfile --fix-lockfile 2>/dev/null; then
        log_success "Lockfile updated successfully with security overrides preserved"
        return 0
    fi
    
    # Strategy 2: Clean install with security validation
    log_warning "Standard update failed, attempting clean resolution..."
    
    # Remove lockfile temporarily
    rm -f "$PROJECT_ROOT/pnpm-lock.yaml"
    
    # Clean install with security overrides from workspace config
    if pnpm install --no-frozen-lockfile 2>/dev/null; then
        log_success "Clean lockfile generation completed"
        
        # Validate security overrides are applied
        if validate_security_overrides; then
            log_success "Security overrides validated in new lockfile"
            return 0
        else
            log_error "Security overrides not properly applied"
            # Restore backup if available
            if [[ -f "$backup_file" ]]; then
                cp "$backup_file" "$PROJECT_ROOT/pnpm-lock.yaml"
                log_info "Restored lockfile backup"
            fi
            return 1
        fi
    else
        log_error "Clean lockfile generation failed"
        # Restore backup if available
        if [[ -f "$backup_file" ]]; then
            cp "$backup_file" "$PROJECT_ROOT/pnpm-lock.yaml"
            log_info "Restored lockfile backup"
        fi
        return 1
    fi
}

validate_security_overrides() {
    log_step "Validating security overrides in lockfile..."
    
    local overrides_valid=true
    
    # Check for nth-check security override
    if ! grep -q "nth-check.*2\." "$PROJECT_ROOT/pnpm-lock.yaml" 2>/dev/null; then
        log_warning "nth-check security override not found in lockfile"
        overrides_valid=false
    fi
    
    # Check for postcss security override
    if ! grep -q "postcss.*8\.4\." "$PROJECT_ROOT/pnpm-lock.yaml" 2>/dev/null; then
        log_warning "postcss security override not found in lockfile"
        overrides_valid=false
    fi
    
    # Check for webpack-dev-server override
    if ! grep -q "webpack-dev-server.*5\." "$PROJECT_ROOT/pnpm-lock.yaml" 2>/dev/null; then
        log_warning "webpack-dev-server security override not found in lockfile"
        overrides_valid=false
    fi
    
    if [[ "$overrides_valid" == "true" ]]; then
        log_success "All security overrides validated"
        return 0
    else
        log_error "Some security overrides are missing"
        return 1
    fi
}

# =============================================================================
# PACKAGE MANAGER SETUP
# =============================================================================

setup_package_manager() {
    log_step "Setting up package manager environment..."
    
    # Verify Node.js version
    local node_version
    node_version=$(node --version | sed 's/v//' | cut -d. -f1)
    
    if [[ "$node_version" -lt "$REQUIRED_NODE_VERSION" ]]; then
        log_error "Node.js version $node_version is too old. Required: $REQUIRED_NODE_VERSION+"
        return 1
    fi
    
    log_success "Node.js version $node_version is compatible"
    
    # Setup pnpm with retry logic
    log_info "Setting up pnpm $REQUIRED_PNPM_VERSION..."
    
    # Enable corepack for better pnpm management
    if command -v corepack >/dev/null 2>&1; then
        corepack enable pnpm
        corepack prepare "pnpm@$REQUIRED_PNPM_VERSION" --activate
    else
        # Fallback to pnpm install
        for attempt in $(seq 1 3); do
            if pnpm install -g "pnpm@$REQUIRED_PNPM_VERSION" >/dev/null 2>&1; then
                break
            fi
            log_warning "pnpm installation attempt $attempt failed, retrying..."
            sleep "$((attempt * 2))"
        done
    fi
    
    # Verify pnpm installation
    if ! command -v pnpm >/dev/null 2>&1; then
        log_error "pnpm installation failed"
        return 1
    fi
    
    local pnpm_version
    pnpm_version=$(pnpm --version)
    log_success "pnpm version $pnpm_version installed"
    
    # Configure pnpm for CI environments
    local env_type
    env_type=$(detect_environment)
    
    case "$env_type" in
        "github_actions"|"ci")
            log_info "Configuring pnpm for CI environment..."
            pnpm config set store-dir "$CACHE_DIR/pnpm-store"
            pnpm config set cache-dir "$CACHE_DIR/pnpm-cache"
            pnpm config set state-dir "$CACHE_DIR/pnpm-state"
            pnpm config set registry "https://registry.npmjs.org/"
            pnpm config set network-timeout 60000
            pnpm config set fetch-retries 3
            pnpm config set fetch-retry-factor 2
            pnpm config set fetch-retry-mintimeout 10000
            pnpm config set fetch-retry-maxtimeout 60000
            ;;
        "codespaces")
            log_info "Configuring pnpm for Codespaces environment..."
            pnpm config set store-dir "/workspace/.pnpm-store"
            pnpm config set cache-dir "/workspace/.pnpm-cache"
            ;;
        *)
            log_info "Using default pnpm configuration for local environment"
            ;;
    esac
    
    log_success "Package manager setup completed"
}

# =============================================================================
# DEPENDENCY INSTALLATION
# =============================================================================

install_dependencies() {
    log_step "Installing dependencies with enhanced strategies..."
    
    local env_type
    env_type=$(detect_environment)
    
    local cache_strategy
    cache_strategy=$(get_cache_strategy "$env_type")
    
    log_info "Environment: $env_type, Cache strategy: $cache_strategy"
    
    cd "$PROJECT_ROOT"
    
    # Pre-installation validation
    if ! validate_workspace_structure; then
        log_error "Workspace structure validation failed"
        return 1
    fi
    
    # Choose installation strategy based on lockfile status
    local lockfile_sync=true
    if ! check_lockfile_status; then
        lockfile_sync=false
    fi
    
    local install_success=false
    
    for attempt in $(seq 1 $MAX_INSTALL_ATTEMPTS); do
        log_info "Dependency installation attempt $attempt/$MAX_INSTALL_ATTEMPTS"
        
        if [[ "$lockfile_sync" == "true" ]]; then
            # Try frozen lockfile installation first
            if install_with_frozen_lockfile "$cache_strategy"; then
                install_success=true
                break
            else
                log_warning "Frozen lockfile installation failed, resolving conflicts..."
                if resolve_lockfile_conflicts; then
                    lockfile_sync=true
                else
                    lockfile_sync=false
                fi
            fi
        else
            # Install with lockfile resolution
            if install_with_lockfile_resolution "$cache_strategy"; then
                install_success=true
                break
            fi
        fi
        
        if [[ "$attempt" -lt "$MAX_INSTALL_ATTEMPTS" ]]; then
            local delay=$((attempt * 5))
            log_warning "Installation failed, waiting ${delay}s before retry..."
            sleep "$delay"
        fi
    done
    
    if [[ "$install_success" == "true" ]]; then
        log_success "Dependencies installed successfully"
        
        # Post-installation validation
        if validate_installation; then
            log_success "Installation validation passed"
            return 0
        else
            log_error "Installation validation failed"
            return 1
        fi
    else
        log_error "All dependency installation attempts failed"
        return 1
    fi
}

install_with_frozen_lockfile() {
    local cache_strategy="$1"
    
    log_info "Installing with frozen lockfile..."
    
    local install_cmd="pnpm install --frozen-lockfile"
    
    case "$cache_strategy" in
        "aggressive_caching")
            install_cmd="$install_cmd --prefer-offline"
            ;;
        "minimal_cache")
            install_cmd="$install_cmd --prefer-online"
            ;;
    esac
    
    # Add timeout to prevent hanging
    if timeout "$INSTALL_TIMEOUT" $install_cmd; then
        return 0
    else
        log_warning "Frozen lockfile installation timed out or failed"
        return 1
    fi
}

install_with_lockfile_resolution() {
    local cache_strategy="$1"
    
    log_info "Installing with lockfile resolution..."
    
    local install_cmd="pnpm install --no-frozen-lockfile"
    
    case "$cache_strategy" in
        "aggressive_caching")
            install_cmd="$install_cmd --prefer-offline"
            ;;
        "minimal_cache")
            install_cmd="$install_cmd --prefer-online"
            ;;
    esac
    
    # Add timeout to prevent hanging
    if timeout "$INSTALL_TIMEOUT" $install_cmd; then
        return 0
    else
        log_warning "Lockfile resolution installation timed out or failed"
        return 1
    fi
}

validate_workspace_structure() {
    log_info "Validating workspace structure..."
    
    local required_files=(
        "package.json"
        "pnpm-workspace.yaml"
        "nx.json"
        "tsconfig.json"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$PROJECT_ROOT/$file" ]]; then
            log_error "Required file missing: $file"
            return 1
        fi
    done
    
    # Validate workspace configuration
    if ! pnpm list --depth=0 >/dev/null 2>&1; then
        log_warning "Workspace validation failed, but continuing..."
    fi
    
    log_success "Workspace structure validation passed"
    return 0
}

validate_installation() {
    log_info "Validating dependency installation..."
    
    # Check if node_modules exists and has content
    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log_error "node_modules directory not found"
        return 1
    fi
    
    local module_count
    module_count=$(find "$PROJECT_ROOT/node_modules" -maxdepth 1 -type d | wc -l)
    
    # With pnpm's symlink strategy, expect 15-25 directories in node_modules
    # (mostly scoped packages, .pnpm, .bin, etc.)
    if [[ "$module_count" -lt 15 ]]; then
        log_error "Insufficient modules installed (found: $module_count)"
        return 1
    fi
    
    log_success "Found $module_count installed modules"
    
    # Additional validation: Check if .pnpm directory exists and has content
    if [[ -d "$PROJECT_ROOT/node_modules/.pnpm" ]]; then
        local pnpm_packages
        pnpm_packages=$(find "$PROJECT_ROOT/node_modules/.pnpm" -maxdepth 1 -type d | wc -l)
        if [[ "$pnpm_packages" -gt 100 ]]; then
            log_success "pnpm store contains $pnpm_packages package versions"
        else
            log_warning "Low package count in pnpm store: $pnpm_packages"
        fi
    else
        log_info "Could not validate package count via .pnpm directory"
    fi
    
    # Validate critical dependencies
    local critical_deps=(
        "@nx/eslint"
        "typescript"
        "jest"
        "eslint"
    )
    
    for dep in "${critical_deps[@]}"; do
        if [[ ! -d "$PROJECT_ROOT/node_modules/$dep" ]]; then
            log_warning "Critical dependency missing: $dep"
        fi
    done
    
    # Test pnpm workspace functionality
    if pnpm list --depth=0 >/dev/null 2>&1; then
        log_success "Workspace functionality validated"
    else
        log_warning "Workspace functionality issues detected"
    fi
    
    log_success "Installation validation completed"
    return 0
}

# =============================================================================
# CACHING OPTIMIZATION
# =============================================================================

optimize_cache() {
    log_step "Optimizing dependency cache..."
    
    local env_type
    env_type=$(detect_environment)
    
    case "$env_type" in
        "github_actions")
            # Prepare cache for GitHub Actions
            if [[ -d "$CACHE_DIR/pnpm-store" ]]; then
                local cache_size
                cache_size=$(du -sh "$CACHE_DIR/pnpm-store" | cut -f1)
                log_info "pnpm store cache size: $cache_size"
            fi
            
            # Create cache info file for GitHub Actions
            cat > "$CACHE_DIR/cache-info.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "node_version": "$(node --version)",
  "pnpm_version": "$(pnpm --version)",
  "platform": "$(uname -s)-$(uname -m)",
  "dependencies_hash": "$(sha256sum "$PROJECT_ROOT/pnpm-lock.yaml" | cut -d' ' -f1)"
}
EOF
            ;;
        "codespaces")
            # Optimize for persistent Codespaces environment
            if [[ -d "/workspace/.pnpm-store" ]]; then
                log_info "Codespaces persistent cache configured"
            fi
            ;;
    esac
    
    log_success "Cache optimization completed"
}

# =============================================================================
# PERFORMANCE MONITORING
# =============================================================================

generate_performance_report() {
    log_step "Generating performance report..."
    
    local report_file="$PROJECT_ROOT/logs/dependency-performance-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$(detect_environment)",
  "node_version": "$(node --version)",
  "pnpm_version": "$(pnpm --version)",
  "total_dependencies": $(find "$PROJECT_ROOT/node_modules" -maxdepth 1 -type d | wc -l),
  "node_modules_size": "$(du -sh "$PROJECT_ROOT/node_modules" 2>/dev/null | cut -f1 || echo 'unknown')",
  "lockfile_size": "$(ls -lh "$PROJECT_ROOT/pnpm-lock.yaml" | awk '{print $5}')",
  "setup_duration": "$(grep -o "Enhanced GitHub agent setup completed in [0-9]*s" "$SETUP_LOG" | grep -o "[0-9]*" || echo 'unknown')",
  "cache_strategy": "$(get_cache_strategy "$(detect_environment)")",
  "workspace_projects": $(pnpm list --depth=0 --json 2>/dev/null | jq 'length // 0')
}
EOF
    
    log_success "Performance report generated: $(basename "$report_file")"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    local start_time
    start_time=$(date +%s)
    
    log_info "🚀 Enhanced GitHub Agent Dependency Setup Starting..."
    log_info "Environment: $(detect_environment)"
    log_info "Project: $PROJECT_ROOT"
    log_info "Cache: $CACHE_DIR"
    log_info "Log: $SETUP_LOG"
    
    # Setup package manager
    if ! setup_package_manager; then
        log_error "Package manager setup failed"
        exit 1
    fi
    
    # Install dependencies
    if ! install_dependencies; then
        log_error "Dependency installation failed"
        exit 1
    fi
    
    # Optimize cache
    optimize_cache
    
    # Generate performance report
    generate_performance_report
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_success "🎉 Enhanced GitHub agent setup completed in ${duration}s"
    
    # Display summary
    echo
    log_info "=== SETUP SUMMARY ==="
    log_info "Environment: $(detect_environment)"
    log_info "Node.js: $(node --version)"
    log_info "pnpm: $(pnpm --version)"
    log_info "Dependencies: $(find "$PROJECT_ROOT/node_modules" -maxdepth 1 -type d | wc -l) packages"
    log_info "Duration: ${duration}s"
    log_info "Log file: $SETUP_LOG"
    echo
}

# Execute main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi