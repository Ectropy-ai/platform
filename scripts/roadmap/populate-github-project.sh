#!/bin/bash
# One-time script to populate GitHub Project V2 from roadmap.json
# Usage: ./scripts/roadmap/populate-github-project.sh [--dry-run]
#
# This script performs a one-time bootstrap migration from roadmap.json to
# GitHub Projects V2. After this initial population, the sync runs in the
# opposite direction (GitHub Projects → roadmap.json).
#
# Prerequisites:
#   - GITHUB_PROJECT_TOKEN: GitHub PAT with repo, project, read:org scopes
#   - GITHUB_PROJECT_ID: GitHub Project V2 ID (format: PVT_kwHOxxxxxx)
#   - Valid roadmap.json with phases and deliverables
#
# Environment:
#   DRY_RUN: Set to "true" to preview changes without creating items

set -uo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROADMAP_FILE="$REPO_ROOT/apps/mcp-server/data/roadmap.json"
EVIDENCE_DIR="$REPO_ROOT/evidence/github-project-population-$(date +%Y-%m-%d-%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Counters
CREATED_COUNT=0
FAILED_COUNT=0
TOTAL_COUNT=0

# Dry run mode
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--dry-run]"
      echo ""
      echo "Populate GitHub Projects V2 from roadmap.json (one-time bootstrap)"
      echo ""
      echo "Options:"
      echo "  --dry-run   Preview changes without creating items"
      echo "  --help      Show this help message"
      echo ""
      echo "Environment Variables Required:"
      echo "  GITHUB_PROJECT_TOKEN or GITHUB_TOKEN"
      echo "  GITHUB_PROJECT_ID"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}GitHub Projects V2 Population Script${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}🏃 DRY RUN MODE - No items will be created${NC}"
  echo ""
fi

# 1. Environment validation
echo -e "${CYAN}📋 Step 1: Validating environment...${NC}"

# Use GITHUB_PROJECT_TOKEN or fallback to GITHUB_TOKEN
if [ -z "${GITHUB_PROJECT_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo -e "${RED}❌ Missing required environment variable: GITHUB_PROJECT_TOKEN or GITHUB_TOKEN${NC}"
  echo "   Set it with: export GITHUB_PROJECT_TOKEN=your_token_here"
  exit 1
fi

TOKEN="${GITHUB_PROJECT_TOKEN:-${GITHUB_TOKEN}}"

if [ -z "${GITHUB_PROJECT_ID:-}" ]; then
  echo -e "${RED}❌ Missing required environment variable: GITHUB_PROJECT_ID${NC}"
  echo "   Set it with: export GITHUB_PROJECT_ID=your_project_id_here"
  exit 1
fi

echo -e "${GREEN}✅ Environment variables validated${NC}"
echo "   Project ID: $GITHUB_PROJECT_ID"
echo "   Token: ${TOKEN:0:8}..."
echo ""

# 2. Check roadmap file exists
echo -e "${CYAN}📋 Step 2: Checking roadmap file...${NC}"

if [ ! -f "$ROADMAP_FILE" ]; then
  echo -e "${RED}❌ Roadmap file not found: $ROADMAP_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Roadmap file found${NC}"
echo "   Path: $ROADMAP_FILE"
echo ""

# 3. Validate roadmap schema
echo -e "${CYAN}📋 Step 3: Validating roadmap schema...${NC}"

cd "$REPO_ROOT/apps/mcp-server"

if ! node scripts/validate-roadmap-schema.js "$ROADMAP_FILE"; then
  echo ""
  echo -e "${RED}❌ Schema validation failed${NC}"
  echo "   Fix errors in roadmap.json and try again"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ Schema validation passed${NC}"
echo ""

# 4. Create evidence directory
if [ "$DRY_RUN" = false ]; then
  mkdir -p "$EVIDENCE_DIR"
  echo -e "${CYAN}📁 Evidence directory created: $EVIDENCE_DIR${NC}"
  echo ""
fi

# 5. Fetch GitHub Project field IDs
echo -e "${CYAN}📋 Step 4: Fetching GitHub Project field IDs...${NC}"

FIELD_QUERY='query($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field {
            id
            name
          }
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}'

