#!/bin/bash
set -euo pipefail

echo "🏥 CI Health Check"
echo "=================="

# Check all required environment variables
required_vars=(
  "NODE_ENV"
  "POSTGRES_DEV_PASSWORD"  
  "REDIS_DEV_PASSWORD"
)

echo "🔍 Environment Variables Check:"
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "⚠️ Missing: $var (will use fallback)"
  else
    echo "✅ Found: $var"
  fi
done

# Set fallback values for CI environment
export POSTGRES_DEV_PASSWORD="${POSTGRES_DEV_PASSWORD:-dev_secure_postgres_2024}"
export REDIS_DEV_PASSWORD="${REDIS_DEV_PASSWORD:-dev_secure_redis_2024}"
export NODE_ENV="${NODE_ENV:-development}"

echo ""
echo "🔧 Service Availability Check:"

# Check if Docker is available
if command -v docker >/dev/null 2>&1; then
  echo "✅ Docker available"
else
  echo "⚠️ Docker not available (expected in some CI environments)"
fi

# Verify Node.js and pnpm
echo "📦 Tool Check:"
if node --version >/dev/null 2>&1; then
  echo "✅ Node.js: $(node --version)"
else
  echo "❌ Node.js not available"
  exit 1
fi

if pnpm --version >/dev/null 2>&1; then
  echo "✅ pnpm: $(pnpm --version)"
else
  echo "❌ pnpm not available"
  exit 1
fi

# Check dependencies
echo ""
echo "📋 Dependencies Check:"
if grep -q "jest-junit" package.json; then
  echo "✅ jest-junit dependency found"
else
  echo "❌ jest-junit dependency missing"
  exit 1
fi

# Check critical scripts
echo ""
echo "🔧 Scripts Check:"
critical_scripts=(
  "scripts/consult-repo-governor.ts"
  "scripts/setup-playwright-ci.sh"
)

for script in "${critical_scripts[@]}"; do
  if [ -f "$script" ]; then
    echo "✅ $script exists"
  else
    echo "❌ $script missing"
    exit 1
  fi
done

# Check configuration files
echo ""
echo "📄 Configuration Check:"
if [ -f ".devcontainer/.env.secure.example" ]; then
  echo "✅ Secure environment template exists"
else
  echo "❌ Secure environment template missing"
fi

if [ -f ".gitleaks.toml" ]; then
  echo "✅ GitLeaks configuration exists"
else
  echo "❌ GitLeaks configuration missing"
fi

echo ""
echo "✅ CI environment ready"
echo "🎯 All critical components validated"