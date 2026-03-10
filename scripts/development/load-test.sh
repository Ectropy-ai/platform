#!/bin/bash
echo "🚀 Load Testing MCP Server"

# Install k6 if not present
if ! command -v k6 &> /dev/null; then
  sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
fi

# Create k6 test script
cat > /tmp/mcp-load-test.js << 'SCRIPT'
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
  },
};

export default function () {
  const res = http.post('http://localhost:3001/api/semantic-search', 
    JSON.stringify({ query: 'construction safety', limit: 5 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}
SCRIPT

# Run load test
k6 run /tmp/mcp-load-test.js
