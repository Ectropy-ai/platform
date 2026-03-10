#!/usr/bin/env bash
set -euo pipefail

# Navigate to repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

printf '\n🤖 MCP Daily Rhythm Starting...\n'
printf '================================\n'
printf 'Time: %s\n\n' "$(date)"

cleanup() {
  if [[ -n "${MCP_PID:-}" ]] && kill -0 "$MCP_PID" >/dev/null 2>&1; then
    kill "$MCP_PID" || true
  fi
}

MCP_PID=""
trap cleanup EXIT

# Ensure MCP server is running
if ! curl --silent --fail --http1.0 --max-time 5 -4 http://127.0.0.1:3001/health >/dev/null 2>&1; then
  if [[ ! -f dist/apps/mcp-server/main.js ]]; then
    echo 'MCP build missing. Building dist/apps/mcp-server/main.js...'
    pnpm nx run mcp-server:build
  fi
  echo 'Starting MCP server...'
  node dist/apps/mcp-server/main.js >/tmp/mcp-daily-rhythm.log 2>&1 &
  MCP_PID=$!
  # Allow server to initialise
  sleep 3
fi

# Generate latest truth baseline
if [[ -x ./scripts/truth-baseline.sh ]]; then
  ./scripts/truth-baseline.sh
else
  echo 'Missing scripts/truth-baseline.sh; skipping baseline refresh.'
fi

# Run the MCP client daily cycle if available
if [[ -f scripts/mcp-client.js ]]; then
  node scripts/mcp-client.js
else
  echo 'Missing scripts/mcp-client.js; skipping MCP client run.'
fi

# Determine today's priority from truth service
if command -v jq >/dev/null 2>&1; then
  PRIORITY=$(curl --silent --http1.0 -4 http://127.0.0.1:3001/truth | jq -r '.nextActions[0]' 2>/dev/null || echo 'Fix web-dashboard')
else
  PRIORITY='Fix web-dashboard'
fi
printf '\n🎯 Today\''s Priority: %s\n' "$PRIORITY"

# Attempt lightweight remediation for web-dashboard if prioritised
if [[ "$PRIORITY" == *"web-dashboard"* ]]; then
  echo 'Attempting dashboard auto-fix...'
  pnpm nx reset || true
  (cd apps/web-dashboard && pnpm install) || true
  if ! pnpm nx run web-dashboard:build; then
    echo 'Manual intervention needed for web-dashboard build.'
  fi
fi

# Commit updated truth if it changed
if git diff --quiet docs/CURRENT_TRUTH.md; then
  echo 'No truth baseline changes to commit.'
else
  git add docs/CURRENT_TRUTH.md
  git commit -m "chore: MCP daily rhythm update $(date +%Y-%m-%d)" || true
fi

printf '\n✅ Daily rhythm complete\n'
