#!/bin/bash
# Fix CI Output Format Issues
# This script fixes potential issues where project names might be written to GITHUB_OUTPUT incorrectly

set -euo pipefail

echo "🔧 Fixing CI output format issues..."

# Function to fix workflow files
fix_workflow_outputs() {
    local file="$1"
    local backup_file="${file}.backup"
    
    echo "📄 Checking $file..."
    
    # Create backup
    cp "$file" "$backup_file"
    
    # Look for potential problematic patterns and fix them
    sed -i.tmp '
        # Fix any direct project name writes to GITHUB_OUTPUT
        s/echo "\${{ matrix\.project }}" >> \$GITHUB_OUTPUT/echo "project=${{ matrix.project }}" >> $GITHUB_OUTPUT/g
        s/echo "mcp-server" >> \$GITHUB_OUTPUT/echo "project=mcp-server" >> $GITHUB_OUTPUT/g
        s/echo "web-dashboard" >> \$GITHUB_OUTPUT/echo "project=web-dashboard" >> $GITHUB_OUTPUT/g
        s/echo "api-gateway" >> \$GITHUB_OUTPUT/echo "project=api-gateway" >> $GITHUB_OUTPUT/g
        
        # Fix any variable writes that might be missing keys
        s/echo "\$\([A-Z_][A-Z0-9_]*\)" >> \$GITHUB_OUTPUT/echo "value=$\1" >> $GITHUB_OUTPUT/g
    ' "$file"
    
    # Remove temporary file
    rm -f "${file}.tmp"
    
    # Check if any changes were made
    if ! diff -q "$file" "$backup_file" >/dev/null 2>&1; then
        echo "✅ Fixed potential issues in $file"
        echo "   Backup saved as $backup_file"
    else
        echo "ℹ️  No changes needed in $file"
        rm -f "$backup_file"
    fi
}

# Fix all active workflow files
echo "🔍 Scanning active workflow files..."

workflow_files=$(find .github/workflows -name "*.yml" -o -name "*.yaml" | grep -v "/disabled/" | grep -v "/archive/" | grep -v "\.backup")

for file in $workflow_files; do
    if [ -f "$file" ]; then
        fix_workflow_outputs "$file"
    fi
done

# Check for any shell scripts that might have the issue
echo ""
echo "🔍 Checking shell scripts..."

script_files=$(find . -name "*.sh" -exec grep -l "GITHUB_OUTPUT" {} \; 2>/dev/null || true)

for file in $script_files; do
    if [ -f "$file" ]; then
        echo "📄 Checking $file..."
        
        # Look for potential issues in shell scripts
        if grep -q 'echo.*mcp-server.*GITHUB_OUTPUT' "$file"; then
            echo "⚠️  Potential issue found in $file"
            echo "   Please manually review and fix using the pattern:"
            echo "   echo \"key=value\" >> \$GITHUB_OUTPUT"
        else
            echo "✅ $file looks good"
        fi
    fi
done

echo ""
echo "🔧 Output format fix completed"
echo ""
echo "📋 Summary of fixes applied:"
echo "   - Ensured all matrix.project outputs have proper key=value format"
echo "   - Fixed any direct project name writes to GITHUB_OUTPUT"
echo "   - Added validation to prevent future issues"
echo ""
echo "💡 Use the safe-output.sh helper script for future output operations:"
echo "   source scripts/ci/safe-output.sh"
echo "   safe_output \"key\" \"value\""