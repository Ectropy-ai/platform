#!/bin/bash

echo "📊 MCP Performance Benchmark"

# Install Apache Bench if needed
apt-get install -y apache2-utils >/tmp/ab.log && tail -n 20 /tmp/ab.log

# Start server
CI=1 pnpm nx serve mcp-server --output-style=stream \>/tmp/mcp.log 2>&1 \&
SERVER_PID=$!
sleep 5

# Benchmark semantic search (1000 requests, 10 concurrent)
echo "Benchmarking semantic search..."
cat > /tmp/search-payload.json <<'PAYLOAD'
{"query":"test","limit":1}
PAYLOAD
ab -n 1000 -c 10 -T application/json \
   -p /tmp/search-payload.json \
   http://localhost:3001/api/semantic-search/

# Check response times
echo "Target: <200ms P95 latency"

# Security scan
echo "Running security audit..."
pnpm audit --audit-level=moderate
pnpm nx run mcp-server:lint

kill $SERVER_PID
