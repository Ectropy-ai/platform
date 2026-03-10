#!/bin/bash
set -e

echo "🔍 Verifying MCP readiness..."
echo ""

# Track failures
FAILED_MCPS=()
SUCCESS_COUNT=0
TOTAL_CHECKS=3

# Check 1: GitHub MCP (via gh command)
echo "Checking GitHub MCP..."
if command -v gh &> /dev/null; then
  echo "✅ GitHub MCP available (gh command found)"
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
else
  echo "❌ GitHub MCP unavailable (gh command not found)"
  FAILED_MCPS+=("github")
fi
echo ""

# Check 2: Playwright MCP (via playwright command or npx playwright)
echo "Checking Playwright MCP..."
if command -v playwright &> /dev/null; then
  echo "✅ Playwright MCP available (playwright command found)"
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
elif npx playwright --version &> /dev/null 2>&1; then
  echo "✅ Playwright MCP available (via npx)"
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
else
  echo "⚠️ Playwright MCP unavailable (command not found)"
  echo "   Note: Playwright may not be required for MCP validation workflows"
  FAILED_MCPS+=("playwright")
fi
echo ""

# Check 3: Ectropy Validation MCP (via health check)
echo "Checking Ectropy Validation MCP..."
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "✅ Ectropy Validation MCP available"
  
  # Get detailed health info
  HEALTH_RESPONSE=$(curl -s http://localhost:3001/health)
  echo "   Health Response: $HEALTH_RESPONSE"
  
  # Try to get agent status
  if curl -sf http://localhost:3001/api/mcp/health > /dev/null 2>&1; then
    AGENT_STATUS=$(curl -s http://localhost:3001/api/mcp/health)
    echo "   Agent Status: Available"
  fi
  
  SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
else
  echo "❌ Ectropy Validation MCP unavailable"
  echo "   Could not reach http://localhost:3001/health"
  
  # Check if process is running
  if [ -f /tmp/mcp-server.pid ]; then
    MCP_PID=$(cat /tmp/mcp-server.pid)
    if kill -0 "$MCP_PID" 2>/dev/null; then
      echo "   Process is running (PID: $MCP_PID) but not responding"
      echo "   Last 20 lines of log:"
      tail -20 /tmp/mcp-server.log 2>/dev/null || echo "   No log file found"
    else
      echo "   Process has exited (PID: $MCP_PID)"
      echo "   Last 20 lines of log:"
      tail -20 /tmp/mcp-server.log 2>/dev/null || echo "   No log file found"
    fi
  else
    echo "   No PID file found - server may not have started"
  fi
  
  FAILED_MCPS+=("ectropy-validation")
fi
echo ""

# Summary
echo "=================================================="
echo "MCP Readiness Summary"
echo "=================================================="
echo "Successful checks: $SUCCESS_COUNT/$TOTAL_CHECKS"
echo ""

if [ ${#FAILED_MCPS[@]} -eq 0 ]; then
  echo "✅ All required MCPs are ready"
  echo ""
  echo "Available MCPs:"
  echo "  - GitHub MCP (repository operations)"
  if [[ " ${FAILED_MCPS[@]} " =~ " playwright " ]]; then
    echo "  - Playwright MCP (browser automation) - Optional"
  else
    echo "  - Playwright MCP (browser automation)"
  fi
  echo "  - Ectropy Validation MCP (validation tools)"
  echo ""
  exit 0
else
  echo "❌ Failed MCPs: ${FAILED_MCPS[*]}"
  echo ""
  
  # Determine if failure is critical
  CRITICAL_FAILED=false
  for mcp in "${FAILED_MCPS[@]}"; do
    if [ "$mcp" = "ectropy-validation" ] || [ "$mcp" = "github" ]; then
      CRITICAL_FAILED=true
      break
    fi
  done
  
  if [ "$CRITICAL_FAILED" = true ]; then
    echo "Cannot proceed without critical MCPs (github, ectropy-validation)"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check if services are running: docker ps"
    echo "2. Check MCP server logs: tail -50 /tmp/mcp-server.log"
    echo "3. Check MCP server process: ps aux | grep mcp-server"
    echo "4. Verify health endpoint: curl http://localhost:3001/health"
    echo ""
    exit 1
  else
    echo "⚠️ Non-critical MCPs failed, continuing..."
    echo "   The workflow can proceed but some features may be limited"
    echo ""
    exit 0
  fi
fi
