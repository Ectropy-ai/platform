#!/bin/bash
echo "📊 Simple Load Test"

# Install ab if needed
if ! command -v ab &> /dev/null; then
  sudo apt-get install -y apache2-utils
fi

# Create test payload
echo '{"query":"construction safety","limit":5}' > /tmp/test-payload.json

# Start server
./scripts/start-mcp-server.sh &
SERVER_PID=$!
sleep 5

# Run load test (100 requests, 10 concurrent)
echo "Running load test..."
ab -n 100 -c 10 -T application/json -p /tmp/test-payload.json \
   http://localhost:3001/api/semantic-search/

# Check if 95% requests under 200ms
echo "Check response times in output above"

# Cleanup
kill $SERVER_PID 2>/dev/null || true
