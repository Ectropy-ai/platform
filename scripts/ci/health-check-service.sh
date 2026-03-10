#!/bin/bash
# Generic service health checker
# Usage: health-check-service.sh <service-name> <port> <endpoint> [max-attempts] [retry-delay]
#
# Example: health-check-service.sh api-gateway 4000 /health 30 2
#
# Exit Codes:
#   0 - Service is healthy
#   1 - Service failed health check after all retries

set -e

# Parse arguments
SERVICE_NAME=${1:-"unknown-service"}
PORT=${2:-8080}
ENDPOINT=${3:-"/health"}
MAX_ATTEMPTS=${4:-30}
RETRY_DELAY=${5:-2}

# Color codes for output (if terminal supports it)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  BLUE='\033[0;34m'
  NC='\033[0m' # No Color
else
  GREEN=''
  YELLOW=''
  RED=''
  BLUE=''
  NC=''
fi

# Function to log with timestamp
log() {
  echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if service is responding
check_health() {
  local url="http://localhost:${PORT}${ENDPOINT}"
  
  # Try to connect with timeout
  if curl -f -s -m 5 "$url" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# Main health check loop
log "${BLUE}🏥 Starting health check for ${SERVICE_NAME}${NC}"
log "${BLUE}   URL: http://localhost:${PORT}${ENDPOINT}${NC}"
log "${BLUE}   Max attempts: ${MAX_ATTEMPTS}, Retry delay: ${RETRY_DELAY}s${NC}"

ATTEMPT=0
TOTAL_WAIT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  
  if check_health; then
    log "${GREEN}✅ ${SERVICE_NAME} is healthy (attempt ${ATTEMPT}/${MAX_ATTEMPTS}, waited ${TOTAL_WAIT}s)${NC}"
    exit 0
  fi
  
  # Log progress
  if [ $((ATTEMPT % 5)) -eq 0 ]; then
    log "${YELLOW}⏳ ${SERVICE_NAME} not ready yet (attempt ${ATTEMPT}/${MAX_ATTEMPTS}, waited ${TOTAL_WAIT}s)${NC}"
  else
    log "⏳ Waiting for ${SERVICE_NAME} (attempt ${ATTEMPT}/${MAX_ATTEMPTS})..."
  fi
  
  # Wait before retry
  sleep $RETRY_DELAY
  TOTAL_WAIT=$((TOTAL_WAIT + RETRY_DELAY))
done

# Failed after all retries
log "${RED}❌ ${SERVICE_NAME} failed health check after ${MAX_ATTEMPTS} attempts (${TOTAL_WAIT}s total)${NC}"

# Show diagnostic information
log "${BLUE}📊 Diagnostic Information:${NC}"
log "   Port: ${PORT}"
log "   Endpoint: ${ENDPOINT}"
log "   Max attempts: ${MAX_ATTEMPTS}"
log "   Total wait time: ${TOTAL_WAIT}s"

# Try to get more info about what's on the port
log ""
log "${BLUE}🔍 Port Status:${NC}"
if command -v netstat > /dev/null 2>&1; then
  netstat -tuln | grep ":${PORT}" || log "   Port ${PORT} not listening"
elif command -v ss > /dev/null 2>&1; then
  ss -tuln | grep ":${PORT}" || log "   Port ${PORT} not listening"
else
  log "   (netstat/ss not available for port check)"
fi

# Try to get process info
log ""
log "${BLUE}🔍 Process Information:${NC}"
if command -v lsof > /dev/null 2>&1; then
  lsof -i ":${PORT}" 2>/dev/null || log "   No process listening on port ${PORT}"
else
  log "   (lsof not available for process check)"
fi

exit 1
