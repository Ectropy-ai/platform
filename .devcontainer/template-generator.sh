#!/bin/bash
# .devcontainer/template-generator.sh

set -e

TEMPLATE_DIR=".devcontainer/templates"
ENVIRONMENT=${1:-development}
AGENT_TYPE=${2:-general}

echo "Generating environment template for: $ENVIRONMENT ($AGENT_TYPE)"

# Create template directory
mkdir -p "$TEMPLATE_DIR"

# Generate environment-specific configuration
case "$ENVIRONMENT" in
  "development")
    generate_dev_template
    ;;
  "staging")
    generate_staging_template
    ;;
  "production")
    generate_production_template
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac

# Template generators

generate_dev_template() {
cat > "$TEMPLATE_DIR/dev-$AGENT_TYPE.json" << EOF
{
  "name": "Ectropy Development - $AGENT_TYPE",
  "dockerComposeFile": "../docker-compose.dev.yml",
  "service": "ectropy-dev",
  "workspaceFolder": "/workspace",
  "postCreateCommand": "bash .devcontainer/setup-dev-environment.sh $AGENT_TYPE",
  "remoteEnv": {
    "NODE_ENV": "development",
    "ECTROPY_AGENT_TYPE": "$AGENT_TYPE",
    "PNPM_HOME": "/usr/local/share/pnpm"
  }
}
EOF
}

generate_staging_template() {
cat > "$TEMPLATE_DIR/staging-$AGENT_TYPE.json" << EOF
{
  "name": "Ectropy Staging - $AGENT_TYPE",
  "image": "ectropy:staging",
  "workspaceFolder": "/workspace",
  "postCreateCommand": "bash .devcontainer/setup-staging-environment.sh $AGENT_TYPE",
  "remoteEnv": {
    "NODE_ENV": "staging",
    "ECTROPY_AGENT_TYPE": "$AGENT_TYPE"
  }
}
EOF
}

generate_production_template() {
cat > "$TEMPLATE_DIR/production-$AGENT_TYPE.json" << EOF
{
  "name": "Ectropy Production - $AGENT_TYPE",
  "image": "ectropy:production",
  "workspaceFolder": "/workspace",
  "postCreateCommand": "bash .devcontainer/setup-production-environment.sh $AGENT_TYPE",
  "remoteEnv": {
    "NODE_ENV": "production",
    "ECTROPY_AGENT_TYPE": "$AGENT_TYPE"
  }
}
EOF
}
