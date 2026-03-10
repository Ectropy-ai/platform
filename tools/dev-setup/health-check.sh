#!/bin/bash
# Health check for all services

echo "🩺 Checking system health..."

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node --version)"
else
    echo "❌ Node.js not found"
fi

# Check dependencies
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Dependencies not installed - run 'pnpm install'"
fi

# Check services (if in container)
if command -v pg_isready &> /dev/null; then
    if pg_isready -h postgres -U postgres &> /dev/null; then
        echo "✅ PostgreSQL connected"
    else
        echo "⚠️  PostgreSQL not ready"
    fi
fi

if command -v redis-cli &> /dev/null; then
    if redis-cli -h redis ping &> /dev/null; then
        echo "✅ Redis connected"
    else
        echo "⚠️  Redis not ready"  
    fi
fi

echo "🎯 Health check complete!"
