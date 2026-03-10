#!/bin/bash
set -euo pipefail

echo "🔒 File Permissions Validation and Fix"
echo "====================================="

# Initialize counters
FIXES=0
ISSUES=0

# Function to log with timestamp and type
log() {
    local type="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$type] $message"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; ((ISSUES++)); }
log_success() { log "SUCCESS" "$1"; }

# Check for world-writable files
check_world_writable_files() {
    log_info "Checking for world-writable files..."
    
    local found_files=()
    
    # Check .devcontainer directory
    while IFS= read -r -d '' file; do
        found_files+=("$file")
        log_warn "Found world-writable file: $file"
    done < <(find .devcontainer/ -type f -perm -002 -print0 2>/dev/null || true)
    
    # Check scripts directory  
    while IFS= read -r -d '' file; do
        found_files+=("$file")
        log_warn "Found world-writable file: $file"
    done < <(find scripts/ -type f -perm -002 -print0 2>/dev/null || true)
    
    # Check root level config files
    while IFS= read -r -d '' file; do
        found_files+=("$file")
        log_warn "Found world-writable file: $file"
    done < <(find . -maxdepth 1 -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.conf" | xargs -I {} find {} -type f -perm -002 -print0 2>/dev/null || true)
    
    if [ ${#found_files[@]} -eq 0 ]; then
        log_success "No world-writable files found"
        return 0
    else
        log_error "Found ${#found_files[@]} world-writable files"
        return 1
    fi
}

# Fix world-writable files
fix_world_writable_files() {
    log_info "Fixing world-writable files..."
    
    local fixed_files=()
    
    # Fix .devcontainer directory
    while IFS= read -r -d '' file; do
        if [ -f "$file" ]; then
            chmod o-w "$file"
            fixed_files+=("$file")
            log_info "Fixed permissions for: $file"
            ((FIXES++))
        fi
    done < <(find .devcontainer/ -type f -perm -002 -print0 2>/dev/null || true)
    
    # Fix scripts directory
    while IFS= read -r -d '' file; do
        if [ -f "$file" ]; then
            chmod o-w "$file"
            fixed_files+=("$file")
            log_info "Fixed permissions for: $file"
            ((FIXES++))
        fi
    done < <(find scripts/ -type f -perm -002 -print0 2>/dev/null || true)
    
    # Fix root level config files
    while IFS= read -r -d '' file; do
        if [ -f "$file" ]; then
            chmod o-w "$file"
            fixed_files+=("$file")
            log_info "Fixed permissions for: $file"
            ((FIXES++))
        fi
    done < <(find . -maxdepth 1 -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.conf" | xargs -I {} find {} -type f -perm -002 -print0 2>/dev/null || true)
    
    if [ ${#fixed_files[@]} -eq 0 ]; then
        log_info "No files required permission fixes"
    else
        log_success "Fixed permissions for ${#fixed_files[@]} files"
    fi
}

# Set secure default permissions for critical directories
set_secure_defaults() {
    log_info "Setting secure default permissions..."
    
    # Ensure .devcontainer files have proper permissions
    find .devcontainer/ -type f -exec chmod 644 {} \; 2>/dev/null || true
    find .devcontainer/ -type f -name "*.sh" -exec chmod 755 {} \; 2>/dev/null || true
    
    # Ensure script files have proper permissions
    find scripts/ -type f -name "*.sh" -exec chmod 755 {} \; 2>/dev/null || true
    find scripts/ -type f -name "*.js" -exec chmod 644 {} \; 2>/dev/null || true
    
    # Ensure config files have proper permissions
    find . -maxdepth 1 -name "*.yml" -exec chmod 644 {} \; 2>/dev/null || true
    find . -maxdepth 1 -name "*.yaml" -exec chmod 644 {} \; 2>/dev/null || true
    find . -maxdepth 1 -name "*.json" -exec chmod 644 {} \; 2>/dev/null || true
    find . -maxdepth 1 -name "*.conf" -exec chmod 644 {} \; 2>/dev/null || true
    
    log_success "Secure default permissions applied"
}

# Validate final state
validate_permissions() {
    log_info "Validating final permissions state..."
    
    # Check that no world-writable files remain
    if ! check_world_writable_files; then
        log_error "Still found world-writable files after fixes"
        return 1
    fi
    
    # Check that executable scripts are still executable
    local non_executable_scripts=()
    while IFS= read -r -d '' file; do
        if [ ! -x "$file" ]; then
            non_executable_scripts+=("$file")
            log_warn "Script file not executable: $file"
        fi
    done < <(find scripts/ .devcontainer/ -name "*.sh" -print0 2>/dev/null || true)
    
    if [ ${#non_executable_scripts[@]} -eq 0 ]; then
        log_success "All script files are properly executable"
    else
        log_warn "Found ${#non_executable_scripts[@]} non-executable script files"
        # Fix non-executable script files
        for file in "${non_executable_scripts[@]}"; do
            chmod +x "$file"
            log_info "Made executable: $file"
        done
    fi
    
    log_success "Permission validation completed"
    return 0
}

# Main execution
main() {
    log_info "Starting file permissions validation and fix..."
    
    # Check current state
    if check_world_writable_files; then
        log_info "No permission issues found, applying secure defaults..."
    else
        log_info "Found permission issues, applying fixes..."
        fix_world_writable_files
    fi
    
    # Apply secure defaults
    set_secure_defaults
    
    # Validate final state
    if validate_permissions; then
        log_success "File permissions validation and fix completed successfully"
        log_info "Files fixed: $FIXES"
        log_info "Issues found: $ISSUES"
        exit 0
    else
        log_error "File permissions validation failed"
        exit 1
    fi
}

# Run main function
main "$@"