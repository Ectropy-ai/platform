#!/bin/bash
# GitHub Actions Output Helper
# Provides safe functions for writing to GITHUB_OUTPUT with proper validation

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Safe function to write to GITHUB_OUTPUT
# Usage: safe_output "key" "value"
safe_output() {
    local key="$1"
    local value="$2"
    
    # Validate key format
    if [[ ! "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then
        log_error "Invalid output key format: '$key'"
        log_error "Key must start with letter or underscore, followed by letters, numbers, underscores, or hyphens"
        return 1
    fi
    
    # Validate that key is not empty
    if [ -z "$key" ]; then
        log_error "Output key cannot be empty"
        return 1
    fi
    
    # Value can be empty, but warn if it contains problematic characters
    if [[ "$value" =~ [[:cntrl:]] ]]; then
        log_warning "Output value for '$key' contains control characters"
    fi
    
    # Write to GITHUB_OUTPUT with proper format
    echo "${key}=${value}" >> "${GITHUB_OUTPUT:-/dev/null}"
    log_info "Output set: ${key}=${value}"
}

# Safe function to write multiline output
# Usage: safe_multiline_output "key" "value"
safe_multiline_output() {
    local key="$1"
    local value="$2"
    local delimiter="EOF_${key}_$(date +%s)"
    
    # Validate key format
    if [[ ! "$key" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then
        log_error "Invalid output key format: '$key'"
        return 1
    fi
    
    # Write multiline output with delimiter
    {
        echo "${key}<<${delimiter}"
        echo "$value"
        echo "$delimiter"
    } >> "${GITHUB_OUTPUT:-/dev/null}"
    
    log_info "Multiline output set: ${key} (${#value} characters)"
}

# Function to safely output project name
# Usage: safe_project_output "project-name"
safe_project_output() {
    local project="$1"
    
    if [ -z "$project" ]; then
        log_error "Project name cannot be empty"
        return 1
    fi
    
    # Use safe_output with proper key
    safe_output "project" "$project"
}

# Function to safely output a list of projects
# Usage: safe_projects_output "project1,project2,project3"
safe_projects_output() {
    local projects="$1"
    
    if [ -z "$projects" ]; then
        log_warning "Projects list is empty"
        safe_output "projects" ""
        return 0
    fi
    
    safe_output "projects" "$projects"
}

# Function to validate existing GITHUB_OUTPUT file
validate_github_output() {
    if [ ! -f "${GITHUB_OUTPUT:-/dev/null}" ]; then
        log_warning "GITHUB_OUTPUT file does not exist or is not accessible"
        return 1
    fi
    
    local errors=0
    local line_num=0
    
    while IFS= read -r line; do
        ((line_num++))
        
        # Skip empty lines
        [ -z "$line" ] && continue
        
        # Check for multiline delimiter format
        if [[ "$line" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*\<\<.+$ ]]; then
            continue  # Valid multiline start
        fi
        
        # Check for key=value format
        if [[ ! "$line" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*= ]]; then
            log_error "Invalid output format at line $line_num: $line"
            ((errors++))
        fi
    done < "${GITHUB_OUTPUT}"
    
    if [ $errors -eq 0 ]; then
        log_info "GITHUB_OUTPUT validation passed"
        return 0
    else
        log_error "GITHUB_OUTPUT validation failed with $errors error(s)"
        return 1
    fi
}

# Show usage if script is called directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    echo "GitHub Actions Output Helper Functions"
    echo "======================================"
    echo ""
    echo "Available functions:"
    echo "  safe_output KEY VALUE           - Write key=value to GITHUB_OUTPUT"
    echo "  safe_multiline_output KEY VALUE - Write multiline value to GITHUB_OUTPUT"
    echo "  safe_project_output PROJECT     - Write project name safely"
    echo "  safe_projects_output PROJECTS   - Write comma-separated projects list"
    echo "  validate_github_output          - Validate existing GITHUB_OUTPUT file"
    echo ""
    echo "Usage:"
    echo "  source scripts/ci/safe-output.sh"
    echo "  safe_output \"status\" \"success\""
    echo "  safe_project_output \"mcp-server\""
    echo ""
    echo "This script prevents the common error:"
    echo "  ❌ echo \"mcp-server\" >> \$GITHUB_OUTPUT"
    echo "  ✅ safe_project_output \"mcp-server\""
fi