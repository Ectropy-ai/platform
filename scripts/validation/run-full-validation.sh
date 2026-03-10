#!/bin/bash
################################################################################
# Full Validation Runner
# 
# Purpose: Orchestrates MCP health and E2E test validation, generates reports,
# and updates CURRENT_TRUTH.md
#
# Usage: bash scripts/validation/run-full-validation.sh
################################################################################

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="$REPO_ROOT/tmp/validation-reports"
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
MARKDOWN_REPORT="$REPORTS_DIR/validation-report-${TIMESTAMP}.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "═══════════════════════════════════════════════════════════════"
echo "  MCP Server & E2E Test Validation Suite"
echo "═══════════════════════════════════════════════════════════════"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Temp files for JSON reports
MCP_REPORT="$REPORTS_DIR/mcp-health.json"
E2E_REPORT="$REPORTS_DIR/e2e-tests.json"

# Initialize markdown report
cat > "$MARKDOWN_REPORT" << 'EOF'
# MCP Server Health & E2E Test Validation Report

**Validation Date:** TIMESTAMP_PLACEHOLDER
**Repository:** luhtech/Ectropy
**Environment:** Staging (https://staging.ectropy.ai)

---

EOF

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: MCP Server Health Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run MCP validation
if bash "$SCRIPT_DIR/validate-mcp-health.sh" "$MCP_REPORT"; then
    echo -e "${GREEN}✓ MCP validation completed successfully${NC}"
    MCP_STATUS="success"
else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 2 ]; then
        echo -e "${YELLOW}⚠ MCP validation completed with warnings${NC}"
        MCP_STATUS="degraded"
    else
        echo -e "${RED}✗ MCP validation failed${NC}"
        MCP_STATUS="failed"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: E2E Test Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Run E2E validation
if bash "$SCRIPT_DIR/validate-e2e-tests-mcp.sh" "$E2E_REPORT"; then
    echo -e "${GREEN}✓ E2E validation completed successfully${NC}"
    E2E_STATUS="success"
else
    echo -e "${YELLOW}⚠ E2E validation completed with issues${NC}"
    E2E_STATUS="issues"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Generating Reports"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Update timestamp in markdown
sed -i "s/TIMESTAMP_PLACEHOLDER/$(date -u +"%Y-%m-%d %H:%M:%S UTC")/g" "$MARKDOWN_REPORT"

# Generate MCP section
cat >> "$MARKDOWN_REPORT" << 'EOF'
## MCP Server Health Report

### Tools Endpoint Status
EOF

if [ -f "$MCP_REPORT" ]; then
    TOOLS_STATUS=$(jq -r '.tools_endpoint.status // "unknown"' "$MCP_REPORT")
    TOOLS_HTTP=$(jq -r '.tools_endpoint.http_code // "N/A"' "$MCP_REPORT")
    TOOLS_COUNT=$(jq -r '.tools_endpoint.tools_count // 0' "$MCP_REPORT")
    
    cat >> "$MARKDOWN_REPORT" << EOF
- **URL:** /mcp/tools
- **Response Code:** $TOOLS_HTTP
- **Status:** $TOOLS_STATUS
- **Tools Count:** $TOOLS_COUNT/6

EOF
    
    if [ "$TOOLS_COUNT" -gt 0 ]; then
        echo "**Tools List:**" >> "$MARKDOWN_REPORT"
        jq -r '.tools_endpoint.tools[]? | "1. **" + .name + "**: " + .description' "$MCP_REPORT" 2>/dev/null >> "$MARKDOWN_REPORT" || true
        echo "" >> "$MARKDOWN_REPORT"
    fi
fi

# Generate Health section
cat >> "$MARKDOWN_REPORT" << 'EOF'

### Health Endpoint Status
EOF

if [ -f "$MCP_REPORT" ]; then
    HEALTH_STATUS=$(jq -r '.health_endpoint.status // "unknown"' "$MCP_REPORT")
    HEALTH_HTTP=$(jq -r '.health_endpoint.http_code // "N/A"' "$MCP_REPORT")
    HEALTH_SCORE=$(jq -r '.health_score // 0' "$MCP_REPORT")
    OVERALL_STATUS=$(jq -r '.overall_status // "unknown"' "$MCP_REPORT")
    
    cat >> "$MARKDOWN_REPORT" << EOF
