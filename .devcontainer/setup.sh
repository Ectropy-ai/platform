#!/bin/bash
# DevContainer Post-Create Setup Script

set -e

echo "🚀 Setting up Ectropy DevContainer..."

# Check for environment file
if [ ! -f .devcontainer/.env.dev ]; then
    echo "📝 Creating .env.dev from template..."
    cp .devcontainer/.env.template .devcontainer/.env.dev
    echo "⚠️  Please update .devcontainer/.env.dev with secure values"
fi

# Load environment
set -a
source .devcontainer/.env.dev 2>/dev/null || true
set +a

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

# Wait for services
echo "⏳ Waiting for services to be ready..."

# Wait for PostgreSQL
until pg_isready -h ${DATABASE_HOST:-localhost} -p ${DATABASE_PORT:-5432} 2>/dev/null; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL ready"

# Wait for Redis  
until redis-cli -h ${REDIS_HOST:-localhost} -a ${REDIS_PASSWORD:-dev_redis_2024} ping 2>/dev/null | grep -q PONG; do
    echo "Waiting for Redis..."
    sleep 2
done
echo "✅ Redis ready"

# Wait for Qdrant (with longer timeout)
for i in {1..20}; do
    if curl -f http://${QDRANT_HOST:-localhost}:${QDRANT_PORT:-6334}/health 2>/dev/null; then
        echo "✅ Qdrant ready"
        break
    fi
    echo "Waiting for Qdrant ($i/20)..."
    sleep 3
done

echo "✅ DevContainer setup complete!"
echo "📌 Run 'pnpm dev' to start the application"