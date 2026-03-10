#!/bin/bash
# Database Configuration Generator
# Generates database-config.json from template and environment variables

set -euo pipefail

CONFIG_TEMPLATE=".devcontainer/database-config.template.json"
CONFIG_OUTPUT=".devcontainer/database-config.json"
ENV_FILE=".devcontainer/.env.dev"

echo "🔧 Database Configuration Generator"
echo "===================================="

# Check if template exists
if [ ! -f "$CONFIG_TEMPLATE" ]; then
    echo "❌ Template file not found: $CONFIG_TEMPLATE"
    exit 1
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo "💡 Please ensure $ENV_FILE exists with required database variables"
    exit 1
fi

# Source environment variables
echo "📝 Loading environment variables from $ENV_FILE"
set -a  # automatically export all variables
source "$ENV_FILE"
set +a  # stop automatic export

# Verify required variables
required_vars=("DATABASE_HOST" "DATABASE_PORT" "DATABASE_NAME" "DATABASE_USER" "DB_PASSWORD" "REDIS_HOST" "REDIS_PORT" "QDRANT_HOST" "QDRANT_PORT")
for var in "${required_vars[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "❌ Required environment variable not set: $var"
        exit 1
    fi
done

echo "✅ All required environment variables found"

# Generate config file by substituting variables
echo "🔄 Generating database configuration..."

# Use envsubst to substitute environment variables in template
if command -v envsubst >/dev/null 2>&1; then
    envsubst < "$CONFIG_TEMPLATE" > "$CONFIG_OUTPUT"
else
    # Fallback: manual substitution using sed
    cp "$CONFIG_TEMPLATE" "$CONFIG_OUTPUT"
    sed -i "s/\${DATABASE_HOST}/$DATABASE_HOST/g" "$CONFIG_OUTPUT"
    sed -i "s/\${DATABASE_PORT}/$DATABASE_PORT/g" "$CONFIG_OUTPUT"
    sed -i "s/\${DATABASE_NAME}/$DATABASE_NAME/g" "$CONFIG_OUTPUT"
    sed -i "s/\${DATABASE_USER}/$DATABASE_USER/g" "$CONFIG_OUTPUT"
    sed -i "s/\${DB_PASSWORD}/$DB_PASSWORD/g" "$CONFIG_OUTPUT"
    sed -i "s/\${REDIS_HOST}/$REDIS_HOST/g" "$CONFIG_OUTPUT"
    sed -i "s/\${REDIS_PORT}/$REDIS_PORT/g" "$CONFIG_OUTPUT"
    sed -i "s/\${REDIS_PASSWORD:-}/${REDIS_PASSWORD:-}/g" "$CONFIG_OUTPUT"
    sed -i "s/\${QDRANT_HOST}/$QDRANT_HOST/g" "$CONFIG_OUTPUT"
    sed -i "s/\${QDRANT_PORT}/$QDRANT_PORT/g" "$CONFIG_OUTPUT"
    sed -i "s/\${QDRANT_API_KEY:-}/${QDRANT_API_KEY:-}/g" "$CONFIG_OUTPUT"
fi

# Update timestamp
current_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sed -i "s/AUTO_GENERATED/$current_time/g" "$CONFIG_OUTPUT"

# Validate generated JSON
if command -v python3 >/dev/null 2>&1; then
    if python3 -m json.tool "$CONFIG_OUTPUT" >/dev/null 2>&1; then
        echo "✅ Generated configuration has valid JSON structure"
    else
        echo "❌ Generated configuration has invalid JSON structure"
        exit 1
    fi
elif command -v node >/dev/null 2>&1; then
    if node -e "JSON.parse(require('fs').readFileSync('$CONFIG_OUTPUT', 'utf8'))" >/dev/null 2>&1; then
        echo "✅ Generated configuration has valid JSON structure"
    else
        echo "❌ Generated configuration has invalid JSON structure"
        exit 1
    fi
fi

# Set appropriate permissions
chmod 600 "$CONFIG_OUTPUT"
echo "🔒 Set secure permissions (600) on $CONFIG_OUTPUT"

echo "✅ Database configuration generated successfully: $CONFIG_OUTPUT"
echo "🔐 Configuration file contains sensitive data and is properly secured"
echo ""
echo "📋 Configuration summary:"
echo "   Database: ${DATABASE_USER}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"
echo "   Redis: ${REDIS_HOST}:${REDIS_PORT}"
echo "   Qdrant: ${QDRANT_HOST}:${QDRANT_PORT}"