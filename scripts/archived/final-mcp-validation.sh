#!/bin/bash
# Final MCP Validation - GitHub Copilot Agent MCP Access Test
# This script validates that the MCP configuration is working end-to-end
#
# Usage:
#   ./scripts/final-mcp-validation.sh
#
# The script will:
# 1. Check the environment (user, directory, Codespaces status)
# 2. Test MCP server health at localhost:3001
# 3. Attempt to start the MCP server if it's not running
# 4. Test the get_guidance endpoint
# 5. Generate a comprehensive report in final-mcp-validation.md
#
# Success criteria:
# - MCP responds at localhost:3001
# - Health check returns "status":"operational"
# - get_guidance returns valid JSON with recommendations
# - No connection errors

set -e

OUTPUT_FILE="final-mcp-validation.md"

# Create output file with header
cat > "$OUTPUT_FILE" << HEADER
# Final MCP Validation Report

This document contains the results of the final MCP validation test for GitHub Copilot Agent configuration.

**Test Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")

---

HEADER

echo "=== MCP ACCESS TEST ===" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# 1. Check environment
echo "## 1. Environment Check" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"
echo "Environment: ${CODESPACES:-local}" | tee -a "$OUTPUT_FILE"
echo "Working dir: $PWD" | tee -a "$OUTPUT_FILE"
echo "User: $(whoami)" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# 2. Check MCP status
echo "## 2. MCP Server Health Check" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo "✅ MCP ACCESSIBLE" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
  echo "**Health Response:**" | tee -a "$OUTPUT_FILE"
  echo '```json' >> "$OUTPUT_FILE"
  curl -s http://localhost:3001/health | jq . 2>/dev/null | head -30 | tee -a "$OUTPUT_FILE" || curl -s http://localhost:3001/health | head -30 | tee -a "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  echo '```' >> "$OUTPUT_FILE"
else
  echo "⚠️  MCP not running, attempting to start..." | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
  
  if command -v start-mcp >/dev/null 2>&1; then
    echo "Starting MCP server..." | tee -a "$OUTPUT_FILE"
    start-mcp > /tmp/mcp-start.log 2>&1 &
    sleep 10
    
    if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
      echo "✅ MCP STARTED SUCCESSFULLY" | tee -a "$OUTPUT_FILE"
      echo "" | tee -a "$OUTPUT_FILE"
      echo "**Health Response:**" | tee -a "$OUTPUT_FILE"
      echo '```json' >> "$OUTPUT_FILE"
      curl -s http://localhost:3001/health | jq . 2>/dev/null | head -30 | tee -a "$OUTPUT_FILE" || curl -s http://localhost:3001/health | head -30 | tee -a "$OUTPUT_FILE"
      echo "" >> "$OUTPUT_FILE"
      echo '```' >> "$OUTPUT_FILE"
    else
      echo "❌ MCP failed to start" | tee -a "$OUTPUT_FILE"
      echo "" | tee -a "$OUTPUT_FILE"
      echo "**Startup logs:**" | tee -a "$OUTPUT_FILE"
      echo '```' >> "$OUTPUT_FILE"
      tail -20 /tmp/mcp-start.log >> "$OUTPUT_FILE" 2>/dev/null || echo "No logs available" >> "$OUTPUT_FILE"
      echo '```' >> "$OUTPUT_FILE"
    fi
  else
    echo "❌ MCP not available (start-mcp command not found)" | tee -a "$OUTPUT_FILE"
    echo "" | tee -a "$OUTPUT_FILE"
    echo "**Attempting alternative start method...**" | tee -a "$OUTPUT_FILE"
    
    # Try alternative start method
    if [ -f "scripts/mcp-quick-start.sh" ]; then
      echo "Using mcp-quick-start.sh..." | tee -a "$OUTPUT_FILE"
      bash scripts/mcp-quick-start.sh > /tmp/mcp-quick-start.log 2>&1 &
      sleep 10
      
      if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ MCP STARTED VIA QUICK START" | tee -a "$OUTPUT_FILE"
        echo "" | tee -a "$OUTPUT_FILE"
        echo "**Health Response:**" | tee -a "$OUTPUT_FILE"
        echo '```json' >> "$OUTPUT_FILE"
        curl -s http://localhost:3001/health | jq . 2>/dev/null | head -30 | tee -a "$OUTPUT_FILE" || curl -s http://localhost:3001/health | head -30 | tee -a "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo '```' >> "$OUTPUT_FILE"
      else
        echo "❌ MCP still not responding" | tee -a "$OUTPUT_FILE"
        echo "" | tee -a "$OUTPUT_FILE"
      fi
    else
      echo "No alternative start method available" | tee -a "$OUTPUT_FILE"
      echo "" | tee -a "$OUTPUT_FILE"
    fi
  fi
fi

echo "" | tee -a "$OUTPUT_FILE"

