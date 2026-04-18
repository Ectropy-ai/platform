#!/bin/bash
################################################################################
# ENTERPRISE NOTIFICATION SCRIPT
# Sends deployment notifications to stakeholders
#
# Usage: ./send-notification.sh <success|failed|rollback> [message]
# Example: ./send-notification.sh success "Deployment to blue server completed"
#          ./send-notification.sh failed "Deployment failed during health checks"
#
# Notification channels:
#   - GitHub Issue comment (if in PR)
#   - Slack (if webhook configured)
#   - Email (if SMTP configured)
################################################################################

set -euo pipefail

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
if [ $# -lt 1 ]; then
    log_error "Usage: $0 <success|failed|rollback> [message]"
    exit 1
fi

STATUS=$1
MESSAGE="${2:-}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S UTC')

# Determine emoji and title based on status
case $STATUS in
    success)
        EMOJI="✅"
        TITLE="Deployment Successful"
        COLOR="good"
        ;;
    failed)
        EMOJI="❌"
        TITLE="Deployment Failed"
        COLOR="danger"
        ;;
    rollback)
        EMOJI="🔄"
        TITLE="Deployment Rolled Back"
        COLOR="warning"
        ;;
    *)
        log_error "Invalid status: $STATUS. Must be 'success', 'failed', or 'rollback'"
        exit 1
        ;;
esac

# Build notification message
NOTIFICATION_MESSAGE="${EMOJI} **${TITLE}**

**Time:** ${TIMESTAMP}
**Status:** ${STATUS}

${MESSAGE}

**Environment:** Production
**Strategy:** Blue/Green Deployment"

log_info "=================================================="
log_info "Sending deployment notification"
log_info "Status: $STATUS"
log_info "=================================================="

################################################################################
# GitHub Issue/PR Comment (if in GitHub Actions)
################################################################################

if [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -f "$GITHUB_EVENT_PATH" ]; then
    log_info "Detected GitHub Actions environment"

    # Check if this is a pull request
    PR_NUMBER=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH" || echo "")

    if [ -n "$PR_NUMBER" ]; then
        log_info "Posting comment to PR #$PR_NUMBER"

        gh pr comment "$PR_NUMBER" --body "$NOTIFICATION_MESSAGE" || {
            log_warn "Failed to post PR comment"
        }

        log_info "✅ Posted comment to PR #$PR_NUMBER"
    else
        log_info "Not a pull request, skipping PR comment"
    fi
else
    log_info "Not in GitHub Actions environment, skipping PR comment"
fi

################################################################################
# Slack Notification (if webhook configured)
################################################################################

if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    log_info "Sending Slack notification..."

    # Build Slack message payload
    SLACK_PAYLOAD=$(cat << EOF
{
  "attachments": [
    {
      "color": "$COLOR",
      "title": "$TITLE",
      "text": "$MESSAGE",
      "fields": [
        {
          "title": "Environment",
          "value": "Production",
          "short": true
        },
        {
          "title": "Strategy",
          "value": "Blue/Green",
          "short": true
        },
        {
          "title": "Time",
          "value": "$TIMESTAMP",
          "short": false
        }
      ],
      "footer": "Ectropy Platform",
      "footer_icon": "https://platform.slack-edge.com/img/default_application_icon.png",
      "ts": $(date +%s)
    }
  ]
}
EOF
)

    # Send to Slack
    if curl -X POST -H 'Content-type: application/json' --data "$SLACK_PAYLOAD" "$SLACK_WEBHOOK_URL"; then
        log_info "✅ Slack notification sent"
    else
        log_warn "Failed to send Slack notification"
    fi
else
    log_info "SLACK_WEBHOOK_URL not configured, skipping Slack notification"
fi

################################################################################
# Email Notification (if SMTP configured)
################################################################################

if [ -n "${SMTP_SERVER:-}" ] && [ -n "${SMTP_FROM:-}" ] && [ -n "${SMTP_TO:-}" ]; then
    log_info "Sending email notification..."

    # Build email body
    EMAIL_BODY="Subject: $TITLE - Ectropy Platform

$NOTIFICATION_MESSAGE

---
This is an automated notification from the Ectropy deployment system.
"

    # Send email using sendmail or mailx
    if command -v sendmail &> /dev/null; then
        echo "$EMAIL_BODY" | sendmail -t "$SMTP_TO" || {
            log_warn "Failed to send email notification"
        }
        log_info "✅ Email notification sent"
    elif command -v mailx &> /dev/null; then
        echo "$EMAIL_BODY" | mailx -s "$TITLE - Ectropy Platform" "$SMTP_TO" || {
            log_warn "Failed to send email notification"
        }
        log_info "✅ Email notification sent"
    else
        log_warn "No email command available (sendmail or mailx)"
    fi
else
    log_info "SMTP not configured, skipping email notification"
fi

################################################################################
# Console Output (always)
################################################################################

echo ""
log_info "=================================================="
log_info "$TITLE"
log_info "=================================================="
echo "$MESSAGE"
echo ""
log_info "Time: $TIMESTAMP"
log_info "Status: $STATUS"
log_info "=================================================="

exit 0