- **URL:** /mcp/health
- **Response Code:** $HEALTH_HTTP
- **Status:** $HEALTH_STATUS
- **Health Score:** $HEALTH_SCORE/100
- **Overall Assessment:** $OVERALL_STATUS

EOF
    
    # Add component breakdown if available
    COMPONENTS=$(jq -r '.health_endpoint.data.components?' "$MCP_REPORT" 2>/dev/null || echo "null")
    if [ "$COMPONENTS" != "null" ] && [ "$COMPONENTS" != "" ]; then
        echo "**Component Breakdown:**" >> "$MARKDOWN_REPORT"
        jq -r '.health_endpoint.data.components? | to_entries[]? | "- " + .key + ": " + (.value.score // .value | tostring)' "$MCP_REPORT" 2>/dev/null >> "$MARKDOWN_REPORT" || true
        echo "" >> "$MARKDOWN_REPORT"
    fi
fi

# MCP Issues
cat >> "$MARKDOWN_REPORT" << 'EOF'

### Issues Found
EOF

if [ -f "$MCP_REPORT" ]; then
    MCP_ISSUES=$(jq '.issues | length' "$MCP_REPORT")
    if [ "$MCP_ISSUES" -gt 0 ]; then
        jq -r '.issues[] | "- " + .' "$MCP_REPORT" >> "$MARKDOWN_REPORT"
    else
        echo "- None" >> "$MARKDOWN_REPORT"
    fi
    echo "" >> "$MARKDOWN_REPORT"
fi

# MCP Recommendations
cat >> "$MARKDOWN_REPORT" << 'EOF'

### Recommendations
EOF

if [ -f "$MCP_REPORT" ]; then
    MCP_RECS=$(jq '.recommendations | length' "$MCP_REPORT")
    if [ "$MCP_RECS" -gt 0 ]; then
        jq -r '.recommendations[] | "- **[" + .priority + "]** " + .text' "$MCP_REPORT" >> "$MARKDOWN_REPORT"
    else
        echo "- None - MCP server is operating normally" >> "$MARKDOWN_REPORT"
    fi
    echo "" >> "$MARKDOWN_REPORT"
fi

# Generate E2E section
cat >> "$MARKDOWN_REPORT" << 'EOF'

---

## E2E Test Validation Report

### Test Execution Summary
EOF

if [ -f "$E2E_REPORT" ]; then
    RUN_ID=$(jq -r '.workflow_run.id // "N/A"' "$E2E_REPORT")
    RUN_URL=$(jq -r '.workflow_run.url // "N/A"' "$E2E_REPORT")
    RUN_CONCLUSION=$(jq -r '.workflow_run.conclusion // "unknown"' "$E2E_REPORT")
    EXECUTED=$(jq -r '.test_execution.executed // false' "$E2E_REPORT")
    TOTAL=$(jq -r '.test_execution.total_tests // 0' "$E2E_REPORT")
    PASSED=$(jq -r '.test_execution.passed // 0' "$E2E_REPORT")
    FAILED=$(jq -r '.test_execution.failed // 0' "$E2E_REPORT")
    SKIPPED=$(jq -r '.test_execution.skipped // 0' "$E2E_REPORT")
    
    cat >> "$MARKDOWN_REPORT" << EOF
- **Workflow Run:** #$RUN_ID
- **Run URL:** $RUN_URL
- **Run Conclusion:** $RUN_CONCLUSION
- **Tests Executed:** $EXECUTED
- **Total Tests:** $TOTAL
- **Passed:** $PASSED
- **Failed:** $FAILED
- **Skipped:** $SKIPPED

EOF
    
    # Test files
    TEST_FILES_COUNT=$(jq '.test_files | length' "$E2E_REPORT" 2>/dev/null || echo "0")
    if [ "$TEST_FILES_COUNT" -gt 0 ]; then
        echo "### Test Files Executed" >> "$MARKDOWN_REPORT"
        echo "" >> "$MARKDOWN_REPORT"
        jq -r '.test_files[] | "- " + .' "$E2E_REPORT" >> "$MARKDOWN_REPORT"
        echo "" >> "$MARKDOWN_REPORT"
    fi
fi

