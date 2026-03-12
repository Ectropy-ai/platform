#!/bin/bash
# Validate OAuth configuration for E2E tests
# Referenced by: e2e-tests.yml
# Validates that required OAuth env vars are set

echo "🔐 Validating OAuth configuration..."

MISSING=0

if [ -z "${GOOGLE_CLIENT_ID:-}" ]; then
  echo "  ❌ GOOGLE_CLIENT_ID not set"
  MISSING=1
fi

if [ -z "${GOOGLE_CLIENT_SECRET:-}" ]; then
  echo "  ❌ GOOGLE_CLIENT_SECRET not set"
  MISSING=1
fi

if [ -z "${BASE_URL:-}" ]; then
  echo "  ⚠️  BASE_URL not set (using default)"
fi

if [ "$MISSING" -eq 1 ]; then
  echo "❌ OAuth configuration incomplete"
  exit 1
fi

echo "✅ OAuth configuration valid"
exit 0
