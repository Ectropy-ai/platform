#!/bin/bash
# Script to retrieve MCP server logs from staging via SSH
# Usage: ./get-mcp-logs.sh

set -euo pipefail

echo "🔍 Retrieving MCP server logs from staging..."
echo ""

# SSH into staging and get MCP container logs
ssh -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o LogLevel=ERROR \
    root@staging.ectropy.ai << 'ENDSSH'

echo "=== MCP Container Status ==="
docker ps -a --filter name=ectropy-mcp --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
echo ""

echo "=== MCP Container Logs (last 100 lines) ==="
docker logs ectropy-mcp --tail 100 2>&1 || echo "Failed to retrieve logs"
echo ""

echo "=== MCP Container Inspect (RestartCount, Error, ExitCode) ==="
docker inspect ectropy-mcp --format '{{json .State}}' | jq '{Status, Running, Restarting, ExitCode, Error, StartedAt, FinishedAt}'
echo ""

ENDSSH

echo "✅ Log retrieval complete"
