#!/bin/bash
# Sync roadmap from GitHub Projects to local JSON
# Usage: ./scripts/roadmap/sync-from-github.sh [--force] [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROADMAP_FILE="$REPO_ROOT/apps/mcp-server/data/roadmap.json"

FORCE=false
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      FORCE=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--force] [--dry-run]"
      echo ""
      echo "Options:"
      echo "  --force     Force sync even if no changes detected"
      echo "  --dry-run   Show what would change without modifying files"
      echo "  --help      Show this help message"
      echo ""
      echo "Environment Variables Required:"
      echo "  GITHUB_PROJECT_TOKEN or GITHUB_TOKEN"
      echo "  GITHUB_PROJECT_ID"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🔄 Syncing roadmap from GitHub Projects...${NC}"
echo ""

# Check environment variables
if [ -z "$GITHUB_PROJECT_TOKEN" ] && [ -z "$GITHUB_TOKEN" ]; then
  echo -e "${RED}❌ Error: GITHUB_PROJECT_TOKEN or GITHUB_TOKEN environment variable is required${NC}"
  echo "   Set it with: export GITHUB_PROJECT_TOKEN=your_token_here"
  exit 1
fi

if [ -z "$GITHUB_PROJECT_ID" ]; then
  echo -e "${RED}❌ Error: GITHUB_PROJECT_ID environment variable is required${NC}"
  echo "   Set it with: export GITHUB_PROJECT_ID=your_project_id_here"
  exit 1
fi

# Check if roadmap file exists
if [ ! -f "$ROADMAP_FILE" ]; then
  echo -e "${YELLOW}⚠️  Warning: Roadmap file not found at $ROADMAP_FILE${NC}"
  echo "   A new file will be created."
fi

# Backup current roadmap
if [ -f "$ROADMAP_FILE" ]; then
  echo -e "${BLUE}📦 Creating backup...${NC}"
  cp "$ROADMAP_FILE" "$ROADMAP_FILE.backup"
  echo "   Backup saved to: $ROADMAP_FILE.backup"
fi

# Navigate to MCP server directory
cd "$REPO_ROOT/apps/mcp-server"

# Run sync
echo ""
echo -e "${BLUE}🚀 Running sync...${NC}"
if ! node scripts/sync-roadmap-from-github.js; then
  echo ""
  echo -e "${RED}❌ Sync failed!${NC}"
  
  # Restore backup if sync failed
  if [ -f "$ROADMAP_FILE.backup" ]; then
    echo -e "${YELLOW}♻️  Restoring backup...${NC}"
    mv "$ROADMAP_FILE.backup" "$ROADMAP_FILE"
    echo "   Backup restored"
  fi
  
  exit 1
fi

# Validate schema
echo ""
echo -e "${BLUE}🔍 Validating schema...${NC}"
if ! node scripts/validate-roadmap-schema.js; then
  echo ""
  echo -e "${RED}❌ Schema validation failed!${NC}"
  echo -e "${YELLOW}♻️  Restoring backup...${NC}"
  
  if [ -f "$ROADMAP_FILE.backup" ]; then
    mv "$ROADMAP_FILE.backup" "$ROADMAP_FILE"
    echo "   Backup restored"
  fi
  
  exit 1
fi

# Show diff
echo ""
echo -e "${BLUE}📊 Changes detected:${NC}"
if [ -f "$ROADMAP_FILE.backup" ]; then
  if git diff --no-index "$ROADMAP_FILE.backup" "$ROADMAP_FILE" > /dev/null 2>&1; then
    echo -e "${GREEN}   No changes detected${NC}"
    HAS_CHANGES=false
  else
    git diff --no-index "$ROADMAP_FILE.backup" "$ROADMAP_FILE" || true
    HAS_CHANGES=true
  fi
else
  echo -e "${YELLOW}   New file created${NC}"
  HAS_CHANGES=true
fi

# Handle dry-run mode
if [ "$DRY_RUN" = true ]; then
  echo ""
  echo -e "${YELLOW}🏃 Dry run complete. Restoring original.${NC}"
  
  if [ -f "$ROADMAP_FILE.backup" ]; then
    mv "$ROADMAP_FILE.backup" "$ROADMAP_FILE"
  fi
  
  exit 0
fi

# Cleanup backup
if [ -f "$ROADMAP_FILE.backup" ]; then
  rm "$ROADMAP_FILE.backup"
fi

echo ""
echo -e "${GREEN}✅ Roadmap sync complete!${NC}"

if [ "$HAS_CHANGES" = true ] || [ "$FORCE" = true ]; then
  echo ""
  echo -e "${BLUE}📝 Next steps:${NC}"
  echo "   1. Review the changes above"
  echo "   2. Test the updated roadmap: cd apps/mcp-server && npm test"
  echo "   3. Commit the changes: git add apps/mcp-server/data/roadmap.json"
  echo "   4. Push to repository: git commit -m 'chore: sync roadmap from GitHub Projects' && git push"
  
  if [ "$FORCE" = true ] && [ "$HAS_CHANGES" = false ]; then
    echo ""
    echo -e "${YELLOW}   Note: --force flag set, but no changes detected${NC}"
  fi
else
  echo "   No changes to commit."
fi

echo ""
