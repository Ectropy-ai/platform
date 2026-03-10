#!/bin/bash
# scripts/security/utils/safe-cleanup.sh
# Safe cleanup utilities for enterprise-grade directory removal
# Provides centralized, auditable, and secure directory removal functions

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
safe_log_info() {
    echo -e "${BLUE}[SAFE-CLEANUP]${NC} $1"
}

safe_log_success() {
    echo -e "${GREEN}[SAFE-CLEANUP]${NC} $1"
}

safe_log_warning() {
    echo -e "${YELLOW}[SAFE-CLEANUP]${NC} $1"
}

safe_log_error() {
    echo -e "${RED}[SAFE-CLEANUP]${NC} $1"
}

# Enterprise-grade safe removal function with comprehensive strategies
safe_remove() {
    local target_path="$1"
    local reason="${2:-Directory removal requested}"
    
    if [[ ! -e "$target_path" ]]; then
        safe_log_info "Target does not exist: $target_path"
        return 0
    fi
    
    safe_log_info "Starting safe removal of: $target_path"
    safe_log_info "Reason: $reason"
    
    # Pre-removal audit
    local target_type="unknown"
    if [[ -d "$target_path" ]]; then
        target_type="directory"
    elif [[ -f "$target_path" ]]; then
        target_type="file"
    elif [[ -L "$target_path" ]]; then
        target_type="symlink"
    fi
    
    safe_log_info "Target type: $target_type"
    safe_log_info "Target owner: $(stat -c %U:%G "$target_path" 2>/dev/null || echo 'unknown')"
    safe_log_info "Target permissions: $(stat -c %a "$target_path" 2>/dev/null || echo 'unknown')"
    
    # Strategy 1: Standard removal (try first, safest)
    safe_log_info "Strategy 1: Standard removal attempt"
    if rm -rf "$target_path" 2>/dev/null; then
        safe_log_success "Standard removal successful"
        return 0
    fi
    
    # Strategy 2: Permission fix + removal
    safe_log_info "Strategy 2: Permission fix + removal"
    if sudo chown -R "$USER:$USER" "$target_path" 2>/dev/null && \
       sudo chmod -R u+rwX "$target_path" 2>/dev/null && \
       rm -rf "$target_path" 2>/dev/null; then
        safe_log_success "Permission fix + removal successful"
        return 0
    fi
    
    # Strategy 3: Immutable attribute removal + permission fix + removal
    if command -v chattr >/dev/null 2>&1; then
        safe_log_info "Strategy 3: Immutable attribute removal + permission fix + removal"
        if sudo find "$target_path" -exec chattr -i {} \; 2>/dev/null && \
           sudo chown -R "$USER:$USER" "$target_path" 2>/dev/null && \
           sudo chmod -R u+rwX "$target_path" 2>/dev/null && \
           rm -rf "$target_path" 2>/dev/null; then
            safe_log_success "Immutable attribute removal + permission fix + removal successful"
            return 0
        fi
    fi
    
    # Strategy 4: Sudo force removal
    safe_log_info "Strategy 4: Sudo force removal"
    if sudo rm -rf "$target_path" 2>/dev/null; then
        safe_log_success "Sudo force removal successful"
        return 0
    fi
    
    # Strategy 5: Ultimate nuclear option - chmod 777 + chown root + sudo rm
    safe_log_warning "Strategy 5: Nuclear option - maximum privilege removal"
    if sudo chmod -R 777 "$target_path" 2>/dev/null && \
       sudo chown -R root:root "$target_path" 2>/dev/null && \
       sudo rm -rf "$target_path" 2>/dev/null; then
        safe_log_success "Nuclear option removal successful"
        return 0
    fi
    
    # All strategies failed
    safe_log_error "All removal strategies failed for: $target_path"
    safe_log_error "Manual intervention required"
    
    # Final diagnostic information
    if [[ -e "$target_path" ]]; then
        safe_log_error "Target still exists after all strategies"
        safe_log_error "Final owner: $(stat -c %U:%G "$target_path" 2>/dev/null || echo 'unknown')"
        safe_log_error "Final permissions: $(stat -c %a "$target_path" 2>/dev/null || echo 'unknown')"
        safe_log_error "Mount status: $(mount | grep "$target_path" 2>/dev/null || echo 'not mounted')"
        
        # Check for open file handles if lsof is available
        if command -v lsof >/dev/null 2>&1 && [[ -d "$target_path" ]]; then
            local open_handles=$(lsof +D "$target_path" 2>/dev/null | tail -n +2 | wc -l || echo "0")
            safe_log_error "Open file handles: $open_handles"
            if [[ $open_handles -gt 0 ]]; then
                safe_log_error "Processes holding files:"
                lsof +D "$target_path" 2>/dev/null | tail -n +2 | while read line; do
                    safe_log_error "  $line"
                done
            fi
        fi
    fi
    
    return 1
}

# Function to safely check if a path can be removed
can_safe_remove() {
    local target_path="$1"
    
    if [[ ! -e "$target_path" ]]; then
        return 0  # Can "remove" something that doesn't exist
    fi
    
    # Check basic permissions
    if [[ -w "$target_path" ]]; then
        return 0  # Can write to it, should be able to remove
    fi
    
    # Check if we can change permissions with sudo
    if sudo test -e "$target_path" 2>/dev/null; then
        return 0  # Sudo access available
    fi
    
    return 1  # Cannot safely remove
}

# Function to get safe removal strategy recommendation
get_removal_strategy() {
    local target_path="$1"
    
    if [[ ! -e "$target_path" ]]; then
        echo "none_needed"
        return 0
    fi
    
    if [[ -w "$target_path" ]]; then
        echo "standard"
        return 0
    fi
    
    if sudo test -w "$target_path" 2>/dev/null; then
        echo "sudo_required"
        return 0
    fi
    
    echo "nuclear_option"
    return 0
}

# Export functions for use by other scripts
export -f safe_remove
export -f can_safe_remove
export -f get_removal_strategy
export -f safe_log_info
export -f safe_log_success
export -f safe_log_warning
export -f safe_log_error