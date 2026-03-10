#!/bin/bash
# Stop test services after CI smoke tests
# Cleanup docker compose services

echo "🧹 Stopping test services..."

# Check if docker-compose.test.yml exists
if [ ! -f "docker-compose.test.yml" ]; then
    echo "⚠️  docker-compose.test.yml not found"
    exit 0
fi

# Stop and remove containers
docker compose -f docker-compose.test.yml down -v || true

echo "✅ Services stopped"
exit 0