# OAuth status
cat >> "$MARKDOWN_REPORT" << 'EOF'

### OAuth Status
EOF

if [ -f "$E2E_REPORT" ]; then
    OAUTH_STATUS=$(jq -r '.oauth_status.status // "unknown"' "$E2E_REPORT")
    OAUTH_EVIDENCE=$(jq -r '.oauth_status.evidence // "No data"' "$E2E_REPORT")
    OAUTH_IMPACT=$(jq -r '.oauth_status.impact // "Unknown"' "$E2E_REPORT")
    
    cat >> "$MARKDOWN_REPORT" << EOF
- **Status:** $OAUTH_STATUS
- **Evidence:** $OAUTH_EVIDENCE
- **Impact:** $OAUTH_IMPACT

EOF
fi

# E2E Issues
cat >> "$MARKDOWN_REPORT" << 'EOF'

### Issues Found
EOF

if [ -f "$E2E_REPORT" ]; then
    E2E_ISSUES=$(jq '.issues | length' "$E2E_REPORT")
    if [ "$E2E_ISSUES" -gt 0 ]; then
        jq -r '.issues[] | "- " + .' "$E2E_REPORT" >> "$MARKDOWN_REPORT"
    else
        echo "- None" >> "$MARKDOWN_REPORT"
    fi
    echo "" >> "$MARKDOWN_REPORT"
fi

# E2E Recommendations
cat >> "$MARKDOWN_REPORT" << 'EOF'

### Recommendations
EOF

if [ -f "$E2E_REPORT" ]; then
    E2E_RECS=$(jq '.recommendations | length' "$E2E_REPORT")
    if [ "$E2E_RECS" -gt 0 ]; then
        jq -r '.recommendations[] | "- **[" + .priority + "]** " + .text' "$E2E_REPORT" >> "$MARKDOWN_REPORT"
    else
        echo "- None - E2E tests are functioning normally" >> "$MARKDOWN_REPORT"
    fi
    echo "" >> "$MARKDOWN_REPORT"
fi

# Summary section
cat >> "$MARKDOWN_REPORT" << 'EOF'

---

## Overall Summary

### Status Overview
EOF

cat >> "$MARKDOWN_REPORT" << EOF
- **MCP Server:** $MCP_STATUS
- **E2E Tests:** $E2E_STATUS

EOF

# Determine if critical issues exist
CRITICAL=false
if [ -f "$MCP_REPORT" ]; then
    P0_COUNT=$(jq '[.recommendations[] | select(.priority == "P0")] | length' "$MCP_REPORT")
    if [ "$P0_COUNT" -gt 0 ]; then
        CRITICAL=true
    fi
fi

if [ -f "$E2E_REPORT" ]; then
    P0_COUNT=$(jq '[.recommendations[] | select(.priority == "P0")] | length' "$E2E_REPORT")
    if [ "$P0_COUNT" -gt 0 ]; then
        CRITICAL=true
    fi
fi

if [ "$CRITICAL" = true ]; then
    cat >> "$MARKDOWN_REPORT" << 'EOF'

### ⚠️ Critical Issues Detected
This validation has identified P0 (critical priority) issues that require immediate attention. Please review the recommendations above.

EOF
else
    cat >> "$MARKDOWN_REPORT" << 'EOF'

### ✓ No Critical Issues
No P0 (critical priority) issues were detected. Any recommendations above are for optimization or monitoring purposes.

EOF
fi

cat >> "$MARKDOWN_REPORT" << 'EOF'

---

**Generated by:** `scripts/validation/run-full-validation.sh`
EOF

echo -e "${GREEN}✓ Markdown report generated${NC}"
echo "Location: $MARKDOWN_REPORT"

# Display report
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Report Preview"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
head -50 "$MARKDOWN_REPORT"
echo ""
echo "... (see full report at $MARKDOWN_REPORT)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Updating CURRENT_TRUTH.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

CURRENT_TRUTH="$REPO_ROOT/docs/CURRENT_TRUTH.md"

if [ ! -f "$CURRENT_TRUTH" ]; then
    echo -e "${RED}✗ CURRENT_TRUTH.md not found${NC}"
    exit 1
fi

# Create backup
cp "$CURRENT_TRUTH" "$CURRENT_TRUTH.backup-${TIMESTAMP}"
echo -e "${GREEN}✓ Created backup of CURRENT_TRUTH.md${NC}"

