#!/bin/bash
set -e

# Create .env.local for CI if it doesn't exist
if [ ! -f .env.local ]; then
  echo "Creating .env.local for CI..."
  cat > .env.local <<'ENVEOF'
# CI Environment Variables
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ectropy_test
REDIS_URL=redis://localhost:6379
API_URL=http://localhost:3000
JWT_SECRET=ci-test-secret-change-in-production
ENVEOF
fi

# Validate environment
node -e "console.log('.env.local created successfully')"
