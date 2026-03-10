#!/bin/bash
# Ectropy - Sync, Rebase, Commit, and Push Script
# Usage: ./sync-and-push.sh "commit message"

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Ectropy Git Sync & Push ===${NC}\n"

# Check if commit message provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Commit message required${NC}"
    echo "Usage: ./sync-and-push.sh \"your commit message\""
    exit 1
fi

COMMIT_MESSAGE="$1"

# Step 1: Check current status
echo -e "${YELLOW}Step 1: Checking current status...${NC}"
git status
echo ""

# Step 2: Stash any uncommitted changes
echo -e "${YELLOW}Step 2: Stashing uncommitted changes...${NC}"
if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to stash"
else
    git stash push -m "Auto-stash before sync $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${GREEN}✓ Changes stashed${NC}"
fi
echo ""

# Step 3: Fetch latest from origin
echo -e "${YELLOW}Step 3: Fetching latest from origin...${NC}"
git fetch origin
echo -e "${GREEN}✓ Fetch complete${NC}"
echo ""

# Step 4: Rebase on origin/main
echo -e "${YELLOW}Step 4: Rebasing on origin/main...${NC}"
if git rebase origin/main; then
    echo -e "${GREEN}✓ Rebase successful${NC}"
else
    echo -e "${RED}✗ Rebase failed - resolve conflicts manually${NC}"
    echo "After resolving conflicts:"
    echo "  git add <resolved-files>"
    echo "  git rebase --continue"
    echo "Then run this script again"
    exit 1
fi
echo ""

# Step 5: Apply stashed changes if any
echo -e "${YELLOW}Step 5: Applying stashed changes...${NC}"
if git stash list | grep -q "Auto-stash before sync"; then
    if git stash pop; then
        echo -e "${GREEN}✓ Stashed changes applied${NC}"
    else
        echo -e "${RED}✗ Stash apply failed - resolve conflicts manually${NC}"
        echo "After resolving conflicts:"
        echo "  git add <resolved-files>"
        echo "  git stash drop"
        exit 1
    fi
else
    echo "No stashed changes to apply"
fi
echo ""

# Step 6: Add all changes
echo -e "${YELLOW}Step 6: Staging all changes...${NC}"
git add -A
echo -e "${GREEN}✓ All changes staged${NC}"
echo ""

# Step 7: Show what will be committed
echo -e "${YELLOW}Step 7: Changes to be committed:${NC}"
git status --short
echo ""

# Step 8: Commit with message
echo -e "${YELLOW}Step 8: Creating commit...${NC}"
git commit -m "$COMMIT_MESSAGE"
echo -e "${GREEN}✓ Commit created${NC}"
echo ""

# Step 9: Push to origin
echo -e "${YELLOW}Step 9: Pushing to origin/main...${NC}"
if git push origin main; then
    echo -e "${GREEN}✓ Push successful${NC}"
else
    echo -e "${RED}✗ Push failed${NC}"
    echo "This might be because:"
    echo "  - Remote has new commits (run script again to sync)"
    echo "  - Network issue (check connection)"
    echo "  - Permission issue (check credentials)"
    exit 1
fi
echo ""

# Step 10: Show final status
echo -e "${YELLOW}Step 10: Final status:${NC}"
git status
echo ""

echo -e "${GREEN}=== ✓ Sync and Push Complete ===${NC}"
echo -e "Latest commit: ${BLUE}$(git log -1 --oneline)${NC}"
