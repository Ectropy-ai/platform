#!/bin/bash
# Enhanced Sharp Configuration Script for Ectropy CI/CD
# Comprehensive solution for Sharp and native dependency issues

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}🔧 $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}" >&2; }

echo "🔧 Enhanced Sharp Configuration for CI/CD"
echo "========================================"

# Environment setup for native builds
setup_build_environment() {
    log_info "Setting up build environment for native modules..."
    
    # Detect platform and architecture
    local platform="linux"
    local arch="x64"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        platform="darwin"
        if [[ "$(uname -m)" == "arm64" ]]; then
            arch="arm64"
        fi
    fi
    
    # Set platform-specific environment variables
    export PLATFORM="$platform"
    export ARCH="$arch"
    
    # Set pkg-config environment for proper glib-2.0 detection
    export PKG_CONFIG_PATH="/usr/lib/x86_64-linux-gnu/pkgconfig:/usr/share/pkgconfig:/usr/lib/pkgconfig"
    export CPPFLAGS="$(pkg-config --cflags glib-2.0 2>/dev/null || echo '')"
    export LDFLAGS="$(pkg-config --libs glib-2.0 2>/dev/null || echo '')"
    
    # Sharp-specific environment variables
    export SHARP_IGNORE_GLOBAL_LIBVIPS=1
    export SHARP_BINARY_HOST=https://sharp.pixelplumbing.com
    export SHARP_FORCE_GLOBAL_LIBVIPS=0
    
    # Memory optimization for CI environments
    export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"
    
    log_success "Build environment configured for $platform-$arch"
}

# Install system dependencies if needed
install_system_dependencies() {
    log_info "Checking and installing system dependencies..."
    
    # Check if running in CI or container environment
    if [[ "${CI:-false}" == "true" ]] || [[ -f "/.dockerenv" ]]; then
        log_info "CI/Container environment detected, installing system dependencies..."
        
        # Update package lists
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update -qq
            
            # Install build essentials and image processing libraries
            sudo apt-get install -y \
                build-essential \
                libvips-dev \
                libcairo2-dev \
                libjpeg-dev \
                libpango1.0-dev \
                libgif-dev \
                libglib2.0-dev \
                librsvg2-dev \
                pkg-config \
                python3 \
                g++ \
                make
                
            log_success "System dependencies installed"
        else
            log_warning "apt-get not available, skipping system dependency installation"
        fi
    else
        log_info "Local development environment detected, assuming dependencies are available"
    fi
    
    # Verify critical dependencies
    if pkg-config --exists glib-2.0; then
        log_success "glib-2.0 development headers found"
    else
        log_warning "glib-2.0 development headers not found - Sharp may fail to build"
    fi
}

# Verify dependency installation
verify_dependency() {
    local dep_name="$1"
    local verification_code="$2"
    
    log_info "Verifying $dep_name installation..."
    
    if node -e "$verification_code" >/dev/null 2>&1; then
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
    rm -rf node_modules/sharp/build 2>/dev/null || true
    
    # Strategy 1: npm rebuild with comprehensive flags
    log_info "Strategy 1: npm rebuild with platform targeting..."
    if npm rebuild sharp \
        --platform="$PLATFORM" \
        --arch="$ARCH" \
        --ignore-scripts=false \
        --foreground-scripts \
        --sharp-binary-host="$SHARP_BINARY_HOST" \
        --verbose; then
        log_success "Strategy 1: npm rebuild completed successfully"
        return 0
    else
        log_warning "Strategy 1: npm rebuild failed with exit code $?"
    fi
    
    # Strategy 2: pnpm rebuild
    log_info "Strategy 2: pnpm rebuild with native compilation..."
    if pnpm rebuild sharp --config.ignore-scripts=false; then
        log_success "Strategy 2: pnpm rebuild completed successfully"
        return 0
    else
        log_warning "Strategy 2: pnpm rebuild failed with exit code $?"
    fi
    
    # Strategy 3: Force reinstall
    log_info "Strategy 3: Force reinstall Sharp from scratch..."
    if pnpm remove sharp && pnpm add sharp@^0.34.3; then
        log_success "Strategy 3: Force reinstall completed successfully"
        return 0
    else
        log_warning "Strategy 3: Force reinstall failed with exit code $?"
    fi
    
    # Strategy 4: Build from source (last resort)
    log_info "Strategy 4: Building Sharp from source..."
    if npm install sharp --build-from-source; then
        log_success "Strategy 4: Build from source completed successfully"
        return 0
    else
        log_warning "Strategy 4: Build from source failed with exit code $?"
    fi
    
    log_error "All Sharp rebuild strategies failed"
    return 1
}

# Rebuild @xenova/transformers if present
rebuild_transformers() {
    if [ -d "node_modules/@xenova/transformers" ]; then
        log_info "Rebuilding @xenova/transformers..."
        if pnpm rebuild @xenova/transformers --config.ignore-scripts=false; then
            log_success "@xenova/transformers rebuilt successfully"
        else
            log_warning "@xenova/transformers rebuild failed, but continuing..."
        fi
    else
        log_info "@xenova/transformers not found, skipping"
    fi
}