# Prepare update entry
UPDATE_ENTRY="### $(date -u +"%Y-%m-%d"): MCP Server Health & E2E Test Validation

**Priority**: 🟢 P2 - Monitoring & Validation
**Status**: ✅ COMPLETE - Health check performed
**Impact**: System health documented and verified

**Validation Summary**:
- MCP Server Status: $MCP_STATUS
- E2E Tests Status: $E2E_STATUS
"

if [ -f "$MCP_REPORT" ]; then
    HEALTH_SCORE=$(jq -r '.health_score // 0' "$MCP_REPORT")
    TOOLS_COUNT=$(jq -r '.tools_endpoint.tools_count // 0' "$MCP_REPORT")
    UPDATE_ENTRY+="- MCP Health Score: $HEALTH_SCORE/100
- MCP Tools Available: $TOOLS_COUNT/6
"
fi

if [ -f "$E2E_REPORT" ]; then
    EXECUTED=$(jq -r '.test_execution.executed' "$E2E_REPORT")
    if [ "$EXECUTED" = "true" ]; then
        TOTAL=$(jq -r '.test_execution.total_tests' "$E2E_REPORT")
        PASSED=$(jq -r '.test_execution.passed' "$E2E_REPORT")
        UPDATE_ENTRY+="- E2E Tests Executed: $TOTAL ($PASSED passed)
"
    else
        UPDATE_ENTRY+="- E2E Tests: Setup only (no test execution detected)
"
    fi
    
    OAUTH=$(jq -r '.oauth_status.status' "$E2E_REPORT")
    UPDATE_ENTRY+="- OAuth Status: $OAUTH
"
fi

UPDATE_ENTRY+="
**Full Report**: \`tmp/validation-reports/validation-report-${TIMESTAMP}.md\`

**Next Steps**:
"

# Add recommendations as next steps
if [ -f "$MCP_REPORT" ]; then
    P0_RECS=$(jq -r '[.recommendations[] | select(.priority == "P0")] | .[] | .text' "$MCP_REPORT" 2>/dev/null || echo "")
    if [ -n "$P0_RECS" ]; then
        echo "$P0_RECS" | while read -r rec; do
            UPDATE_ENTRY+="- [P0] $rec
"
        done
    fi
fi

if [ -f "$E2E_REPORT" ]; then
    P0_RECS=$(jq -r '[.recommendations[] | select(.priority == "P0")] | .[] | .text' "$E2E_REPORT" 2>/dev/null || echo "")
    if [ -n "$P0_RECS" ]; then
        echo "$P0_RECS" | while read -r rec; do
            UPDATE_ENTRY+="- [P0] $rec
"
        done
    fi
fi

if ! grep -q "P0" <<< "$UPDATE_ENTRY"; then
    UPDATE_ENTRY+="- Continue monitoring system health
- Re-run validation weekly
"
fi

UPDATE_ENTRY+="
---

"

# Insert update at the top of Recent Changes section
awk -v entry="$UPDATE_ENTRY" '
    /## Recent Changes/ { 
        print; 
        print ""; 
        print entry; 
        next 
    }
    { print }
' "$CURRENT_TRUTH" > "$CURRENT_TRUTH.tmp" && mv "$CURRENT_TRUTH.tmp" "$CURRENT_TRUTH"

echo -e "${GREEN}✓ Updated CURRENT_TRUTH.md${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Validation Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Reports generated:"
echo "  - Markdown: $MARKDOWN_REPORT"
echo "  - MCP JSON: $MCP_REPORT"
echo "  - E2E JSON: $E2E_REPORT"
echo ""
echo "CURRENT_TRUTH.md has been updated with validation results."
echo ""

# Return appropriate exit code
if [ "$CRITICAL" = true ]; then
    echo -e "${RED}⚠ Critical issues detected - review recommendations${NC}"
    exit 1
elif [ "$MCP_STATUS" = "failed" ] || [ "$E2E_STATUS" = "failed" ]; then
    echo -e "${YELLOW}⚠ Some validations failed - review reports${NC}"
    exit 2
else
    echo -e "${GREEN}✓ All validations passed${NC}"
    exit 0
fi
