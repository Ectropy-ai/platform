#!/bin/bash
# =============================================================================
# ECTROPY DEPENDENCY HEALTH CHECKER
# =============================================================================
# Purpose: Comprehensive dependency analysis and health monitoring
# Usage: ./scripts/dependency-health-check.sh [--fix] [--report]
# =============================================================================

set -e

# Source safe parsing utilities
source "scripts/deployment/json-utils.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPORT_DIR="reports/dependency-health"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/dependency-report-$TIMESTAMP.json"

# Ensure reports directory exists
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}ECTROPY DEPENDENCY HEALTH CHECK${NC}"
echo -e "${BLUE}==============================================================================${NC}"

# Function to log with timestamp
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    error "pnpm is not installed. Please install pnpm first."
    exit 1
fi

# Initialize report data
cat > "$REPORT_FILE" << 'EOF'
{
    "timestamp": "",
    "analysis": {
        "security": {},
        "outdated": {},
        "unused": {},
        "bundle_size": {},
        "build_health": {}
    },
    "recommendations": [],
    "metrics": {}
}
EOF

# Update timestamp in report
sed -i "s/\"timestamp\": \"\"/\"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"/" "$REPORT_FILE"

log "Starting dependency health check..."

# 1. Security Audit
log "Running security audit..."
if pnpm audit --json > "$REPORT_DIR/security-audit-$TIMESTAMP.json" 2>/dev/null; then
    VULN_COUNT=$(safe_jq "$REPORT_DIR/security-audit-$TIMESTAMP.json" ".metadata.vulnerabilities.total // 0" "0")
    if [ "$VULN_COUNT" -eq 0 ]; then
        success "No security vulnerabilities found"
    else
        warn "Found $VULN_COUNT security vulnerabilities"
        echo "  - Run 'pnpm audit --fix' to auto-fix"
        echo "  - Check $REPORT_DIR/security-audit-$TIMESTAMP.json for details"
    fi
else
    warn "Security audit completed with findings (exit code 1 is normal)"
    VULN_COUNT=$(safe_jq "$REPORT_DIR/security-audit-$TIMESTAMP.json" ".metadata.vulnerabilities.total // 0" "0")
fi

# 2. Outdated Dependencies
log "Checking for outdated dependencies..."
if npm outdated --json > "$REPORT_DIR/outdated-$TIMESTAMP.json" 2>/dev/null; then
    success "All dependencies are up to date"
    OUTDATED_COUNT=0
else
    OUTDATED_COUNT=$(safe_jq "$REPORT_DIR/outdated-$TIMESTAMP.json" "length" "0")
    warn "Found $OUTDATED_COUNT outdated dependencies"
    echo "  - Run 'npm outdated' to see details"
    echo "  - Consider updating with 'pnpm update [package]'"
fi

# 3. Unused Dependencies
log "Checking for unused dependencies..."
# Run depcheck and extract only the JSON output (last line) to handle configuration warnings
if npx depcheck --json 2>&1 | tail -1 > "$REPORT_DIR/unused-$TIMESTAMP.json" && [ -s "$REPORT_DIR/unused-$TIMESTAMP.json" ] && jq empty "$REPORT_DIR/unused-$TIMESTAMP.json" 2>/dev/null; then
    UNUSED_DEPS=$(safe_jq "$REPORT_DIR/unused-$TIMESTAMP.json" ".dependencies | length" "0")
    UNUSED_DEV_DEPS=$(safe_jq "$REPORT_DIR/unused-$TIMESTAMP.json" ".devDependencies | length" "0")
    
    if [ "$UNUSED_DEPS" -eq 0 ] && [ "$UNUSED_DEV_DEPS" -eq 0 ]; then
        success "No unused dependencies found"
    else
        warn "Found $UNUSED_DEPS unused production dependencies and $UNUSED_DEV_DEPS unused dev dependencies"
        echo "  - Check $REPORT_DIR/unused-$TIMESTAMP.json for details"
        echo "  - Consider removing with 'pnpm remove [package]'"
    fi
else
    warn "Unable to check for unused dependencies (depcheck may not be compatible with current setup)"
    # Create empty JSON file to prevent further errors
    echo '{"dependencies": [], "devDependencies": []}' > "$REPORT_DIR/unused-$TIMESTAMP.json"
    UNUSED_DEPS=0
    UNUSED_DEV_DEPS=0
fi

# 4. Bundle Size Analysis
log "Analyzing bundle sizes..."
BUNDLE_SIZE="unknown"
if [ -d "dist" ]; then
    BUNDLE_SIZE=$(du -sh dist 2>/dev/null | cut -f1 || echo "unknown")
    log "Current bundle size: $BUNDLE_SIZE"
else
    warn "No dist directory found. Run build first for bundle analysis."
fi

# 5. Build Health Check
log "Checking build health..."
BUILD_STATUS="unknown"
if pnpm nx show projects > /dev/null 2>&1; then
    success "Nx workspace is healthy"
    BUILD_STATUS="healthy"
else
    error "Nx workspace has issues"
    BUILD_STATUS="unhealthy"
fi

