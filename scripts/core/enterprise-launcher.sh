#!/bin/bash
# Enterprise Script Launcher
# Provides unified interface to all enterprise CI/CD scripts

set -euo pipefail

readonly SCRIPT_DIR="scripts/enterprise"

show_help() {
    echo "🏢 Enterprise Script Launcher"
    echo "=============================="
    echo ""
    echo "Usage: $0 <category> <script> [options]"
    echo ""
    echo "Categories:"
    echo "  ci         - CI/CD management scripts"
    echo "  deployment - Deployment and release scripts"
    echo "  security   - Security validation scripts"
    echo "  validation - Compliance and validation scripts"
    echo "  monitoring - System monitoring scripts"
    echo ""
    echo "Examples:"
    echo "  $0 ci enterprise-workflow-consolidation.sh"
    echo "  $0 monitoring monitor-enterprise-workflows.sh"
    echo "  $0 security comprehensive-security-scan.sh"
    echo ""
    echo "Available scripts:"
    for category in ci deployment security validation monitoring; do
        if [ -d "$SCRIPT_DIR/$category" ]; then
            echo "  $category:"
            ls -1 "$SCRIPT_DIR/$category"/*.sh 2>/dev/null | sed 's|.*/||' | sed 's/^/    /' || echo "    (no scripts)"
        fi
    done
}

if [ $# -lt 2 ]; then
    show_help
    exit 1
fi

CATEGORY="$1"
SCRIPT="$2"
shift 2

SCRIPT_PATH="$SCRIPT_DIR/$CATEGORY/$SCRIPT"

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Script not found: $SCRIPT_PATH"
    echo ""
    show_help
    exit 1
fi

echo "🚀 Executing: $SCRIPT_PATH"
echo "📝 Arguments: $@"
echo ""

# Make script executable if needed
chmod +x "$SCRIPT_PATH"

# Execute the script with remaining arguments
exec "$SCRIPT_PATH" "$@"
