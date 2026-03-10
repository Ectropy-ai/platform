#!/bin/bash
# create-pr.sh - Generate PR information for GitHub
# Usage: ./scripts/create-pr.sh [base-branch]

set -e

BASE_BRANCH="${1:-main}"
CURRENT_BRANCH=$(git branch --show-current)
REPO_URL=$(git remote get-url origin | sed 's/\.git$//' | sed 's|http://[^/]*/git/|https://github.com/|')

echo "=============================================="
echo "  PR Creation Helper"
echo "=============================================="
echo ""
echo "Branch: $CURRENT_BRANCH → $BASE_BRANCH"
echo ""
echo "PR URL:"
echo "  ${REPO_URL}/compare/${BASE_BRANCH}...${CURRENT_BRANCH}?expand=1"
echo ""
echo "=============================================="
echo "  Commits to include:"
echo "=============================================="
git log --oneline ${BASE_BRANCH}..HEAD 2>/dev/null || git log --oneline -10
echo ""
echo "=============================================="
echo "  Files changed:"
echo "=============================================="
git diff --stat ${BASE_BRANCH}...HEAD 2>/dev/null | tail -20 || git diff --stat HEAD~10 | tail -20
echo ""
echo "=============================================="
echo "  Quick Stats:"
echo "=============================================="
COMMITS=$(git rev-list --count ${BASE_BRANCH}..HEAD 2>/dev/null || echo "N/A")
FILES=$(git diff --name-only ${BASE_BRANCH}...HEAD 2>/dev/null | wc -l || echo "N/A")
INSERTIONS=$(git diff --shortstat ${BASE_BRANCH}...HEAD 2>/dev/null | grep -oP '\d+(?= insertion)' || echo "N/A")
DELETIONS=$(git diff --shortstat ${BASE_BRANCH}...HEAD 2>/dev/null | grep -oP '\d+(?= deletion)' || echo "N/A")

echo "  Commits: $COMMITS"
echo "  Files: $FILES"
echo "  Insertions: $INSERTIONS"
echo "  Deletions: $DELETIONS"
echo ""
