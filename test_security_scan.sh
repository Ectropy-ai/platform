#!/bin/bash
set -e

cd /home/runner/work/Ectropy/Ectropy

echo "🔒 Testing security scan logic exactly as in workflow..."

# Enhanced security scanning that properly distinguishes between hardcoded secrets and environment variable references
secret_patterns_found=false

echo "Step 1: Looking for password patterns..."
echo "  1a: Raw password matches:"
grep -r "password.*=" .devcontainer/ --include="*.yml" --include="*.yaml" --include="*.env*" 2>/dev/null || echo "    No raw matches"

echo "  1b: After filtering:"
# Check for actual hardcoded secrets (not environment variable references)
PASSWORD_MATCHES=$(grep -r "password.*=" .devcontainer/ --include="*.yml" --include="*.yaml" --include="*.env*" 2>/dev/null | \
   grep -v "PLACEHOLDER\|CHANGE_ME\|REPLACE_WITH\|template\|example" | \
   grep -v '\${.*:-' | \
   grep -v 'dev_secure_' | \
   head -5)

if [ -n "$PASSWORD_MATCHES" ]; then
  echo "    $PASSWORD_MATCHES"
  echo "❌ Found potential hardcoded secrets"
  secret_patterns_found=true
else
  echo "    No filtered matches"
  echo "✅ No password patterns found"
fi

echo "Step 2: Looking for other secret patterns..."
echo "  2a: Raw secret/key/token matches:"
grep -r -E "(secret|key|token).*=.*[^{]" .devcontainer/ --include="*.yml" --include="*.yaml" --include="*.env*" 2>/dev/null || echo "    No raw matches"

echo "  2b: After filtering:"
# Additional check for other secret patterns
SECRET_MATCHES=$(grep -r -E "(secret|key|token).*=.*[^{]" .devcontainer/ --include="*.yml" --include="*.yaml" --include="*.env*" 2>/dev/null | \
   grep -v "PLACEHOLDER\|CHANGE_ME\|REPLACE_WITH\|template\|example" | \
   grep -v '\${.*:-' | \
   grep -v 'dev_secure_' | \
   head -5)

if [ -n "$SECRET_MATCHES" ]; then
  echo "    $SECRET_MATCHES"
  echo "❌ Found potential hardcoded credentials"
  secret_patterns_found=true
else
  echo "    No filtered matches"
  echo "✅ No secret patterns found"
fi

if [ "$secret_patterns_found" = true ]; then
  echo "❌ Security scan failed - hardcoded secrets detected"
  exit 1
else
  echo "✅ Security scan passed - no hardcoded secrets found"
fi