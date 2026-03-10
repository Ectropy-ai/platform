#!/bin/bash
set -euo pipefail

###############################################################################
# Nginx Configuration Structure Validation
# Purpose: Ensure nginx configs are properly formatted before deployment
# Usage: validate-nginx-structure.sh [config-file-path]
###############################################################################

echo "🔍 Validating Nginx configuration structure..."

# Accept config file path as argument, or validate entire nginx directory
CONFIG_FILE="${1:-}"
NGINX_DIR="infrastructure/nginx"

# If a specific config file is provided, validate it
if [[ -n "$CONFIG_FILE" ]]; then
  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "❌ ERROR: Config file not found: $CONFIG_FILE"
    exit 1
  fi
  
  echo "📄 Validating specific config: $CONFIG_FILE"
  
  # Check for basic server block or http block
  if grep -q "server[[:space:]]*{" "$CONFIG_FILE" || grep -q "http[[:space:]]*{" "$CONFIG_FILE"; then
    echo "  ✅ Valid nginx configuration structure found"
  else
    echo "  ❌ ERROR: No server or http block found in $CONFIG_FILE"
    exit 1
  fi
  
  # Check for basic nginx syntax
  if grep -q "upstream\|location\|proxy_pass\|listen" "$CONFIG_FILE"; then
    echo "  ✅ Contains nginx directives"
  else
    echo "  ⚠️  WARNING: File may be incomplete - no common nginx directives found"
  fi
  
  echo "✅ Configuration validation complete: $CONFIG_FILE"
  exit 0
fi

# Validate entire nginx directory
if [[ ! -d "$NGINX_DIR" ]]; then
  echo "❌ ERROR: Nginx directory not found at $NGINX_DIR"
  exit 1
fi

echo "📁 Validating nginx directory: $NGINX_DIR"

# Find and validate all .conf files
CONF_FILES_FOUND=0
CONF_FILES_VALID=0

for conf in "$NGINX_DIR"/*.conf; do
  if [[ -f "$conf" ]]; then
    CONF_FILES_FOUND=$((CONF_FILES_FOUND + 1))
    echo "  📄 Found: $(basename "$conf")"
    
    # Check for basic server block or http block
    if grep -q "server[[:space:]]*{" "$conf" || grep -q "http[[:space:]]*{" "$conf"; then
      echo "    ✅ Valid structure"
      CONF_FILES_VALID=$((CONF_FILES_VALID + 1))
    else
      echo "    ⚠️  WARNING: No server or http block in $(basename "$conf")"
    fi
  fi
done

# Check if we found any config files
if [[ $CONF_FILES_FOUND -eq 0 ]]; then
  echo "❌ ERROR: No nginx configuration files found in $NGINX_DIR"
  exit 1
fi

# Summary
echo ""
echo "📊 Validation Summary:"
echo "   - Config files found: $CONF_FILES_FOUND"
echo "   - Valid configs: $CONF_FILES_VALID"

if [[ $CONF_FILES_VALID -eq $CONF_FILES_FOUND ]]; then
  echo "✅ Nginx structure validation complete - all configs valid"
  exit 0
else
  echo "⚠️  Nginx structure validation complete with warnings"
  exit 0
fi