# Comprehensive verification
verify_all_dependencies() {
    log_info "Performing comprehensive dependency verification..."
    
    local verification_failed=false
    
    # Verify Sharp
    if verify_dependency "Sharp" "const sharp = await import('sharp'); console.log('Sharp OK');"; then
        log_success "Sharp verification: ✓ PASSED"
    else
        log_error "Sharp verification: ✗ FAILED"
        verification_failed=true
    fi
    
    # Verify @xenova/transformers if present
    if [ -d "node_modules/@xenova/transformers" ]; then
        if verify_dependency "@xenova/transformers" "const transformers = await import('@xenova/transformers'); console.log('Transformers OK');"; then
            log_success "@xenova/transformers verification: ✓ PASSED"
        else
            log_error "@xenova/transformers verification: ✗ FAILED"
            verification_failed=true
        fi
    fi
    
    # Additional native modules check
    if verify_dependency "Native modules" "
        const modules = ['sharp'];
        for (const mod of modules) {
            try { await import(mod); } catch(e) { throw new Error(\`Failed to load \${mod}: \${e.message}\`); }
        }
        console.log('All native modules OK');
    "; then
        log_success "Native modules verification: ✓ PASSED"
    else
        log_error "Native modules verification: ✗ FAILED"
        verification_failed=true
    fi
    
    if [ "$verification_failed" = true ]; then
        log_error "Some dependency verifications failed"
        return 1
    else
        log_success "All dependency verifications passed"
        return 0
    fi
}

# Performance test for Sharp
performance_test() {
    log_info "Running Sharp performance test..."
    
    if node --input-type=module -e "
        const sharp = await import('sharp');
        const start = Date.now();
        
        // Create a simple test image and resize it
        sharp({
            create: {
                width: 100,
                height: 100,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        })
        .resize(50, 50)
        .jpeg()
        .toBuffer((err, data) => {
            if (err) {
                console.error('Performance test failed:', err.message);
                process.exit(1);
            }
            const duration = Date.now() - start;
            console.log(\`Sharp performance test passed in \${duration}ms\`);
            process.exit(0);
        });
    " 2>/dev/null; then
        log_success "Sharp performance test: ✓ PASSED"
        return 0
    else
        log_warning "Sharp performance test: ✗ FAILED (functionality may still work)"
        return 1
    fi
}

# Generate diagnostic report
generate_diagnostic_report() {
    log_info "Generating diagnostic report..."
    
    local report_file="$PROJECT_ROOT/reports/sharp-diagnostic-$(date +%Y%m%d_%H%M%S).txt"
    mkdir -p "$(dirname "$report_file")"
    
    cat > "$report_file" << EOF
Sharp Diagnostic Report
======================
Generated: $(date)
Platform: $PLATFORM-$ARCH
Project: Ectropy Platform

Environment Variables:
- SHARP_BINARY_HOST: $SHARP_BINARY_HOST
- SHARP_IGNORE_GLOBAL_LIBVIPS: $SHARP_IGNORE_GLOBAL_LIBVIPS
- PKG_CONFIG_PATH: $PKG_CONFIG_PATH
- NODE_OPTIONS: $NODE_OPTIONS

System Information:
- OS: $(uname -a)
- Node.js: $(node --version)
- npm: $(npm --version)
- pnpm: $(pnpm --version 2>/dev/null || echo "not available")

Sharp Information:
EOF

    # Add Sharp version info if available
    if node --input-type=module -e "const sharp = await import('sharp'); console.log(JSON.stringify(sharp.default.versions, null, 2))" 2>/dev/null >> "$report_file"; then
        echo "Sharp versions added to report"
    else
        echo "Sharp not available" >> "$report_file"
    fi
    
    log_success "Diagnostic report generated: $report_file"
}

# Main execution
main() {
    cd "$PROJECT_ROOT"
    
    log_info "Starting enhanced Sharp configuration..."
    
    # Step 1: Setup environment
    setup_build_environment
    
    # Step 2: Install system dependencies
    install_system_dependencies
    
    # Step 3: Rebuild Sharp
    if rebuild_sharp; then
        log_success "Sharp rebuild completed successfully"
    else
        log_error "Sharp rebuild failed - attempting fallback strategies"
        
        # Fallback: Try downloading prebuilt binaries
        log_info "Fallback: Attempting to download prebuilt Sharp binaries..."
        if npm install --force sharp; then
            log_success "Fallback: Prebuilt Sharp installation succeeded"
        else
            log_error "Fallback: All Sharp installation strategies failed"
            generate_diagnostic_report
            exit 1
        fi
    fi
    
    # Step 4: Rebuild other native dependencies
    rebuild_transformers
    
    # Step 5: Comprehensive verification
    if verify_all_dependencies; then
        log_success "All native dependencies verified successfully"
    else
        log_error "Some native dependencies failed verification"
        generate_diagnostic_report
        exit 1
    fi
    
    # Step 6: Performance test
    performance_test || log_warning "Performance test failed but basic functionality verified"
    
    # Step 7: Generate diagnostic report
    generate_diagnostic_report
    
    log_success "Enhanced Sharp configuration completed successfully!"
    echo ""
    echo "🎉 All native dependencies are now properly configured for CI/CD"
    echo "📊 Check the diagnostic report for detailed information"
}

# Script arguments handling
case "${1:-}" in
    --verify-only)
        log_info "Running verification only..."
        cd "$PROJECT_ROOT"
        setup_build_environment
        verify_all_dependencies
        exit $?
        ;;
    --rebuild-only)
        log_info "Running rebuild only..."
        cd "$PROJECT_ROOT"
        setup_build_environment
        rebuild_sharp
        exit $?
        ;;
    --performance-test)
        log_info "Running performance test only..."
        cd "$PROJECT_ROOT"
        performance_test
        exit $?
        ;;
    --help)
        echo "Usage: $0 [OPTIONS]"
        echo "Options:"
        echo "  --verify-only      Run verification checks only"
        echo "  --rebuild-only     Run Sharp rebuild only"
        echo "  --performance-test Run performance test only"
        echo "  --help            Show this help message"
        exit 0
        ;;
    "")
        # Run full configuration
        main
        ;;
    *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac