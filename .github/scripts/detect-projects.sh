#!/bin/bash

# Enterprise-grade script for dynamic Nx project detection
# Ensures CI pipeline works with actual project structure

set -euo pipefail

echo "🔍 Detecting Nx projects dynamically..."

# Ensure we're in the right directory
cd "$(dirname "$0")/../.."

# Check if Nx is available
if ! command -v npx >/dev/null 2>&1; then
    echo "❌ Error: npx not available"
    exit 1
fi

# Function to get projects by type with validation
get_projects_by_type() {
    local project_type="$1"
    local output_file="$2"
    
    echo "📋 Detecting ${project_type} projects..."
    
    # Get projects and validate JSON output
    local nx_output
    if [ "$project_type" = "applications" ]; then
        nx_output=$(npx nx show projects --type=app --json 2>/dev/null)
    elif [ "$project_type" = "libraries" ]; then
        nx_output=$(npx nx show projects --type=lib --json 2>/dev/null)
    else
        nx_output=$(npx nx show projects --json 2>/dev/null)
    fi
    
    # Validate JSON output
    if [ -z "$nx_output" ] || ! echo "$nx_output" | jq empty 2>/dev/null; then
        echo "⚠️  Warning: Invalid or empty JSON output from Nx for ${project_type}"
        echo "[]" > "$output_file.json"
        echo -n > "$output_file"
        return 0
    fi
    
    # Write validated JSON output
    echo "$nx_output" | jq -c '.' > "$output_file.json"
    
    # Create text file for counting (extract items for counting)
    echo "$nx_output" | jq -r '.[]' > "$output_file"
    
    local count=$(cat "$output_file" | wc -l)
    echo "✅ Found $count ${project_type} projects"
    
    if [ $count -eq 0 ]; then
        echo "⚠️  Warning: No ${project_type} projects found"
        echo "[]" > "$output_file.json"
    fi
}

# Function to get projects that support specific targets with validation
get_projects_with_target() {
    local target="$1"
    local output_file="$2"
    
    echo "🎯 Detecting projects with '$target' target..."
    
    # Get projects with specific target and validate JSON output
    local nx_output
    nx_output=$(npx nx show projects --with-target="$target" --json 2>/dev/null)
    
    # Validate JSON output
    if [ -z "$nx_output" ] || ! echo "$nx_output" | jq empty 2>/dev/null; then
        echo "⚠️  Warning: Invalid or empty JSON output from Nx for target '$target'"
        echo "[]" > "$output_file.json"
        echo -n > "$output_file"
        return 0
    fi
    
    # Write validated JSON output
    echo "$nx_output" | jq -c '.' > "$output_file.json"
    
    # For lint target, filter out projects without lintable files
    if [ "$target" = "lint" ]; then
        echo "🔍 Filtering projects to include only those with lintable files..."
        local filtered_projects=()
        
        # Read projects and check for lintable files
        while IFS= read -r project; do
            if [ -n "$project" ]; then
                # Check if project has lintable files (js, jsx, ts, tsx)
                local lintable_files=$(find "apps/$project" "libs/$project" -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -1)
                if [ -n "$lintable_files" ]; then
                    filtered_projects+=("$project")
                    echo "✅ Including $project (has lintable files)"
                else
                    echo "⚠️  Skipping $project (no lintable files found)"
                fi
            fi
        done < <(echo "$nx_output" | jq -r '.[]')
        
        # Create new JSON array with filtered projects - ensure valid JSON
        if [ ${#filtered_projects[@]} -eq 0 ]; then
            echo "[]" > "$output_file.json"
            echo -n > "$output_file"
        else
            printf '%s\n' "${filtered_projects[@]}" | jq -R . | jq -s . > "$output_file.json"
            printf '%s\n' "${filtered_projects[@]}" > "$output_file"
        fi
    else
        # Create text file for counting (extract items for counting)
        echo "$nx_output" | jq -r '.[]' > "$output_file"
    fi
    
    local count=$(cat "$output_file" | wc -l)
    echo "✅ Found $count projects with '$target' target"
    
    if [ $count -eq 0 ]; then
        echo "⚠️  Warning: No projects with '$target' target found"
        echo "[]" > "$output_file.json"
    fi
}

# Create output directory
mkdir -p .github/cache

# Detect different types of projects
get_projects_by_type "applications" ".github/cache/apps.txt"
get_projects_by_type "libraries" ".github/cache/libs.txt"

# Detect projects with specific targets
get_projects_with_target "lint" ".github/cache/lintable.txt"
get_projects_with_target "test" ".github/cache/testable.txt"
get_projects_with_target "build" ".github/cache/buildable.txt"

# Generate summary report
echo "📊 Project Detection Summary:"
echo "Applications: $(cat .github/cache/apps.txt | wc -l)"
echo "Libraries: $(cat .github/cache/libs.txt | wc -l)"
echo "Lintable: $(cat .github/cache/lintable.txt | wc -l)"
echo "Testable: $(cat .github/cache/testable.txt | wc -l)"
echo "Buildable: $(cat .github/cache/buildable.txt | wc -l)"

# Validate critical applications exist
critical_apps=("api-gateway" "web-dashboard")
missing_apps=()

for app in "${critical_apps[@]}"; do
    if ! grep -q "^${app}$" .github/cache/apps.txt; then
        missing_apps+=("$app")
    fi
done

if [ ${#missing_apps[@]} -gt 0 ]; then
    echo "⚠️  Warning: Critical applications missing: ${missing_apps[*]}"
    echo "This may indicate a configuration issue."
fi

echo "✅ Project detection complete"

# Validate all JSON outputs before finishing
echo "🔍 Validating JSON outputs..."
json_files=(".github/cache/apps.txt.json" ".github/cache/libs.txt.json" ".github/cache/lintable.txt.json" ".github/cache/testable.txt.json" ".github/cache/buildable.txt.json")
for json_file in "${json_files[@]}"; do
    if [ -f "$json_file" ]; then
        if jq empty "$json_file" 2>/dev/null; then
            echo "✅ Valid JSON: $json_file"
        else
            echo "❌ Invalid JSON: $json_file, fixing..."
            echo "[]" > "$json_file"
        fi
    else
        echo "⚠️  Missing JSON file: $json_file, creating empty array..."
        echo "[]" > "$json_file"
    fi
done

echo "✅ JSON validation complete"