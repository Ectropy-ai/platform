#!/bin/bash
################################################################################
# Quick Validation Script
# 
# Purpose: Runs MCP and E2E validation and generates a simple summary report
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/tmp/validation-reports"
mkdir -p "$OUTPUT_DIR"

# Run MCP validation
echo "=== Running MCP Server Health Validation ==="
bash "$SCRIPT_DIR/validate-mcp-health.sh" "$OUTPUT_DIR/mcp-health.json" || true

# Run E2E validation
echo ""
echo "=== Running E2E Test Validation ==="
bash "$SCRIPT_DIR/validate-e2e-tests-mcp.sh" "$OUTPUT_DIR/e2e-tests.json" || true

# Generate summary
echo ""
echo "=== Validation Complete ==="
echo ""
echo "Reports generated in: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"/*.json 2>/dev/null || true

# Display MCP summary
if [ -f "$OUTPUT_DIR/mcp-health.json" ]; then
    echo ""
    echo "MCP Health Summary:"
    jq -r '
        "  Status: " + .overall_status + 
        "\n  Health Score: " + (.health_score|tostring) + "/100" + 
        "\n  Tools Count: " + (.tools_endpoint.tools_count // 0 | tostring) + "/6" +
        "\n  Issues: " + (.issues | length | tostring)
    ' "$OUTPUT_DIR/mcp-health.json"
fi

# Display E2E summary  
if [ -f "$OUTPUT_DIR/e2e-tests.json" ]; then
    echo ""
    echo "E2E Test Summary:"
    jq -r '
        "  Tests Executed: " + (.test_execution.executed | tostring) +
        "\n  OAuth Status: " + .oauth_status.status +
        "\n  Issues: " + (.issues | length | tostring) +
        "\n  Note: " + .note
    ' "$OUTPUT_DIR/e2e-tests.json"
fi

echo ""
echo "For detailed reports, see:"
echo "  - MCP: $OUTPUT_DIR/mcp-health.json"
echo "  - E2E: $OUTPUT_DIR/e2e-tests.json"
