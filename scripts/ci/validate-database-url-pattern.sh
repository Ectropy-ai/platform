#!/bin/bash
set -e

echo "🔍 Validating DATABASE_URL construction pattern across all workflows..."

# Find all workflow files
WORKFLOW_DIR=".github/workflows"
ERRORS=0
WARNINGS=0

# Check each workflow file
for workflow in "$WORKFLOW_DIR"/*.yml; do
  filename=$(basename "$workflow")
  
  # Skip archived workflows
  if [[ "$workflow" == *"/.archive/"* ]]; then
    continue
  fi
  
  # Check if workflow uses DATABASE_URL
  if grep -q "DATABASE_URL" "$workflow"; then
    echo "📄 Checking: $filename"
    
    # Check for correct pattern
    if grep -q "DATABASE_URL: postgresql://\\\${{ vars.DATABASE_USER }}:\\\${{ secrets.DB_PASSWORD }}@\\\${{ vars.DATABASE_HOST }}:\\\${{ vars.DATABASE_PORT }}/\\\${{ vars.DATABASE_NAME }}" "$workflow"; then
      echo "   ✅ Correct pattern found"
    else
      # Check for incorrect single-secret pattern
      if grep -q "DATABASE_URL: \\\${{ secrets.DATABASE_URL }}" "$workflow" || \
         grep -q "DATABASE_URL: \\\${{ secrets.STAGING_DATABASE_URL }}" "$workflow" || \
         grep -q "DATABASE_URL: \\\${{ secrets.PRODUCTION_DATABASE_URL }}" "$workflow"; then
        echo "   ❌ ERROR: Using single DATABASE_URL secret (anti-pattern)"
        echo "      Should construct from vars.DATABASE_USER, secrets.DB_PASSWORD, vars.DATABASE_HOST, vars.DATABASE_PORT, vars.DATABASE_NAME"
        ERRORS=$((ERRORS + 1))
      # Check for test-specific hardcoded patterns (acceptable for e2e-tests)
      elif grep -q "DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ectropy_test" "$workflow"; then
        echo "   ℹ️  Test-specific hardcoded DATABASE_URL (acceptable for e2e tests)"
      # Check for constructed patterns in scripts (acceptable)
      elif grep -q "DATABASE_URL=postgresql://" "$workflow" | grep -q "\${{ secrets.DB_PASSWORD }}"; then
        echo "   ⚠️  WARNING: Non-standard DATABASE_URL construction detected (in script)"
        echo "      Consider using env variable pattern instead"
        WARNINGS=$((WARNINGS + 1))
      else
        echo "   ⚠️  WARNING: Non-standard DATABASE_URL construction detected"
        grep "DATABASE_URL" "$workflow" | head -3 | sed 's/^/      /'
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  fi
done

echo ""
if [ $ERRORS -eq 0 ]; then
  echo "✅ All workflows follow correct DATABASE_URL construction pattern"
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  Found $WARNINGS workflow(s) with non-standard patterns (review recommended)"
  fi
  exit 0
else
  echo "❌ Found $ERRORS workflow(s) with incorrect DATABASE_URL pattern"
  echo "   See docs/AGENT_GUIDE.md for correct pattern"
  exit 1
fi
