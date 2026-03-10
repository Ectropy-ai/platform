#!/bin/bash
# Update GitHub Project items with Technical Planning URLs

PROJECT_NUMBER=3
OWNER="luhtech"

# Define mapping of deliverable IDs to planning URLs
declare -A PLANNING_URLS
PLANNING_URLS["p5a-d4"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d4-navigation-controls.md"
PLANNING_URLS["p5a-d5"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d5-oauth-integration.md"
PLANNING_URLS["p5a-d6"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d6-performance-monitoring.md"
PLANNING_URLS["p5a-d7"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d7-e2e-integration-tests.md"
PLANNING_URLS["p5a-d8"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d8-demo-script.md"
PLANNING_URLS["p5a-d9"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d9-landing-page.md"
PLANNING_URLS["p5a-d10"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d10-crm-schema.md"
PLANNING_URLS["p5a-d11"]="https://github.com/luhtech/Ectropy/blob/main/evidence/phase-5a-deliverable-planning/p5a-d11-n8n-workflow.md"

echo "📋 Updating Phase 5a items with Technical Planning URLs..."
echo ""

# Get all Phase 5a items
gh project item-list $PROJECT_NUMBER --owner $OWNER --format json --limit 100 | \
  jq -r '.items[] | select(.phase == "phase-5a") | "\(.id)|\(.["deliverable ID"])"' | \
  while IFS='|' read -r ITEM_ID DELIV_ID; do
    # Trim whitespace and newlines
    DELIV_ID=$(echo "$DELIV_ID" | tr -d '[:space:]')

    # Check if this deliverable has a planning URL
    if [[ -n "${PLANNING_URLS[$DELIV_ID]}" ]]; then
      URL="${PLANNING_URLS[$DELIV_ID]}"

      echo "[$DELIV_ID] Updating item $ITEM_ID"
      echo "  URL: $URL"

      # Update the item
      if gh project item-edit --id "$ITEM_ID" --project-id "PVT_kwHOBUNY6s4BHKeg" --field-id "PVTF_lAHOBUNY6s4BHKegzg4I9dQ" --text "$URL" 2>/dev/null; then
        echo "  ✅ Updated successfully"
      else
        echo "  ❌ Update failed"
      fi
      echo ""
    fi
  done

echo "✅ Done!"
