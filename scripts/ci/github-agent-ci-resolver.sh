#!/bin/bash

# GitHub Agent CI Pipeline Resolver using MCP Server
set -e

MCP_ENDPOINT=${MCP_ENDPOINT:-"http://localhost:3001"}
ENVIRONMENT=${ENVIRONMENT:-"dev"}

echo "🤖 GitHub Agent CI Resolver - Powered by MCP Server"
echo "Environment: $ENVIRONMENT"
echo "MCP Endpoint: $MCP_ENDPOINT"

# Function to analyze current CI issues
analyze_ci_issues() {
  echo "🔍 Analyzing CI pipeline issues..."
  
  # Get failed workflow runs
  gh run list --status=failure --limit=5 --json=conclusion,status,workflowName,url > failed_runs.json
  
  # Send to MCP for analysis
  curl -X POST "$MCP_ENDPOINT/api/tools/call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $GITHUB_AGENT_TOKEN" \
    -d '{
      "tool": "analyze_ci_failures",
      "parameters": {
        "failed_runs": "'$(cat failed_runs.json | jq -c .)'"
      }
    }' | jq '.result' > ci_analysis.json
  
  echo "✅ CI analysis complete"
}

# Function to apply MCP-generated fixes
apply_mcp_fixes() {
  echo "🔧 Applying MCP-generated fixes..."
  
  while IFS= read -r fix; do
    echo "Applying fix: $fix"
    
    # Get fix details from MCP
    curl -X POST "$MCP_ENDPOINT/api/tools/call" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $GITHUB_AGENT_TOKEN" \
      -d '{
        "tool": "generate_fix_script",
        "parameters": {
          "issue": "'$fix'"
        }
      }' | jq -r '.result.script' > fix_script.sh
    
    # Execute fix if safe
    if [[ $(wc -l < fix_script.sh) -lt 20 ]]; then
      chmod +x fix_script.sh
      ./fix_script.sh
      echo "✅ Applied fix: $fix"
    else
      echo "⚠️ Fix script too large, manual review needed: $fix"
    fi
    
  done < <(jq -r '.fixes[]' ci_analysis.json)
}

# Main execution
main() {
  analyze_ci_issues
  apply_mcp_fixes
  
  echo "🎯 GitHub Agent CI Resolution Complete!"
  echo "📊 Results:"
  jq '.summary' ci_analysis.json
}

main "$@"