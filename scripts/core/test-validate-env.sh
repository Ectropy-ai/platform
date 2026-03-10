#!/bin/bash
# =============================================================================
# Test Suite for Environment Variable Validation Utility
# =============================================================================
# Tests the validate-env.sh script with various scenarios
#
# Usage: bash scripts/core/test-validate-env.sh
#
# Exit Codes:
#   0 - All tests passed
#   1 - One or more tests failed
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE_SCRIPT="${SCRIPT_DIR}/validate-env.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test helper functions
test_start() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Test $TESTS_RUN: $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

test_pass() {
  TESTS_PASSED=$((TESTS_PASSED + 1))
  echo -e "${GREEN}✅ PASS: $1${NC}"
}

test_fail() {
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo -e "${RED}❌ FAIL: $1${NC}"
}

# Start test suite
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Environment Variable Validation - Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 1: Script exists and is executable
test_start "Script exists and is executable"
if [ -f "$VALIDATE_SCRIPT" ] && [ -x "$VALIDATE_SCRIPT" ]; then
  test_pass "Script found and is executable"
else
  test_fail "Script not found or not executable: $VALIDATE_SCRIPT"
  exit 1
fi

# Test 2: Requirements files exist
test_start "Requirements files exist"
REQUIRED_FILES=(
  "${SCRIPT_DIR}/required-env-vars-ci.txt"
  "${SCRIPT_DIR}/required-env-vars-staging.txt"
  "${SCRIPT_DIR}/required-env-vars-production.txt"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    test_pass "Found: $(basename $file)"
  else
    test_fail "Missing: $(basename $file)"
  fi
done

# Test 3: Invalid environment returns exit code 2
test_start "Invalid environment returns exit code 2"
if bash "$VALIDATE_SCRIPT" invalid_env > /dev/null 2>&1; then
  test_fail "Script should have failed for invalid environment"
else
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 2 ]; then
    test_pass "Correct exit code 2 for invalid environment"
  else
    test_fail "Expected exit code 2, got $EXIT_CODE"
  fi
fi

# Test 4: Missing required variables returns exit code 1
test_start "Missing required variables returns exit code 1"
# Clear all environment variables that might be set
unset NODE_ENV DATABASE_HOST DATABASE_PASSWORD
if bash "$VALIDATE_SCRIPT" ci > /dev/null 2>&1; then
  test_fail "Script should have failed with missing variables"
else
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 1 ]; then
    test_pass "Correct exit code 1 for missing variables"
  else
    test_fail "Expected exit code 1, got $EXIT_CODE"
  fi
fi

# Test 5: All required CI variables present returns exit code 0
test_start "All required CI variables present returns exit code 0"
export NODE_ENV=test
export CI=true
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export DATABASE_NAME=test_db
export DATABASE_USER=test_user
export DATABASE_PASSWORD=test_password
export REDIS_HOST=localhost
export REDIS_PORT=6379
export API_GATEWAY_PORT=4000
export MCP_PORT=3001
export WEB_PORT=3000
export JWT_SECRET=test_jwt_secret
export JWT_REFRESH_SECRET=test_jwt_refresh_secret
export SESSION_SECRET=test_session_secret
export GOOGLE_CLIENT_ID=test_client_id
export GOOGLE_CLIENT_SECRET=test_client_secret
export TEST_GOOGLE_EMAIL=test@example.com
export TEST_GOOGLE_PASSWORD=test_password

if bash "$VALIDATE_SCRIPT" ci > /dev/null 2>&1; then
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    test_pass "Correct exit code 0 with all required variables"
  else
    test_fail "Expected exit code 0, got $EXIT_CODE"
  fi
else
  test_fail "Script failed with all required variables present"
fi

# Test 6: Sensitive values are masked in output
test_start "Sensitive values are masked in output"
OUTPUT=$(bash "$VALIDATE_SCRIPT" ci 2>&1 || true)
if echo "$OUTPUT" | grep -q "DATABASE_PASSWORD (\\*\\*\\*\\*)"; then
  test_pass "DATABASE_PASSWORD is masked"
else
  test_fail "DATABASE_PASSWORD not properly masked"
fi

if echo "$OUTPUT" | grep -q "JWT_SECRET (\\*\\*\\*\\*)"; then
  test_pass "JWT_SECRET is masked"
else
  test_fail "JWT_SECRET not properly masked"
fi

# Test 7: Optional variables don't cause failure
test_start "Optional variables don't cause failure"
unset REDIS_PASSWORD MCP_API_KEY METRICS_PORT
if bash "$VALIDATE_SCRIPT" ci > /dev/null 2>&1; then
  test_pass "Script passes with optional variables unset"
else
  test_fail "Script should not fail for missing optional variables"
fi

# Test 8: Script provides helpful error messages
test_start "Script provides helpful error messages"
unset DATABASE_PASSWORD
OUTPUT=$(bash "$VALIDATE_SCRIPT" ci 2>&1 || true)
if echo "$OUTPUT" | grep -q "Missing required variables:"; then
  test_pass "Error message mentions missing required variables"
else
  test_fail "Error message doesn't mention missing required variables"
fi

if echo "$OUTPUT" | grep -q "DATABASE_PASSWORD"; then
  test_pass "Error message lists DATABASE_PASSWORD"
else
  test_fail "Error message doesn't list DATABASE_PASSWORD"
fi

# Cleanup
unset NODE_ENV CI DATABASE_HOST DATABASE_PORT DATABASE_NAME DATABASE_USER DATABASE_PASSWORD
unset REDIS_HOST REDIS_PORT API_GATEWAY_PORT MCP_PORT WEB_PORT
unset JWT_SECRET JWT_REFRESH_SECRET SESSION_SECRET
unset GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TEST_GOOGLE_EMAIL TEST_GOOGLE_PASSWORD

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Tests Run: $TESTS_RUN"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
  echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
else
  echo "Tests Failed: $TESTS_FAILED"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed!${NC}"
  exit 1
fi
