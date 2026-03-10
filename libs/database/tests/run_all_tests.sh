#!/bin/bash
# Run all database validation tests for the Federated Construction Platform
# Usage: ./run_all_tests.sh [DATABASE_URL]

set -e

DB_URL=${1:-$DATABASE_URL}

# Check if we're in a Docker environment and use appropriate connection method
if command -v docker &> /dev/null && docker ps | grep -q "devcontainer-postgres-1"; then
  echo "Using Docker container for database connection..."
  POSTGRES_CONTAINER="devcontainer-postgres-1"
  RUN_SQL="docker exec -i $POSTGRES_CONTAINER psql -U postgres"
elif [ -n "$DB_URL" ]; then
  echo "Using DATABASE_URL for connection..."
  RUN_SQL="psql $DB_URL"
else
  echo "Error: Neither Docker container nor DATABASE_URL available."
  echo "Make sure PostgreSQL container is running or set DATABASE_URL environment variable."
  exit 1
fi

TEST_DIR="$(dirname "$0")"

echo "Running database test suite..."

for test in test_access_control.sql test_audit_log.sql test_rls.sql; do
  echo ""
  echo "--- Running $test ---"
  if [ -f "$TEST_DIR/$test" ]; then
    $RUN_SQL < "$TEST_DIR/$test"
    echo "--- Finished $test ---"
  else
    echo "Warning: Test file $test not found in $TEST_DIR"
  fi
done

echo ""
echo "All database tests completed. Review output above for any failures."
