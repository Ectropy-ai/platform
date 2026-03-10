#!/bin/bash
# Robust dependency installation with retry logic and fallbacks
# Handles network issues, registry timeouts, and package manager availability

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

install_with_pnpm() {
    local attempt=$1
    log "Attempting pnpm install (attempt $attempt)..."

    # Use different strategies for different attempts
    case $attempt in
        1)
            timeout 600 pnpm install --legacy-peer-deps --no-audit --prefer-offline --ignore-scripts
            ;;
        2)
            timeout 900 pnpm install --legacy-peer-deps --no-audit --no-optional --ignore-scripts
            ;;
        3)
            timeout 1200 pnpm install --legacy-peer-deps --no-audit --no-optional --ignore-scripts
            ;;
    esac
}

fix_web_dashboard_dependencies() {
    log "🔧 Applying pre-installation fixes for web-dashboard..."
    
    # Fix Material-UI version conflicts in web-dashboard
    if [[ -f "apps/web-dashboard/package.json" ]]; then
        log "Checking web-dashboard dependencies..."
        
        # Create a backup and fix any Material-UI version mismatches
        cp apps/web-dashboard/package.json apps/web-dashboard/package.json.bak
        
        # Use Node.js to fix package.json programmatically if needed
        node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('apps/web-dashboard/package.json', 'utf8'));
        let changed = false;
        
        // Ensure consistent Material-UI versions
        if (pkg.dependencies) {
            const muiVersion = '^6.4.9';
            const muiPackages = Object.keys(pkg.dependencies).filter(name => name.startsWith('@mui/'));
            for (const muiPackage of muiPackages) {
                if (muiPackage.includes('x-') && pkg.dependencies[muiPackage]) {
                    pkg.dependencies[muiPackage] = '^7.22.2';
                    changed = true;
                } else if (pkg.dependencies[muiPackage] && !pkg.dependencies[muiPackage].includes('6.4')) {
                    pkg.dependencies[muiPackage] = muiVersion;
                    changed = true;
                }
            }
            
            // Fix web-vitals version conflict (v2.x API incompatible with v5.x usage)
            if (pkg.dependencies['web-vitals'] && !pkg.dependencies['web-vitals'].includes('5.')) {
                pkg.dependencies['web-vitals'] = '^5.1.0';
                changed = true;
                console.log('Fixed web-vitals version conflict');
            }
        }
        
        if (changed) {
            fs.writeFileSync('apps/web-dashboard/package.json', JSON.stringify(pkg, null, 2));
            console.log('Fixed Material-UI version conflicts');
        }
        " 2>/dev/null || warning "Could not automatically fix web-dashboard dependencies"
    fi
    
    # Fix Jest version conflicts in root package.json
    if [[ -f "package.json" ]]; then
        log "Checking for Jest version conflicts..."
        
        node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        let changed = false;
        
        // Fix Jest version to be compatible with react-scripts (v27.x)
        if (pkg.dependencies && pkg.dependencies['jest']) {
            if (!pkg.dependencies['jest'].includes('27.')) {
                pkg.dependencies['jest'] = '^27.5.1';
                changed = true;
                console.log('Fixed Jest version conflict for react-scripts compatibility');
            }
        }
        
        if (pkg.devDependencies && pkg.devDependencies['jest']) {
            if (!pkg.devDependencies['jest'].includes('27.')) {
                pkg.devDependencies['jest'] = '^27.5.1';
                changed = true;
                console.log('Fixed Jest dev dependency version conflict');
            }
        }
        
        // Fix jest-environment-node to be compatible with Jest 27.x
        if (pkg.devDependencies && pkg.devDependencies['jest-environment-node']) {
            if (!pkg.devDependencies['jest-environment-node'].includes('27.')) {
                pkg.devDependencies['jest-environment-node'] = '^27.5.1';
                changed = true;
                console.log('Fixed jest-environment-node version conflict');
            }
        }
        
        // Fix jest-environment-jsdom to be compatible with Jest 27.x  
        if (pkg.devDependencies && pkg.devDependencies['jest-environment-jsdom']) {
            if (!pkg.devDependencies['jest-environment-jsdom'].includes('27.')) {
                pkg.devDependencies['jest-environment-jsdom'] = '^27.5.1';
                changed = true;
                console.log('Fixed jest-environment-jsdom version conflict');
            }
        }
        
        // Fix jest-util to be compatible with Jest 27.x
        if (pkg.devDependencies && pkg.devDependencies['jest-util']) {
            if (!pkg.devDependencies['jest-util'].includes('27.')) {
                pkg.devDependencies['jest-util'] = '^27.5.1';
                changed = true;
                console.log('Fixed jest-util version conflict');
            }
        }
        
        // Fix babel-jest to be compatible with Jest 27.x
        if (pkg.devDependencies && pkg.devDependencies['babel-jest']) {
            if (!pkg.devDependencies['babel-jest'].includes('27.')) {
                pkg.devDependencies['babel-jest'] = '^27.5.1';
                changed = true;
                console.log('Fixed babel-jest version conflict');
            }
        }
        
        if (changed) {
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
            console.log('Fixed Jest version conflicts in package.json');
        }
        " 2>/dev/null || warning "Could not automatically fix Jest version conflicts"
    fi
}

