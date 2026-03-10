#!/bin/bash
# Centralized Native Dependency Rebuild Script
# Consolidates Sharp and @xenova/transformers rebuild logic
# Addresses redundancy identified in enterprise monorepo optimization strategy

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Logging functions
log_info() { echo "🔧 $1"; }
log_success() { echo "✅ $1"; }
log_error() { echo "❌ $1" >&2; }
log_warning() { echo "⚠️ $1" >&2; }

# Environment setup for native builds
setup_build_environment() {
    log_info "Setting up build environment for native modules..."
    
    # Set pkg-config environment for proper glib-2.0 detection
    export PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig
    export CPPFLAGS="$(pkg-config --cflags glib-2.0 2>/dev/null || echo '')"
    export LDFLAGS="$(pkg-config --libs glib-2.0 2>/dev/null || echo '')"
    
    # Sharp-specific environment variables
    export SHARP_IGNORE_GLOBAL_LIBVIPS=1
    export SHARP_BINARY_HOST=https://sharp.pixelplumbing.com
    
    # Platform detection
    local platform="linux"
    local arch="x64"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        platform="darwin"
        if [[ "$(uname -m)" == "arm64" ]]; then
            arch="arm64"
        fi
    fi
    
    export PLATFORM="$platform"
    export ARCH="$arch"
    
    log_success "Build environment configured for $platform-$arch"
}

# Verify dependency installation
verify_dependency() {
    local dep_name="$1"
    local verification_code="$2"
    
    log_info "Verifying $dep_name installation..."
    
    if node -e "$verification_code" 2>/dev/null; then
        log_success "$dep_name verification successful"
        return 0
    else
        log_warning "$dep_name verification failed"
        return 1
    fi
}

# Comprehensive Sharp rebuild with enterprise fallback strategies
rebuild_sharp() {
    log_info "Rebuilding Sharp library with comprehensive flags..."
    log_info "Platform: $PLATFORM, Architecture: $ARCH"
    log_info "Sharp binary host: $SHARP_BINARY_HOST"
    
    # Clean any existing Sharp binaries
    log_info "Cleaning existing Sharp binaries..."
    rm -rf node_modules/sharp/vendor 2>/dev/null || true
    
    # Primary rebuild attempt with explicit platform targeting
    log_info "Attempting primary Sharp rebuild..."
    if npm rebuild sharp \
        --platform="$PLATFORM" \
        --arch="$ARCH" \
        --ignore-scripts=false \
        --foreground-scripts \
        --sharp-binary-host="$SHARP_BINARY_HOST"; then
        log_success "Primary Sharp rebuild completed successfully"
        return 0
    else
        log_warning "Primary Sharp rebuild failed with exit code $?"
    fi
    
    # Fallback strategy 1: Use pnpm rebuild
    log_warning "Primary rebuild failed, attempting fallback with pnpm..."
    if pnpm rebuild sharp --platform="$PLATFORM" --arch="$ARCH"; then
        log_success "Fallback pnpm Sharp rebuild completed"
        return 0
    else
        log_warning "pnpm Sharp rebuild failed with exit code $?"
    fi
    
    # Fallback strategy 2: Manual binary download
    log_warning "pnpm rebuild failed, attempting manual binary update..."
    if npm rebuild sharp --update-binary; then
        log_success "Manual binary update completed"
        return 0
    fi
    
    # Final fallback: Continue with warning
    log_error "All Sharp rebuild attempts failed"
    if [ "${FAIL_ON_SHARP_ERROR:-false}" = "true" ]; then
        log_error "FAIL_ON_SHARP_ERROR is true, exiting..."
        return 1
    else
        log_warning "Continuing despite Sharp failure (enterprise resilience mode)"
        return 0
    fi
}

# Rebuild @xenova/transformers dependencies
rebuild_transformers() {
    log_info "Rebuilding @xenova/transformers dependencies..."
    
    # Comprehensive rebuild with scripts enabled
    pnpm rebuild --config.ignore-scripts=false || {
        log_warning "General rebuild failed, but continuing..."
        return 1
    }
    
    log_success "Transformers dependencies rebuild completed"
}

