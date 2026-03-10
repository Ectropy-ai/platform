#!/bin/sh
set -e

echo "Starting API Gateway..."

# Wait for database to be ready
echo "Waiting for database..."
until pg_isready -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

# Run migrations if enabled
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  pnpm prisma migrate deploy
fi

# ENTERPRISE DEVELOPMENT PATTERN - ALIGNED WITH STAGING/PRODUCTION:
# Build first (development mode - faster, includes source maps)
# Then execute built artifacts (same pattern as staging/production)
# This ensures consistent behavior across all environments
echo "Building api-gateway (development configuration)..."
pnpm nx build api-gateway --configuration=development

echo "Starting development server..."
echo "Execution pattern: node dist/apps/api-gateway/main.js"
echo "Health endpoint: http://0.0.0.0:4000/health"
exec node dist/apps/api-gateway/main.js
