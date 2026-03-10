#!/bin/bash
#
# Terraform State Locking Test Script
#
# Purpose: Tests DynamoDB state locking by attempting concurrent operations
#          Validates that only one operation can acquire the lock at a time
#
# Usage:
#   bash scripts/terraform/test-state-locking.sh
#
# Exit Codes:
#   0 - Locking test passed
#   1 - Locking test failed or inconclusive
#
# Author: Ectropy Infrastructure Team
# Last Updated: 2025-10-31

set -e

# Configuration
TERRAFORM_DIR="terraform"
TEST_LOG_DIR="/tmp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 Testing DynamoDB State Locking"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if terraform is available
if ! command -v terraform &>/dev/null; then
  echo -e "${RED}❌ Terraform not installed${NC}"
  echo "   Install Terraform to run locking tests"
  exit 1
fi

# Navigate to terraform directory
cd "$TERRAFORM_DIR"

# Verify backend is initialized
if [ ! -d ".terraform" ]; then
  echo -e "${RED}❌ Terraform not initialized${NC}"
  echo "   Run 'terraform init' first"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Concurrent Plan Operations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Starting background plan (will acquire lock)..."

# Start a plan in background (acquires lock)
terraform plan -input=false > "$TEST_LOG_DIR/plan1.log" 2>&1 &
PID1=$!

echo "   Process ID: $PID1"
echo ""

# Wait for lock acquisition
echo "Waiting for lock acquisition (3 seconds)..."
sleep 3

# Try to run concurrent plan (should fail with lock error)
echo "Attempting concurrent plan (should fail with lock)..."
terraform plan -input=false > "$TEST_LOG_DIR/plan2.log" 2>&1 &
PID2=$!

echo "   Process ID: $PID2"
echo ""

# Wait for both to complete
echo "Waiting for processes to complete..."
wait $PID1
RESULT1=$?

wait $PID2
RESULT2=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "First plan exit code: $RESULT1"
echo "Second plan exit code: $RESULT2"
echo ""

# Check for lock error in second plan
if grep -q "Error acquiring the state lock\|state lock\|lock acquisition" "$TEST_LOG_DIR/plan2.log" 2>/dev/null; then
  echo -e "${GREEN}✅ State locking working correctly${NC}"
  echo "   Second plan was blocked by lock as expected"
  echo ""
  
  # Extract lock info if available
  if grep -q "Lock Info:" "$TEST_LOG_DIR/plan2.log"; then
    echo "   Lock details from second plan:"
    grep -A 5 "Lock Info:" "$TEST_LOG_DIR/plan2.log" | sed 's/^/   /'
  fi
  
  LOCK_TEST_PASSED=1
elif [ $RESULT1 -eq 0 ] && [ $RESULT2 -eq 0 ]; then
  echo -e "${YELLOW}⚠️  Both plans succeeded - lock behavior unclear${NC}"
  echo "   This may indicate:"
  echo "   - First plan completed before second started"
  echo "   - Plans were fast enough to not conflict"
  echo "   - State locking may not be working"
  echo ""
  echo "   Check logs for details:"
  echo "   - First plan: $TEST_LOG_DIR/plan1.log"
  echo "   - Second plan: $TEST_LOG_DIR/plan2.log"
  LOCK_TEST_PASSED=0
else
  echo -e "${YELLOW}⚠️  Lock behavior unclear - check logs${NC}"
  echo "   First plan: $TEST_LOG_DIR/plan1.log"
  echo "   Second plan: $TEST_LOG_DIR/plan2.log"
  echo ""
  echo "   Possible causes:"
  echo "   - Plans failed for reasons other than locking"
  echo "   - Backend configuration issues"
  echo "   - Network or AWS connectivity problems"
  LOCK_TEST_PASSED=0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Lock Release Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Wait a moment for any locks to be released
sleep 2

echo "Verifying lock was released..."
terraform plan -input=false > "$TEST_LOG_DIR/plan3.log" 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Lock released successfully${NC}"
  echo "   Plan executed without lock errors"
  echo ""
  LOCK_RELEASE_PASSED=1
elif grep -q "Error acquiring the state lock" "$TEST_LOG_DIR/plan3.log"; then
  echo -e "${RED}❌ Lock not released properly${NC}"
  echo "   State may be locked from previous operation"
  echo ""
  echo "   To manually unlock:"
  echo "   1. Get the lock ID from the error message"
  echo "   2. Run: terraform force-unlock <LOCK_ID>"
  echo ""
  cat "$TEST_LOG_DIR/plan3.log"
  LOCK_RELEASE_PASSED=0
else
  echo -e "${YELLOW}⚠️  Plan failed for other reasons${NC}"
  echo "   Check log: $TEST_LOG_DIR/plan3.log"
  echo ""
  LOCK_RELEASE_PASSED=0
fi

cd ..

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ${LOCK_TEST_PASSED:-0} -eq 1 ] && [ ${LOCK_RELEASE_PASSED:-0} -eq 1 ]; then
  echo -e "${GREEN}✅ SUCCESS: State locking is working correctly${NC}"
  echo ""
  echo "State locking validation:"
  echo "  • Concurrent operations are blocked ✓"
  echo "  • Locks are properly released ✓"
  echo "  • DynamoDB locking operational ✓"
  echo ""
  echo "Team members can now safely:"
  echo "  • Run concurrent Terraform operations"
  echo "  • Collaborate without state corruption risk"
  echo "  • Trust automatic lock management"
  echo ""
  exit 0
else
  echo -e "${YELLOW}⚠️  WARNING: State locking validation inconclusive${NC}"
  echo ""
  echo "Review test logs to diagnose issues:"
  echo "  • First plan: $TEST_LOG_DIR/plan1.log"
  echo "  • Second plan: $TEST_LOG_DIR/plan2.log"
  echo "  • Lock release test: $TEST_LOG_DIR/plan3.log"
  echo ""
  echo "Common issues:"
  echo "  • DynamoDB table permissions"
  echo "  • Network connectivity"
  echo "  • Backend configuration"
  echo "  • Plans completing too quickly to observe locking"
  echo ""
  echo "Manual verification:"
  echo "  1. Have two team members run 'terraform plan' simultaneously"
  echo "  2. One should see a lock error"
  echo "  3. After the first completes, the second should succeed"
  echo ""
  exit 1
fi
