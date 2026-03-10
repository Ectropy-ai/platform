#!/bin/bash
# Centralized Nx Project Detection Script
# Consolidates project discovery logic for CI workflows
# Addresses redundancy identified in enterprise monorepo optimization strategy

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.github/cache"

# Logging functions
log_info() { echo "🔍 $1"; }
log_success() { echo "✅ $1"; }
log_error() { echo "❌ $1" >&2; }
log_warning() { echo "⚠️ $1" >&2; }

# Ensure cache directory exists
ensure_cache_dir() {
    mkdir -p "$CACHE_DIR"
    log_info "Cache directory ensured: $CACHE_DIR"
}

# Enhanced project detection with validation
detect_projects() {
    local target_type="$1"
    local output_file="$2"
    
    log_info "Detecting projects for: $target_type"
    
    cd "$PROJECT_ROOT"
    
    local projects_json
    case "$target_type" in
        "apps")
            projects_json=$(pnpm nx show projects --type=app --json || echo "[]")
            ;;
        "lintable")
            projects_json=$(pnpm nx show projects --with-target=lint --json || echo "[]")
            ;;
        "testable")
            projects_json=$(pnpm nx show projects --with-target=test --json || echo "[]")
            ;;
        "buildable")
            projects_json=$(pnpm nx show projects --with-target=build --json || echo "[]")
            ;;
        *)
            log_error "Unknown project type: $target_type"
            return 1
            ;;
    esac
    
    # Validate JSON output
    if ! echo "$projects_json" | jq empty 2>/dev/null; then
        log_error "Invalid JSON output for $target_type projects"
        echo "[]" > "$output_file"
        return 1
    fi
    
    # Check if array is empty
    local project_count
    project_count=$(echo "$projects_json" | jq length)
    
    if [ "$project_count" -eq 0 ]; then
        log_warning "No $target_type projects found"
    else
        log_success "Found $project_count $target_type projects"
    fi
    
    # Write to output file
    echo "$projects_json" > "$output_file"
    
    # Log project names for visibility
    if [ "$project_count" -gt 0 ]; then
        echo "$projects_json" | jq -r '.[]' | while read -r project; do
            log_info "  - $project"
        done
    fi
}

# Main execution
main() {
    log_info "Starting centralized Nx project detection..."
    
    ensure_cache_dir
    
    # Detect all project types
    detect_projects "apps" "$CACHE_DIR/apps.txt.json"
    detect_projects "lintable" "$CACHE_DIR/lintable.txt.json"
    detect_projects "testable" "$CACHE_DIR/testable.txt.json"
    detect_projects "buildable" "$CACHE_DIR/buildable.txt.json"
    
    # Generate summary report
    log_info "Project detection summary:"
    for file in "$CACHE_DIR"/*.txt.json; do
        if [ -f "$file" ]; then
            local basename=$(basename "$file" .txt.json)
            local count=$(jq length < "$file")
            log_success "$basename: $count projects"
        fi
    done
    
    log_success "Centralized project detection complete"
}

# Error handling
trap 'log_error "Project detection failed with exit code $?"' ERR

# Execute main function
main "$@"