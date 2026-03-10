#!/bin/bash

# =============================================================================
# PNPM Version Extractor Utility
# =============================================================================
# Enterprise utility for consistent pnpm version extraction from package.json
# across scripts, Dockerfiles, and CI environments.
#
# This utility ensures all parts of the codebase use the same pnpm version
# as specified in package.json packageManager field.
#
# Usage: 
#   source scripts/ci/extract-pnpm-version.sh
#   PNPM_VERSION=$(get_pnpm_version_from_package_json)
#   echo "Using pnpm version: $PNPM_VERSION"
#
# Or:
#   ./scripts/ci/extract-pnpm-version.sh
#   # Outputs just the version number to stdout
# =============================================================================

# Default fallback version if package.json is not available or malformed
DEFAULT_PNPM_VERSION="10.14.0"

# Function to extract pnpm version from package.json
get_pnpm_version_from_package_json() {
    local package_json_path="${1:-package.json}"
    local fallback_version="${2:-$DEFAULT_PNPM_VERSION}"
    
    # Check if package.json exists
    if [[ ! -f "$package_json_path" ]]; then
        echo "$fallback_version"
        return 0
    fi
    
    # Check if jq is available
    if ! command -v jq >/dev/null 2>&1; then
        # Fallback to basic sed parsing if jq is not available
        local package_manager_line
        package_manager_line=$(grep '"packageManager"' "$package_json_path" 2>/dev/null)
        if [[ -n "$package_manager_line" ]]; then
            # Extract version using sed
            local version
            version=$(echo "$package_manager_line" | sed 's/.*"packageManager".*"pnpm@\([^+"]*\).*/\1/' | sed 's/[^0-9.]*//g')
            if [[ -n "$version" && "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                echo "$version"
                return 0
            fi
        fi
        echo "$fallback_version"
        return 0
    fi
    
    # Use jq to extract packageManager field
    local package_manager_field
    package_manager_field=$(jq -r '.packageManager // empty' "$package_json_path" 2>/dev/null)
    
    if [[ -z "$package_manager_field" ]]; then
        echo "$fallback_version"
        return 0
    fi
    
    # Extract version from packageManager field (e.g., "pnpm@10.14.0+sha512...")
    local version
    version=$(echo "$package_manager_field" | sed 's/pnpm@\([^+]*\).*/\1/')
    
    # Validate version format
    if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "$version"
    else
        echo "$fallback_version"
    fi
}

# Function to get pnpm version with context logging
get_pnpm_version_with_logging() {
    local package_json_path="${1:-package.json}"
    local context="${2:-script}"
    
    local version
    version=$(get_pnpm_version_from_package_json "$package_json_path")
    
    # Log the source of the version (if logging functions are available)
    if [[ $(type -t log_info) == function ]]; then
        if [[ -f "$package_json_path" ]] && command -v jq >/dev/null 2>&1; then
            local package_manager_field
            package_manager_field=$(jq -r '.packageManager // empty' "$package_json_path" 2>/dev/null)
            if [[ -n "$package_manager_field" ]]; then
                log_info "[$context] Using pnpm version from package.json: $version"
            else
                log_info "[$context] Using fallback pnpm version: $version"
            fi
        else
            log_info "[$context] Using fallback pnpm version: $version"
        fi
    fi
    
    echo "$version"
}

# Function to validate pnpm version format
validate_pnpm_version() {
    local version="$1"
    
    if [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        return 0
    else
        return 1
    fi
}

# Main execution when script is called directly
main() {
    local package_json_path="${1:-package.json}"
    
    # Find package.json in current directory or parent directories
    local search_path="$package_json_path"
    if [[ "$package_json_path" == "package.json" ]]; then
        local current_dir="$(pwd)"
        while [[ "$current_dir" != "/" ]]; do
            if [[ -f "$current_dir/package.json" ]]; then
                search_path="$current_dir/package.json"
                break
            fi
            current_dir="$(dirname "$current_dir")"
        done
    fi
    
    local version
    version=$(get_pnpm_version_from_package_json "$search_path")
    
    # Validate the version
    if validate_pnpm_version "$version"; then
        echo "$version"
        exit 0
    else
        echo "Error: Invalid pnpm version format: $version" >&2
        echo "$DEFAULT_PNPM_VERSION"
        exit 1
    fi
}

# Export functions for sourcing
export -f get_pnpm_version_from_package_json
export -f get_pnpm_version_with_logging
export -f validate_pnpm_version

# Execute main if script is run directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi