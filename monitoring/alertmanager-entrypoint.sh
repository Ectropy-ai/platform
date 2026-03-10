#!/bin/sh
# =============================================================================
# ALERTMANAGER ENTRYPOINT - ROOT CAUSE #92
# =============================================================================
#
# PURPOSE: Process Alertmanager config with environment variable substitution
# PATTERN: Enterprise Docker entrypoint standard (envsubst/sed fallback pattern)
#
# INDUSTRY CONTEXT:
# - Alertmanager lacks native env var support (GitHub issues #2818, #504)
# - Enterprise pattern: wrapper script with envsubst (Google SRE, Netflix standard)
# - K8s uses Secrets, Docker uses entrypoint injection
#
# FLOW:
# 1. Read alertmanager.yml template with ${SLACK_WEBHOOK_URL} placeholder
# 2. Substitute ${SLACK_WEBHOOK_URL} with actual environment variable value
# 3. Write processed config to /tmp/alertmanager.yml
# 4. Start Alertmanager with processed config
#
# SECURITY: SLACK_WEBHOOK_URL passed as environment variable (not in config file)
# REFERENCE: https://github.com/prometheus/alertmanager/issues/2818
# =============================================================================

set -e

# Validate SLACK_WEBHOOK_URL is set
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "ERROR: SLACK_WEBHOOK_URL environment variable not set"
  echo "Alertmanager requires SLACK_WEBHOOK_URL for Slack notifications"
  exit 1
fi

# Substitute environment variables in config template
# Use sed for maximum compatibility (envsubst may not be available in all Alpine images)
sed "s|\${SLACK_WEBHOOK_URL}|${SLACK_WEBHOOK_URL}|g" \
  /etc/alertmanager/alertmanager.yml > /tmp/alertmanager.yml

# Verify processed config is valid
if [ ! -s /tmp/alertmanager.yml ]; then
  echo "ERROR: Failed to process Alertmanager configuration"
  exit 1
fi

echo "Alertmanager configuration processed successfully"
echo "Starting Alertmanager with Slack integration enabled..."

# Start Alertmanager with processed config
exec /bin/alertmanager \
  --config.file=/tmp/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://localhost:9093 \
  --log.level=info
