#!/bin/bash
# Development environment initialization

set -e

echo "🏗️  Initializing Federated Construction Platform..."

# Install dependencies
if [ -f "package.json" ]; then
    echo "📦 Installing Node.js dependencies..."
    pnpm install
fi

# Setup environment variables
if [ ! -f ".env" ]; then
    echo "⚙️  Creating environment file..."

    JWT_SECRET=$(openssl rand -hex 32)
    JWT_REFRESH_SECRET=$(openssl rand -hex 32)
    SESSION_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 32)

    cat > .env <<ENVEOF
# Development Environment
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@postgres:5432/construction_platform
REDIS_URL=redis://redis:6379
PORT=4000
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
ENVEOF

    echo "✅ Environment file created with secure secrets"
else
    echo "✅ Environment file already exists"
    
    # Check if JWT_REFRESH_SECRET is missing or blank
    if ! grep -q "^JWT_REFRESH_SECRET=" .env || [ "$(grep "^JWT_REFRESH_SECRET=" .env | cut -d'=' -f2-)" = "" ]; then
        echo "⚠️  JWT_REFRESH_SECRET is missing or blank - adding secure value..."
        JWT_REFRESH_SECRET=$(openssl rand -hex 32)
        
        # Remove any existing JWT_REFRESH_SECRET line
        grep -v "^JWT_REFRESH_SECRET=" .env > .env.tmp || true
        
        # Add new JWT_REFRESH_SECRET
        echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET" >> .env.tmp
        mv .env.tmp .env
        
        echo "✅ JWT_REFRESH_SECRET added to existing .env file"
    fi
fi

# Run security validation to ensure everything is properly configured
echo "🔐 Running security validation..."
if [ -f "scripts/security/pre-startup-validation.sh" ]; then
    if bash scripts/security/pre-startup-validation.sh development; then
        echo "✅ Security validation passed"
    else
        echo "❌ Security validation failed - please fix issues above"
        exit 1
    fi
else
    echo "⚠️  Security validation script not found (optional)"
fi

echo "✅ Development environment ready!"
echo "🚀 Run 'pnpm run health' to verify setup"
