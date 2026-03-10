#!/bin/bash
echo "🚀 FINAL PERFORMANCE VALIDATION"
echo "================================"

# Ensure services are optimized
echo "1. Restarting services with optimizations..."
pm2 restart ectropy-mcp
sleep 2

# Warm cache with common queries
echo "2. Warming cache..."
for query in "safety" "construction" "BIM" "concrete" "electrical"; do
  curl -s -X POST http://localhost:3001/api/semantic-search \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$query\"}" > /dev/null
done

# Test cached performance
echo "3. Testing cached responses..."
time curl -s -X POST http://localhost:3001/api/semantic-search \
  -H "Content-Type: application/json" \
  -d '{"query":"safety"}'

# Load test via nginx
echo -e "\n4. Load testing through nginx..."
ab -n 1000 -c 100 -T application/json \
   -p <(echo '{"query":"construction"}') \
   http://localhost/api/semantic-search/

# Check metrics
echo -e "\n5. System metrics:"
pm2 status
redis-cli INFO stats | grep -E "instantaneous_ops_per_sec|keyspace_hits"

echo -e "\n✅ Performance validation complete!"
