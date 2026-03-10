#!/bin/bash
set -euo pipefail

echo "🔍 Auditing Dockerfiles for build order issues..."

ERRORS=0
WARNINGS=0

# Find all Dockerfiles
DOCKERFILES=$(find . -name "Dockerfile*" -type f | grep -v node_modules)

for dockerfile in $DOCKERFILES; do
    echo "Checking: $dockerfile"
    
    # Check if workspace pnpm install happens before scripts copy
    # Look for pnpm install with --frozen-lockfile or workspace installs, not global installs
    INSTALL_LINE=$(grep -n "RUN.*pnpm install.*frozen-lockfile\|RUN.*pnpm install[^-].*workspace\|RUN.*pnpm install$" "$dockerfile" | head -1 | cut -d: -f1 || echo "0")
    SCRIPTS_LINE=$(grep -n "COPY scripts" "$dockerfile" | head -1 | cut -d: -f1 || echo "0")
    
    if [ "$INSTALL_LINE" != "0" ] && [ "$SCRIPTS_LINE" = "0" ]; then
        echo "  ❌ ERROR: Missing 'COPY scripts ./scripts' before workspace install command"
        ERRORS=$((ERRORS + 1))
    elif [ "$INSTALL_LINE" != "0" ] && [ "$SCRIPTS_LINE" != "0" ] && [ "$INSTALL_LINE" -lt "$SCRIPTS_LINE" ]; then
        echo "  ❌ ERROR: 'COPY scripts' must come BEFORE workspace install command"
        echo "     Install at line $INSTALL_LINE, Scripts at line $SCRIPTS_LINE"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ Build order correct"
    fi
    
    # Check for pnpm installation
    if ! grep -q "npm install -g pnpm" "$dockerfile"; then
        echo "  ⚠️  WARNING: Missing explicit pnpm installation"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check for health checks in production files
    if [[ "$dockerfile" == *"production"* ]] || [[ "$dockerfile" == *"staging"* ]]; then
        if ! grep -q "HEALTHCHECK" "$dockerfile"; then
            echo "  ⚠️  WARNING: Missing HEALTHCHECK in production Dockerfile"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
    
    # Check for non-root user in production
    if [[ "$dockerfile" == *"production"* ]] || [[ "$dockerfile" == *"staging"* ]]; then
        if ! grep -q "USER node\|USER nodejs\|USER ectropy" "$dockerfile"; then
            echo "  ⚠️  WARNING: Missing non-root USER in production Dockerfile"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
done

echo ""
echo "📊 Audit Results:"
echo "   Errors: $ERRORS"
echo "   Warnings: $WARNINGS"

if [ "$ERRORS" -gt 0 ]; then
    echo "❌ Critical issues found. Fix errors before building."
    exit 1
else
    echo "✅ No critical issues found."
fi