# Escape query for JSON
FIELD_QUERY_JSON=$(echo "$FIELD_QUERY" | jq -Rs .)

# Make GraphQL request
FIELD_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $FIELD_QUERY_JSON, \"variables\": {\"projectId\": \"$GITHUB_PROJECT_ID\"}}")

# Check for GraphQL errors
if echo "$FIELD_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
  echo -e "${RED}❌ GraphQL error fetching fields:${NC}"
  echo "$FIELD_RESPONSE" | jq '.errors'
  exit 1
fi

# Extract field IDs
PHASE_FIELD_ID=$(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Phase") | .id')
STATUS_FIELD_ID=$(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Status") | .id')
PRIORITY_FIELD_ID=$(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Priority") | .id')
DELIVERABLE_ID_FIELD_ID=$(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Deliverable ID") | .id')
TARGET_DATE_FIELD_ID=$(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Target Date") | .id')
EVIDENCE_FIELD_ID=$(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Evidence") | .id')

# Validate required fields exist
if [ -z "$PHASE_FIELD_ID" ] || [ "$PHASE_FIELD_ID" = "null" ]; then
  echo -e "${RED}❌ Required custom field 'Phase' not found in GitHub Project${NC}"
  echo "   Create this field in your GitHub Project settings"
  exit 1
fi

if [ -z "$STATUS_FIELD_ID" ] || [ "$STATUS_FIELD_ID" = "null" ]; then
  echo -e "${RED}❌ Required custom field 'Status' not found in GitHub Project${NC}"
  echo "   Create this field in your GitHub Project settings"
  exit 1
fi

if [ -z "$DELIVERABLE_ID_FIELD_ID" ] || [ "$DELIVERABLE_ID_FIELD_ID" = "null" ]; then
  echo -e "${RED}❌ Required custom field 'Deliverable ID' not found in GitHub Project${NC}"
  echo "   Create this field in your GitHub Project settings"
  exit 1
fi

echo -e "${GREEN}✅ Field IDs retrieved:${NC}"
echo "   Phase: $PHASE_FIELD_ID"
echo "   Status: $STATUS_FIELD_ID"
echo "   Priority: ${PRIORITY_FIELD_ID:-not found (optional)}"
echo "   Deliverable ID: $DELIVERABLE_ID_FIELD_ID"
echo "   Target Date: ${TARGET_DATE_FIELD_ID:-not found (optional)}"
echo "   Evidence: ${EVIDENCE_FIELD_ID:-not found (optional)}"
echo ""

# Extract phase option IDs (for single-select fields)
declare -A PHASE_OPTION_IDS
while IFS= read -r phase; do
  PHASE_OPTION_ID=$(echo "$FIELD_RESPONSE" | jq -r ".data.node.fields.nodes[] | select(.name == \"Phase\") | .options[] | select(.name == \"$phase\") | .id")
  PHASE_OPTION_IDS["$phase"]=$PHASE_OPTION_ID
done < <(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Phase") | .options[]? | .name')

# Extract status option IDs
declare -A STATUS_OPTION_IDS
while IFS= read -r status; do
  STATUS_OPTION_ID=$(echo "$FIELD_RESPONSE" | jq -r ".data.node.fields.nodes[] | select(.name == \"Status\") | .options[] | select(.name == \"$status\") | .id")
  STATUS_OPTION_IDS["$status"]=$STATUS_OPTION_ID
done < <(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Status") | .options[]? | .name')

# Extract priority option IDs (if field exists)
declare -A PRIORITY_OPTION_IDS
if [ -n "$PRIORITY_FIELD_ID" ] && [ "$PRIORITY_FIELD_ID" != "null" ]; then
  while IFS= read -r priority; do
    PRIORITY_OPTION_ID=$(echo "$FIELD_RESPONSE" | jq -r ".data.node.fields.nodes[] | select(.name == \"Priority\") | .options[] | select(.name == \"$priority\") | .id")
    PRIORITY_OPTION_IDS["$priority"]=$PRIORITY_OPTION_ID
  done < <(echo "$FIELD_RESPONSE" | jq -r '.data.node.fields.nodes[] | select(.name == "Priority") | .options[]? | .name')
fi

# 6. Parse roadmap.json and extract deliverables
echo -e "${CYAN}📋 Step 5: Parsing roadmap.json...${NC}"

DELIVERABLES=$(jq -c '.phases[] as $phase | $phase.deliverables[] | . + {phaseId: $phase.id, phaseName: $phase.name}' "$ROADMAP_FILE")
TOTAL_COUNT=$(echo "$DELIVERABLES" | wc -l)

echo -e "${GREEN}✅ Found $TOTAL_COUNT deliverables across $(jq '.phases | length' "$ROADMAP_FILE") phases${NC}"
echo ""

# Exit early if no deliverables
if [ "$TOTAL_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No deliverables found in roadmap.json${NC}"
  echo "   Nothing to populate"
  exit 0
fi

# 7. Create Project items for each deliverable
echo -e "${CYAN}📋 Step 6: Creating GitHub Project items...${NC}"
echo ""

while IFS= read -r deliverable; do
  # Extract deliverable data
  DELIVERABLE_ID=$(echo "$deliverable" | jq -r '.id')
  NAME=$(echo "$deliverable" | jq -r '.name')
  DESCRIPTION=$(echo "$deliverable" | jq -r '.description // ""')
  STATUS=$(echo "$deliverable" | jq -r '.status')
  PHASE_ID=$(echo "$deliverable" | jq -r '.phaseId')
  PHASE_NAME=$(echo "$deliverable" | jq -r '.phaseName // ""')
  PRIORITY=$(echo "$deliverable" | jq -r '.priority // "medium"')
  TARGET_DATE=$(echo "$deliverable" | jq -r '.targetDate // empty')
  EVIDENCE=$(echo "$deliverable" | jq -r 'if .evidence then (.evidence | join(", ")) else empty end')
  
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}📦 $DELIVERABLE_ID: $NAME${NC}"
  echo "   Phase: $PHASE_ID ($PHASE_NAME)"
  echo "   Status: $STATUS"
  echo "   Priority: $PRIORITY"
  
  # Dry run check
  if [ "$DRY_RUN" = true ]; then
    echo -e "   ${YELLOW}[DRY RUN] Would create item${NC}"
    ((CREATED_COUNT++))
    continue
  fi
  
  # Prepare body with additional metadata
  BODY="$DESCRIPTION

---
**Deliverable ID:** $DELIVERABLE_ID
**Phase:** $PHASE_NAME
**Priority:** $PRIORITY"
  
  if [ -n "$TARGET_DATE" ] && [ "$TARGET_DATE" != "null" ]; then
    BODY="$BODY
**Target Date:** $TARGET_DATE"
  fi
  
  if [ -n "$EVIDENCE" ] && [ "$EVIDENCE" != "null" ]; then
    BODY="$BODY
**Evidence:** $EVIDENCE"
  fi
  
  # GraphQL mutation to create draft issue
  CREATE_MUTATION='mutation($projectId: ID!, $title: String!, $body: String!) {
    addProjectV2DraftIssue(input: {
      projectId: $projectId
      title: $title
      body: $body
    }) {
      projectItem {
        id
      }
    }
  }'
  
  # Escape for JSON
  CREATE_MUTATION_JSON=$(echo "$CREATE_MUTATION" | jq -Rs .)
  TITLE_JSON=$(echo "$NAME" | jq -Rs .)
  BODY_JSON=$(echo "$BODY" | jq -Rs .)
  
  # Create item
  ITEM_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": $CREATE_MUTATION_JSON,
      \"variables\": {
        \"projectId\": \"$GITHUB_PROJECT_ID\",
        \"title\": $TITLE_JSON,
        \"body\": $BODY_JSON
      }
    }")
  
  # Check for errors
  if echo "$ITEM_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo -e "   ${RED}❌ Failed to create item${NC}"
    echo "$ITEM_RESPONSE" | jq '.errors' | tee -a "$EVIDENCE_DIR/failed-items.log"
    ((FAILED_COUNT++))
    continue
  fi
  
  # Extract item ID
  ITEM_ID=$(echo "$ITEM_RESPONSE" | jq -r '.data.addProjectV2DraftIssue.projectItem.id')
  
  if [ -z "$ITEM_ID" ] || [ "$ITEM_ID" = "null" ]; then
    echo -e "   ${RED}❌ Failed to extract item ID${NC}"
    echo "$ITEM_RESPONSE" >> "$EVIDENCE_DIR/failed-items.log"
    ((FAILED_COUNT++))
    continue
  fi
  
  echo -e "   ${GREEN}✅ Created item: $ITEM_ID${NC}"
  echo "$ITEM_RESPONSE" >> "$EVIDENCE_DIR/created-items.log"
  
  # Update custom fields
  # Define reusable mutation for single-select and text field updates
  UPDATE_FIELD_MUTATION='mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: $value
    }) {
      projectV2Item {
        id
      }
    }
  }'
  
  UPDATE_FIELD_JSON=$(echo "$UPDATE_FIELD_MUTATION" | jq -Rs .)
  
  # 1. Update Phase field
  PHASE_OPTION_ID="${PHASE_OPTION_IDS[$PHASE_ID]:-}"
  if [ -n "$PHASE_OPTION_ID" ] && [ "$PHASE_OPTION_ID" != "null" ]; then
    PHASE_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"query\": $UPDATE_FIELD_JSON,
        \"variables\": {
          \"projectId\": \"$GITHUB_PROJECT_ID\",
          \"itemId\": \"$ITEM_ID\",
          \"fieldId\": \"$PHASE_FIELD_ID\",
          \"value\": {\"singleSelectOptionId\": \"$PHASE_OPTION_ID\"}
        }
      }")
    
    if echo "$PHASE_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
      echo "   ⚠️  Failed to update Phase field"
    else
      echo "   ✅ Updated Phase field"
    fi
  else
    echo "   ⚠️  Phase option '$PHASE_ID' not found, skipping"
  fi
  
  # 2. Update Status field
  STATUS_OPTION_ID="${STATUS_OPTION_IDS[$STATUS]:-}"
  if [ -n "$STATUS_OPTION_ID" ] && [ "$STATUS_OPTION_ID" != "null" ]; then
    STATUS_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"query\": $UPDATE_FIELD_JSON,
        \"variables\": {
          \"projectId\": \"$GITHUB_PROJECT_ID\",
          \"itemId\": \"$ITEM_ID\",
          \"fieldId\": \"$STATUS_FIELD_ID\",
          \"value\": {\"singleSelectOptionId\": \"$STATUS_OPTION_ID\"}
        }
      }")
    
    if echo "$STATUS_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
      echo "   ⚠️  Failed to update Status field"
    else
      echo "   ✅ Updated Status field"
    fi
  fi
  
  # 3. Update Priority field (if exists)
  if [ -n "$PRIORITY_FIELD_ID" ] && [ "$PRIORITY_FIELD_ID" != "null" ]; then
    PRIORITY_OPTION_ID="${PRIORITY_OPTION_IDS[$PRIORITY]:-}"
    if [ -n "$PRIORITY_OPTION_ID" ] && [ "$PRIORITY_OPTION_ID" != "null" ]; then
      PRIORITY_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
          \"query\": $UPDATE_FIELD_JSON,
          \"variables\": {
            \"projectId\": \"$GITHUB_PROJECT_ID\",
            \"itemId\": \"$ITEM_ID\",
            \"fieldId\": \"$PRIORITY_FIELD_ID\",
            \"value\": {\"singleSelectOptionId\": \"$PRIORITY_OPTION_ID\"}
          }
        }")
      
      if echo "$PRIORITY_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
        echo "   ⚠️  Failed to update Priority field"
      else
        echo "   ✅ Updated Priority field"
      fi
    fi
  fi
  
  # 4. Update Deliverable ID field (text)
  DELIVERABLE_ID_JSON=$(echo "$DELIVERABLE_ID" | jq -Rs .)
  
  DELIV_ID_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"query\": $UPDATE_FIELD_JSON,
      \"variables\": {
        \"projectId\": \"$GITHUB_PROJECT_ID\",
        \"itemId\": \"$ITEM_ID\",
        \"fieldId\": \"$DELIVERABLE_ID_FIELD_ID\",
        \"value\": {\"text\": $DELIVERABLE_ID_JSON}
      }
    }")
  
  if echo "$DELIV_ID_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "   ⚠️  Failed to update Deliverable ID field"
  else
    echo "   ✅ Updated Deliverable ID field"
  fi
  
  # 5. Update Target Date field (if exists and has value)
  if [ -n "$TARGET_DATE_FIELD_ID" ] && [ "$TARGET_DATE_FIELD_ID" != "null" ] && [ -n "$TARGET_DATE" ]; then
    TARGET_DATE_JSON=$(echo "$TARGET_DATE" | jq -Rs .)
    
    TARGET_DATE_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"query\": $UPDATE_FIELD_JSON,
        \"variables\": {
          \"projectId\": \"$GITHUB_PROJECT_ID\",
          \"itemId\": \"$ITEM_ID\",
          \"fieldId\": \"$TARGET_DATE_FIELD_ID\",
          \"value\": {\"date\": $TARGET_DATE_JSON}
        }
      }")
    
    if echo "$TARGET_DATE_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
      echo "   ⚠️  Failed to update Target Date field"
    else
      echo "   ✅ Updated Target Date field"
    fi
  fi
  
  # 6. Update Evidence field (if exists and has value)
  if [ -n "$EVIDENCE_FIELD_ID" ] && [ "$EVIDENCE_FIELD_ID" != "null" ] && [ -n "$EVIDENCE" ]; then
    EVIDENCE_JSON=$(echo "$EVIDENCE" | jq -Rs .)
    
    EVIDENCE_RESPONSE=$(curl -s -X POST https://api.github.com/graphql \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"query\": $UPDATE_FIELD_JSON,
        \"variables\": {
          \"projectId\": \"$GITHUB_PROJECT_ID\",
          \"itemId\": \"$ITEM_ID\",
          \"fieldId\": \"$EVIDENCE_FIELD_ID\",
          \"value\": {\"text\": $EVIDENCE_JSON}
        }
      }")
    
    if echo "$EVIDENCE_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
      echo "   ⚠️  Failed to update Evidence field"
    else
      echo "   ✅ Updated Evidence field"
    fi
  fi
  
  ((CREATED_COUNT++))
  
  # Rate limiting - GitHub API allows 5000 requests/hour
  # With ~7 requests per item, we can safely process 700 items/hour
  # Sleep 0.5s between items to be conservative
  sleep 0.5
  