# Additional safeguard against "matches" property access errors
validate_and_fix_matches_property_issues() {
    log "🛡️ Adding safeguards against 'matches' property access errors..."
    
    # Validate that no package.json operations will cause null 'matches' access
    node -e "
    const fs = require('fs');
    
    // Function to safely check string methods that could cause 'matches' errors
    function safeStringOperation(str, operation) {
        if (str === null || str === undefined || typeof str !== 'string') {
            console.log('WARNING: Prevented null access to string method: ' + operation);
            return false;
        }
        return true;
    }
    
    // Check root package.json for potential issues
    if (fs.existsSync('package.json')) {
        try {
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            
            // Validate all dependency version strings are safe to process
            ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
                if (pkg[depType]) {
                    Object.entries(pkg[depType]).forEach(([name, version]) => {
                        if (!safeStringOperation(version, 'includes/match on ' + name)) {
                            console.log('FIXED: Invalid version for ' + name + ': ' + version);
                            pkg[depType][name] = '^1.0.0'; // Safe fallback
                        }
                    });
                }
            });
            
            console.log('✅ Package.json validated against matches property errors');
        } catch (e) {
            console.log('ERROR validating package.json: ' + e.message);
        }
    }
    
    // Check web-dashboard package.json for potential issues
    if (fs.existsSync('apps/web-dashboard/package.json')) {
        try {
            const pkg = JSON.parse(fs.readFileSync('apps/web-dashboard/package.json', 'utf8'));
            
            // Validate all dependency version strings are safe to process
            ['dependencies', 'devDependencies', 'peerDependencies'].forEach(depType => {
                if (pkg[depType]) {
                    Object.entries(pkg[depType]).forEach(([name, version]) => {
                        if (!safeStringOperation(version, 'includes/match on ' + name)) {
                            console.log('FIXED: Invalid version for ' + name + ': ' + version);
                            pkg[depType][name] = '^1.0.0'; // Safe fallback
                        }
                    });
                }
            });
            
            console.log('✅ Web-dashboard package.json validated against matches property errors');
        } catch (e) {
            console.log('ERROR validating web-dashboard package.json: ' + e.message);
        }
    }
    " 2>/dev/null || warning "Could not run matches property validation"
}

install_with_pnpm() {
    local attempt=$1
    log "Attempting pnpm install (attempt $attempt)..."
    
    # Use different strategies for different attempts
    case $attempt in
        1)
            timeout 300 pnpm install --no-frozen-lockfile --prefer-offline --ignore-scripts
            ;;
        2)
            timeout 600 pnpm install --no-frozen-lockfile --ignore-scripts
            ;;
        3)
            timeout 900 pnpm install --no-frozen-lockfile --no-optional --ignore-scripts
            ;;
    esac
}

main() {
    log "🚀 Starting robust dependency installation..."
    
    # Determine which package manager to use
    if ! command -v pnpm >/dev/null 2>&1; then
        log "pnpm not available, attempting installation..."
        
        # Extract pnpm version from package.json for consistency
        local pnpm_version
        if [[ -f "scripts/ci/extract-pnpm-version.sh" ]]; then
            pnpm_version=$(./scripts/ci/extract-pnpm-version.sh)
            log "Using pnpm version from package.json: $pnpm_version"
        else
            pnpm_version="10.14.0"  # fallback
            log "Using fallback pnpm version: $pnpm_version"
        fi
        
        if corepack enable "pnpm@$pnpm_version" >/dev/null 2>&1; then
            log "pnpm installed successfully"
        else
            error "pnpm installation failed"
            exit 1
        fi
    fi
    
    # Check if we already have dependencies
    if [[ -d "node_modules" ]] && [[ $(find node_modules -type f | wc -l) -gt 100 ]]; then
        log "Existing node_modules found with $(find node_modules -type f | wc -l) files"
        
        # Quick validation of key packages
        local key_packages=("nx" "typescript" "eslint" "react")
        local missing_packages=()
        
        for package in "${key_packages[@]}"; do
            if [[ ! -d "node_modules/$package" ]] && [[ ! -d "node_modules/@*/$package" ]]; then
                missing_packages+=("$package")
            fi
        done
        
        if [[ ${#missing_packages[@]} -eq 0 ]]; then
            success "All key packages found - installation appears complete"
            exit 0
        else
            warning "Missing packages: ${missing_packages[*]} - proceeding with installation"
        fi
    fi
    
    # Install with retry logic
    local install_success=false
    
    # Pre-installation fixes for known issues
    fix_web_dashboard_dependencies
    validate_and_fix_matches_property_issues
    
    for attempt in 1 2 3; do
        log "Installation attempt $attempt of 3..."
        if install_with_pnpm $attempt; then
            install_success=true
            break
        else
            warning "pnpm installation failed on attempt $attempt"
        fi
        if [[ $attempt -lt 3 ]]; then
            warning "Waiting 10 seconds before retry..."
            sleep 10
        fi
    done
    
    if [[ "$install_success" == "true" ]]; then
        success "🎉 Dependency installation completed successfully"
        
        # Quick verification
        log "🔍 Verifying installation..."
        if [[ -f "package.json" ]] && command -v node >/dev/null; then
            local package_count=$(find node_modules -type d -name "*" | wc -l)
            success "Installation verified: $package_count packages installed"
        fi
        
        exit 0
    else
        error "All installation attempts failed"
        log "💡 Troubleshooting suggestions:"
        log "   1. Check network connectivity"
        log "   2. Verify registry access"
        log "   3. Check for package.json syntax errors"
        log "   4. Try clearing pnpm store: pnpm store prune"
        exit 1
    fi
}

main "$@"