# Full native dependency rebuild process
rebuild_native_dependencies() {
    log_info "Starting comprehensive native dependency rebuild..."
    
    cd "$PROJECT_ROOT"
    
    # Setup environment
    setup_build_environment
    
    # Purge caches and start fresh if needed
    if [ "${FORCE_CLEAN:-false}" = "true" ]; then
        log_info "Force clean requested - removing node_modules and caches..."
        rm -rf node_modules ~/.cache/pnpm
        pnpm install --frozen-lockfile --prefer-offline
    fi
    
    # Verify current state
    local sharp_needs_rebuild=false
    local transformers_needs_rebuild=false
    
    if ! verify_dependency "Sharp" "require('sharp'); console.log('Sharp OK');"; then
        sharp_needs_rebuild=true
    fi
    
    if ! verify_dependency "@xenova/transformers" "require('@xenova/transformers'); console.log('Transformers OK');"; then
        transformers_needs_rebuild=true
    fi
    
    # Rebuild only what's needed (unless FORCE_REBUILD is set)
    if [ "${FORCE_REBUILD:-false}" = "true" ] || [ "$sharp_needs_rebuild" = "true" ]; then
        rebuild_sharp
    fi
    
    if [ "${FORCE_REBUILD:-false}" = "true" ] || [ "$transformers_needs_rebuild" = "true" ]; then
        rebuild_transformers
    fi
    
    # Final verification
    log_info "Performing final verification of all dependencies..."
    
    local verification_failed=false
    
    if ! verify_dependency "Sharp" "require('sharp'); console.log('✅ Sharp verification successful');"; then
        log_error "Sharp final verification failed"
        verification_failed=true
    fi
    
    if ! verify_dependency "@xenova/transformers" "require('@xenova/transformers'); console.log('✅ @xenova/transformers verification successful');"; then
        log_error "@xenova/transformers final verification failed"
        verification_failed=true
    fi
    
    if [ "$verification_failed" = "true" ]; then
        log_error "Native dependency rebuild completed with verification failures"
        if [ "${FAIL_ON_VERIFICATION_ERROR:-true}" = "true" ]; then
            return 1
        else
            log_warning "Continuing despite verification failures (FAIL_ON_VERIFICATION_ERROR=false)"
        fi
    else
        log_success "All native dependencies verified successfully"
    fi
}

# Install system dependencies (if needed)
install_system_dependencies() {
    log_info "Checking system dependencies for native modules..."
    
    # Only attempt if running with sudo capabilities
    if command -v apt-get >/dev/null 2>&1 && [ "${INSTALL_SYSTEM_DEPS:-false}" = "true" ]; then
        log_info "Installing system dependencies..."
        sudo apt-get update
        sudo apt-get install -y \
            build-essential \
            libvips-dev \
            libcairo2-dev \
            libjpeg-dev \
            libpango1.0-dev \
            libgif-dev \
            libglib2.0-dev \
            librsvg2-dev \
            pkg-config
        log_success "System dependencies installed"
        
        # Verify glib-2.0 installation as recommended in problem statement
        log_info "Verifying libglib2.0-dev installation..."
        if pkg-config --exists glib-2.0; then
            log_success "glib-2.0 found and properly configured"
        else
            log_warning "glib-2.0 not found or not properly configured"
        fi
    else
        log_info "Skipping system dependency installation (not available or not requested)"
    fi
}

# Print usage information
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Centralized native dependency rebuild script for Sharp and @xenova/transformers.

OPTIONS:
    -h, --help              Show this help message
    -f, --force-rebuild     Force rebuild all dependencies regardless of verification status
    -c, --force-clean       Remove node_modules and reinstall before rebuilding
    -s, --install-system    Install system dependencies (requires sudo)
    --continue-on-error     Continue even if verification fails

ENVIRONMENT VARIABLES:
    FORCE_REBUILD               Force rebuild all dependencies (true/false)
    FORCE_CLEAN                 Force clean install (true/false)
    INSTALL_SYSTEM_DEPS         Install system dependencies (true/false)
    FAIL_ON_VERIFICATION_ERROR  Fail if verification fails (true/false, default: true)

EXAMPLES:
    $0                          # Standard rebuild (only rebuild if verification fails)
    $0 --force-rebuild          # Force rebuild all dependencies
    $0 --force-clean            # Clean install and rebuild
    $0 --install-system         # Install system deps and rebuild
    
EOF
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -f|--force-rebuild)
                export FORCE_REBUILD=true
                shift
                ;;
            -c|--force-clean)
                export FORCE_CLEAN=true
                shift
                ;;
            -s|--install-system)
                export INSTALL_SYSTEM_DEPS=true
                shift
                ;;
            --continue-on-error)
                export FAIL_ON_VERIFICATION_ERROR=false
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    log_info "Starting centralized native dependency rebuild..."
    log_info "Current timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    
    # Guard: Ensure this script runs only after pnpm install completes
    if [ ! -d "node_modules" ]; then
        log_error "node_modules directory not found"
        log_error "This script must be run after 'pnpm install' completes successfully"
        log_error "Please run 'pnpm install --frozen-lockfile' first and then retry this script"
        exit 1
    fi
    
    # Verify critical dependencies are available
    if [ ! -d "node_modules/.pnpm" ]; then
        log_warning "pnpm store directory not found - dependencies may not be properly installed"
    fi
    
    log_info "✅ Dependency directory verification passed - proceeding with native rebuilds"
    
    parse_arguments "$@"
    
    # Setup build environment (initializes PLATFORM and ARCH)
    setup_build_environment
    
    log_info "Platform: $PLATFORM, Architecture: $ARCH"
    
    # Install system dependencies if requested
    install_system_dependencies
    
    # Perform the rebuild
    rebuild_native_dependencies
    
    log_success "Native dependency rebuild process completed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# Enhanced error handling with timestamps and context
trap 'log_error "Native dependency rebuild failed with exit code $? at $(date -u +%Y-%m-%dT%H:%M:%SZ)"; log_error "Failed command context: ${BASH_COMMAND}"; exit $?' ERR

# Execute main function
main "$@"