# 6. Node Modules Size
log "Analyzing node_modules size..."
if [ -d "node_modules" ]; then
    NODE_MODULES_SIZE=$(du -sh node_modules 2>/dev/null | cut -f1 || echo "unknown")
    log "node_modules size: $NODE_MODULES_SIZE"
else
    warn "node_modules not found"
    NODE_MODULES_SIZE="not_found"
fi

# 7. Package Count
TOTAL_PACKAGES=$(safe_yq "pnpm-lock.yaml" ".packages | keys | length" "unknown")
log "Total packages installed: $TOTAL_PACKAGES"

# Update report with findings
jq --arg vuln "$(safe_parse_number "$VULN_COUNT" "0")" \
   --arg outdated "$(safe_parse_number "$OUTDATED_COUNT" "0")" \
   --arg unused_prod "$(safe_parse_number "$UNUSED_DEPS" "0")" \
   --arg unused_dev "$(safe_parse_number "$UNUSED_DEV_DEPS" "0")" \
   --arg bundle_size "$BUNDLE_SIZE" \
   --arg node_modules_size "$NODE_MODULES_SIZE" \
   --arg build_status "$BUILD_STATUS" \
   --arg total_packages "$(safe_parse_number "$TOTAL_PACKAGES" "0")" \
   '.metrics = {
       "security_vulnerabilities": ($vuln | tonumber),
       "outdated_dependencies": ($outdated | tonumber),
       "unused_production_deps": ($unused_prod | tonumber),
       "unused_dev_deps": ($unused_dev | tonumber),
       "bundle_size": $bundle_size,
       "node_modules_size": $node_modules_size,
       "build_status": $build_status,
       "total_packages": ($total_packages | tonumber)
   }' "$REPORT_FILE" > "${REPORT_FILE}.tmp" && mv "${REPORT_FILE}.tmp" "$REPORT_FILE"

# Generate Recommendations
log "Generating recommendations..."
RECOMMENDATIONS=""

if [ "$VULN_COUNT" -gt 0 ]; then
    RECOMMENDATIONS="$RECOMMENDATIONS\"Fix $VULN_COUNT security vulnerabilities with 'pnpm audit --fix'\","
fi

if [ "$OUTDATED_COUNT" -gt 0 ]; then
    RECOMMENDATIONS="$RECOMMENDATIONS\"Update $OUTDATED_COUNT outdated dependencies\","
fi

if [ "$UNUSED_DEPS" -gt 0 ]; then
    RECOMMENDATIONS="$RECOMMENDATIONS\"Remove $UNUSED_DEPS unused production dependencies\","
fi

if [ "$UNUSED_DEV_DEPS" -gt 0 ]; then
    RECOMMENDATIONS="$RECOMMENDATIONS\"Remove $UNUSED_DEV_DEPS unused development dependencies\","
fi

# Remove trailing comma and update report
RECOMMENDATIONS=$(echo "$RECOMMENDATIONS" | sed 's/,$//')
if [ -n "$RECOMMENDATIONS" ]; then
    jq --argjson recs "[$RECOMMENDATIONS]" '.recommendations = $recs' "$REPORT_FILE" > "${REPORT_FILE}.tmp" && mv "${REPORT_FILE}.tmp" "$REPORT_FILE"
fi

# Summary
echo -e "\n${BLUE}==============================================================================${NC}"
echo -e "${BLUE}DEPENDENCY HEALTH SUMMARY${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo "Security Vulnerabilities: $VULN_COUNT"
echo "Outdated Dependencies: $OUTDATED_COUNT"
echo "Unused Production Dependencies: $UNUSED_DEPS"
echo "Unused Development Dependencies: $UNUSED_DEV_DEPS"
echo "Bundle Size: $BUNDLE_SIZE"
echo "Node Modules Size: $NODE_MODULES_SIZE"
echo "Build Status: $BUILD_STATUS"
echo "Total Packages: $TOTAL_PACKAGES"
echo ""
echo "Report saved to: $REPORT_FILE"

# Handle command line arguments
if [[ "$1" == "--fix" ]]; then
    log "Auto-fixing issues..."
    
    # Fix security vulnerabilities
    if [ "$VULN_COUNT" -gt 0 ]; then
        log "Fixing security vulnerabilities..."
        pnpm audit --fix
    fi
    
    # Note: We don't auto-remove unused dependencies as this requires manual verification
    warn "Unused dependencies require manual review before removal"
fi

if [[ "$1" == "--report" ]] || [[ "$2" == "--report" ]]; then
    log "Generating detailed report..."
    echo ""
    echo "Detailed findings:"
    echo "=================="
    
    if [ -f "$REPORT_DIR/unused-$TIMESTAMP.json" ]; then
        echo ""
        echo "Unused Production Dependencies:"
        jq -r '.dependencies[]?' "$REPORT_DIR/unused-$TIMESTAMP.json" 2>/dev/null | head -10
        
        echo ""
        echo "Unused Development Dependencies:"
        jq -r '.devDependencies[]?' "$REPORT_DIR/unused-$TIMESTAMP.json" 2>/dev/null | head -10
    fi
fi

# Exit with error code if critical issues found
if [ "$VULN_COUNT" -gt 0 ] || [ "$BUILD_STATUS" == "unhealthy" ]; then
    exit 1
else
    success "Dependency health check completed successfully!"
    exit 0
fi