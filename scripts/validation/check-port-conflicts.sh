#!/bin/bash

# Port Conflict Detection Script
# 
# Automatically detect port conflicts in infrastructure catalog
# Run before any port allocation changes
# Prevents deployment failures from port collisions
#
# Exit codes:
#   0 - No conflicts detected
#   1 - Conflicts detected

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

CATALOG_PATH="apps/mcp-server/data/infrastructure-catalog.json"

echo -e "${BOLD}${BLUE}Port Conflict Detection${NC}\n"

# Check if catalog file exists
if [ ! -f "$CATALOG_PATH" ]; then
  echo -e "${RED}❌ Infrastructure catalog not found: $CATALOG_PATH${NC}"
  exit 1
fi

# Extract port information using jq
echo -e "${BOLD}Checking for port conflicts...${NC}\n"

# Create temporary file for port analysis
TMP_FILE=$(mktemp)

# Extract all ports with their service and protocol
jq -r '.ports[] | "\(.number)|\(.protocol)|\(.service)"' "$CATALOG_PATH" > "$TMP_FILE"

# Check for conflicts
CONFLICTS=0
declare -A PORT_MAP

while IFS='|' read -r port protocol service; do
  key="${port}-${protocol}"
  
  if [ -n "${PORT_MAP[$key]}" ]; then
    echo -e "${RED}❌ Port conflict detected:${NC}"
    echo -e "   Port ${BOLD}${port}${NC} (${protocol}) used by:"
    echo -e "     - ${PORT_MAP[$key]}"
    echo -e "     - ${service}"
    echo ""
    CONFLICTS=$((CONFLICTS + 1))
  else
    PORT_MAP[$key]="$service"
  fi
done < "$TMP_FILE"

# Clean up
rm -f "$TMP_FILE"

# Display port usage summary
echo -e "${BOLD}Port Usage Summary:${NC}"
echo -e "Total ports allocated: ${BLUE}$(jq '.ports | length' "$CATALOG_PATH")${NC}"

# Group by protocol
for protocol in HTTP HTTPS TCP UDP; do
  count=$(jq ".ports | map(select(.protocol == \"$protocol\")) | length" "$CATALOG_PATH")
  if [ "$count" -gt 0 ]; then
    echo -e "  $protocol: ${BLUE}$count${NC} ports"
  fi
done

echo ""

# Exit with appropriate code
if [ $CONFLICTS -eq 0 ]; then
  echo -e "${GREEN}✅ No port conflicts detected${NC}"
  exit 0
else
  echo -e "${RED}❌ Found $CONFLICTS port conflict(s)${NC}"
  echo -e "${YELLOW}Fix conflicts before committing changes${NC}"
  exit 1
fi