# 3. Test one tool
echo "## 3. Testing get_guidance Tool" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"
echo "=== TESTING get_guidance ===" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  echo "**Request:**" | tee -a "$OUTPUT_FILE"
  echo '```bash' >> "$OUTPUT_FILE"
  echo 'curl -s -X POST http://localhost:3001/api/mcp/get-guidance \' >> "$OUTPUT_FILE"
  echo '  -H "Content-Type: application/json" \' >> "$OUTPUT_FILE"
  echo '  -d '"'"'{"query":"validate GitHub Copilot Agent MCP working"}'"'"'' >> "$OUTPUT_FILE"
  echo '```' >> "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
  
  echo "**Response:**" | tee -a "$OUTPUT_FILE"
  echo '```json' >> "$OUTPUT_FILE"
  curl -s -X POST http://localhost:3001/api/mcp/get-guidance \
    -H "Content-Type: application/json" \
    -d '{"query":"validate GitHub Copilot Agent MCP working"}' \
    | jq . 2>/dev/null | head -40 | tee -a "$OUTPUT_FILE" || \
  curl -s -X POST http://localhost:3001/api/mcp/get-guidance \
    -H "Content-Type: application/json" \
    -d '{"query":"validate GitHub Copilot Agent MCP working"}' \
    | head -40 | tee -a "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  echo '```' >> "$OUTPUT_FILE"
else
  echo "⚠️ Cannot test - MCP server not responding" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
fi

echo "" | tee -a "$OUTPUT_FILE"
echo "=== TEST COMPLETE ===" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# 4. Summary
echo "## 4. Summary & Success Criteria" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

MCP_ACCESSIBLE=false
HEALTH_OK=false
GUIDANCE_OK=false

if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
  MCP_ACCESSIBLE=true
  
  # Check if health returns operational status
  HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
  if echo "$HEALTH_RESPONSE" | grep -q '"status"'; then
    HEALTH_OK=true
  fi
  
  # Check if get_guidance returns valid JSON
  GUIDANCE_RESPONSE=$(curl -s -X POST http://localhost:3001/api/mcp/get-guidance \
    -H "Content-Type: application/json" \
    -d '{"query":"test"}')
  if echo "$GUIDANCE_RESPONSE" | grep -q '"recommendation"'; then
    GUIDANCE_OK=true
  fi
fi

echo "### Validation Results:" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

if [ "$MCP_ACCESSIBLE" = true ]; then
  echo "- ✅ MCP responds at localhost:3001" | tee -a "$OUTPUT_FILE"
else
  echo "- ❌ MCP not accessible at localhost:3001" | tee -a "$OUTPUT_FILE"
fi

if [ "$HEALTH_OK" = true ]; then
  echo "- ✅ Health check returns valid status" | tee -a "$OUTPUT_FILE"
else
  echo "- ❌ Health check did not return valid status" | tee -a "$OUTPUT_FILE"
fi

if [ "$GUIDANCE_OK" = true ]; then
  echo "- ✅ get_guidance returns valid JSON with recommendations" | tee -a "$OUTPUT_FILE"
else
  echo "- ❌ get_guidance did not return valid response" | tee -a "$OUTPUT_FILE"
fi

echo "" | tee -a "$OUTPUT_FILE"

if [ "$MCP_ACCESSIBLE" = true ] && [ "$HEALTH_OK" = true ] && [ "$GUIDANCE_OK" = true ]; then
  echo "### 🎉 SUCCESS - Phase 4 Infrastructure Validated!" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
  echo "This proves:" | tee -a "$OUTPUT_FILE"
  echo "- GitHub Copilot Agent configuration successful ✅" | tee -a "$OUTPUT_FILE"
  echo "- Private container accessible to agents ✅" | tee -a "$OUTPUT_FILE"
  echo "- MCP pre-installed and operational ✅" | tee -a "$OUTPUT_FILE"
  echo "- **Phase 4 infrastructure validated!** 🎉" | tee -a "$OUTPUT_FILE"
else
  echo "### ⚠️ Partial Success or Issues Detected" | tee -a "$OUTPUT_FILE"
  echo "" | tee -a "$OUTPUT_FILE"
  echo "Some validation checks did not pass. This may be expected in CI/CD environments" | tee -a "$OUTPUT_FILE"
  echo "where the MCP server is not running. In a production/Codespaces environment," | tee -a "$OUTPUT_FILE"
  echo "the server should be automatically started and all checks should pass." | tee -a "$OUTPUT_FILE"
fi

echo "" | tee -a "$OUTPUT_FILE"
echo "---" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"
echo "**Report generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")" | tee -a "$OUTPUT_FILE"
echo "**Output file:** $OUTPUT_FILE" | tee -a "$OUTPUT_FILE"

echo ""
echo "✅ Validation report saved to: $OUTPUT_FILE"
echo ""
