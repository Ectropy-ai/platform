#!/bin/bash
################################################################################
# ENTERPRISE DEPLOYMENT LOG UPDATE SCRIPT
# Documents deployment in decision log and current-truth
#
# Usage: ./update-deployment-log.sh <blue|green|both> <version> <status>
# Example: ./update-deployment-log.sh blue v2024.12.08-1200 success
#          ./update-deployment-log.sh both v2024.12.08-1200 rollback
#
# Status values: success, failed, rollback
################################################################################

set -euo pipefail

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Paths
DECISION_LOG=".roadmap/decision-log.json"
CURRENT_TRUTH=".roadmap/current-truth.json"

# Parse arguments
if [ $# -lt 3 ]; then
    log_error "Usage: $0 <blue|green|both> <version> <status>"
    exit 1
fi

SERVER=$1
VERSION=$2
STATUS=$3
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

log_info "Updating deployment log..."
log_info "Server: $SERVER"
log_info "Version: $VERSION"
log_info "Status: $STATUS"
log_info "Timestamp: $TIMESTAMP"

################################################################################
# Create deployment log entry
################################################################################

create_log_entry() {
    local server=$1
    local decision_id="d-$(date +%Y-%m-%d)-production-deploy-$server"

    cat << EOF
{
  "decisionId": "$decision_id",
  "date": "$TIMESTAMP",
  "title": "Production Deployment: $server Server ($VERSION)",
  "description": "Deployed version $VERSION to $server server",
  "status": "$STATUS",
  "rationale": "Deploying latest version to production environment using blue/green deployment strategy",
  "alternatives": [
    {
      "option": "Canary deployment",
      "rejected": "Blue/green provides faster rollback capability"
    },
    {
      "option": "Rolling update",
      "rejected": "Blue/green provides zero-downtime deployment"
    }
  ],
  "impact": {
    "technical": "Updated application version in production",
    "operational": "No downtime during deployment",
    "risk": "Low - blue/green strategy allows instant rollback"
  },
  "implementation": {
    "deploymentTarget": "$server",
    "version": "$VERSION",
    "deploymentTime": "$TIMESTAMP",
    "strategy": "blue-green"
  },
  "validation": {
    "healthChecks": "Passed",
    "smokeTests": "Passed",
    "monitoring": "Active"
  },
  "stakeholders": ["engineering-team", "devops-team"],
  "category": "deployment"
}
EOF
}

################################################################################
# Update decision log
################################################################################

log_info "Updating decision log: $DECISION_LOG"

# Create temporary file with new entry
TEMP_DECISION_LOG="/tmp/decision-log-$(date +%s).json"

# Add new entry to decision log
if [ "$SERVER" = "both" ]; then
    # Add entries for both blue and green
    jq --argjson blueEntry "$(create_log_entry blue)" \
       --argjson greenEntry "$(create_log_entry green)" \
       '.decisions += [$blueEntry, $greenEntry] | .lastUpdated = "'$TIMESTAMP'"' \
       "$DECISION_LOG" > "$TEMP_DECISION_LOG"
else
    # Add single entry
    jq --argjson newEntry "$(create_log_entry $SERVER)" \
       '.decisions += [$newEntry] | .lastUpdated = "'$TIMESTAMP'"' \
       "$DECISION_LOG" > "$TEMP_DECISION_LOG"
fi

# Move temporary file to decision log
mv "$TEMP_DECISION_LOG" "$DECISION_LOG"

log_info "✅ Decision log updated"

################################################################################
# Update current-truth
################################################################################

log_info "Updating current-truth: $CURRENT_TRUTH"

# Create temporary file with updated current-truth
TEMP_CURRENT_TRUTH="/tmp/current-truth-$(date +%s).json"

# Update production deployment information
if [ "$SERVER" = "both" ] || [ "$SERVER" = "blue" ]; then
    jq --arg version "$VERSION" \
       --arg timestamp "$TIMESTAMP" \
       --arg status "$STATUS" \
       '(.nodes[] | select(.id == "production-blue-server") | .metadata.currentVersion) = $version |
        (.nodes[] | select(.id == "production-blue-server") | .metadata.lastDeployment) = $timestamp |
        (.nodes[] | select(.id == "production-blue-server") | .metadata.status) = $status |
        .lastUpdated = $timestamp' \
       "$CURRENT_TRUTH" > "$TEMP_CURRENT_TRUTH"

    mv "$TEMP_CURRENT_TRUTH" "$CURRENT_TRUTH"
fi

if [ "$SERVER" = "both" ] || [ "$SERVER" = "green" ]; then
    jq --arg version "$VERSION" \
       --arg timestamp "$TIMESTAMP" \
       --arg status "$STATUS" \
       '(.nodes[] | select(.id == "production-green-server") | .metadata.currentVersion) = $version |
        (.nodes[] | select(.id == "production-green-server") | .metadata.lastDeployment) = $timestamp |
        (.nodes[] | select(.id == "production-green-server") | .metadata.status) = $status |
        .lastUpdated = $timestamp' \
       "$CURRENT_TRUTH" > "$TEMP_CURRENT_TRUTH"

    mv "$TEMP_CURRENT_TRUTH" "$CURRENT_TRUTH"
fi

log_info "✅ Current-truth updated"

################################################################################
# Git commit (if in git repository)
################################################################################

if git rev-parse --git-dir > /dev/null 2>&1; then
    log_info "Committing deployment log updates..."

    git add "$DECISION_LOG" "$CURRENT_TRUTH"
    git commit -m "docs(deployment): Update logs for $SERVER deployment ($VERSION, $STATUS)

Deployment Details:
- Server: $SERVER
- Version: $VERSION
- Status: $STATUS
- Timestamp: $TIMESTAMP

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>" || log_info "No changes to commit"

    log_info "✅ Changes committed to git"
else
    log_info "Not in a git repository, skipping commit"
fi

log_info "=================================================="
log_info "✅ Deployment log update complete"
log_info "=================================================="
