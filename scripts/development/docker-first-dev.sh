#!/bin/bash
# Primary development entry point

echo "🚀 Ectropy Docker Development Environment"

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Start Docker Desktop first."
    exit 1
fi

# Clean build
echo "🧹 Cleaning previous builds..."
docker compose -f docker-compose.development.yml down -v

echo "🏗️ Building with no cache..."
docker compose -f docker-compose.development.yml build --no-cache

echo "🚀 Starting services..."
# Start with logs
docker compose -f docker-compose.development.yml up