done <<< "$DELIVERABLES"

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 8. Generate summary
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}📊 Migration Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""
echo "Total deliverables: $TOTAL_COUNT"
echo "Successfully created: $CREATED_COUNT"
echo "Failed: $FAILED_COUNT"

if [ "$DRY_RUN" = false ]; then
  echo "Evidence directory: $EVIDENCE_DIR"
  
  # Create summary file
  cat > "$EVIDENCE_DIR/migration-summary.txt" << EOF
GitHub Projects V2 Population Summary
======================================

Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Project ID: $GITHUB_PROJECT_ID
Roadmap File: $ROADMAP_FILE

Results:
--------
Total deliverables: $TOTAL_COUNT
Successfully created: $CREATED_COUNT
Failed: $FAILED_COUNT
Success rate: $(( CREATED_COUNT * 100 / TOTAL_COUNT ))%

Evidence Files:
--------------
- created-items.log: Full GraphQL responses for created items
- failed-items.log: Error details for failed items (if any)
- migration-summary.txt: This summary file

Next Steps:
-----------
1. Verify items in GitHub Project UI
2. Run sync test: ./scripts/roadmap/sync-from-github.sh --dry-run
3. Expected: No changes detected (data already synchronized)
EOF
fi

echo ""

if [ $FAILED_COUNT -eq 0 ]; then
  echo -e "${GREEN}✅ Migration completed successfully!${NC}"
  
  if [ "$DRY_RUN" = false ]; then
    echo ""
    echo -e "${CYAN}📝 Next Steps:${NC}"
    echo "   1. Verify items in GitHub Project UI"
    echo "   2. Run sync test: ./scripts/roadmap/sync-from-github.sh --dry-run"
    echo "   3. Expected: No changes detected (data already synchronized)"
  fi
  
  exit 0
else
  echo -e "${YELLOW}⚠️  Migration completed with errors${NC}"
  
  if [ "$DRY_RUN" = false ]; then
    echo "   Check $EVIDENCE_DIR/failed-items.log for details"
  fi
  
  exit 1
fi
