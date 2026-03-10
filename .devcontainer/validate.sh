#!/bin/bash
# Validate DevContainer Environment

echo "🔍 Validating DevContainer Environment..."

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

VALID=true

# Check files
echo "📁 Checking required files..."
for file in ".env.template" ".env.dev" "docker-compose.yml"; do
    if [ -f ".devcontainer/$file" ]; then
        echo -e "${GREEN}✓${NC} $file exists"
    else
        echo -e "${RED}✗${NC} $file missing"
        VALID=false
    fi
done

# Check environment variables
echo "🔑 Checking environment variables..."
if [ -f .devcontainer/.env.dev ]; then
    source .devcontainer/.env.dev
    for var in POSTGRES_USER REDIS_DEV_PASSWORD POSTGRES_DEV_PASSWORD; do
        if [ -z "${!var}" ]; then
            echo -e "${RED}✗${NC} $var not set"
            VALID=false
        else
            echo -e "${GREEN}✓${NC} $var configured"
        fi
    done
fi

# Check services
echo "🏥 Checking service health..."
docker compose -f .devcontainer/docker-compose.yml ps --format json 2>/dev/null | \
    jq -r '.[] | "\(.Service): \(.Health)"' 2>/dev/null || echo "Services not running"

if $VALID; then
    echo -e "\n${GREEN}✅ DevContainer environment is valid${NC}"
    exit 0
else
    echo -e "\n${RED}❌ DevContainer environment has issues${NC}"
    exit 1
fi