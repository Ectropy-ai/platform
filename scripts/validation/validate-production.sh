#!/bin/bash
# Production Validation Script
# Automates production health checks and generates validation report

set -euo pipefail

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Timeout and retry configuration (increased for CI reliability)
CURL_TIMEOUT=30          # Maximum time for curl requests (seconds)
CURL_RETRIES=5           # Number of retry attempts
CURL_RETRY_DELAY=3       # Delay between retries (seconds)
OPENSSL_TIMEOUT=30       # Maximum time for openssl checks (seconds)

# Production URL
# NOTE: Using staging.ectropy.ai as production proxy until ectropy.ai domain is configured
# ectropy.ai domain does not resolve (DNS not configured as of 2025-10-31)
# staging.ectropy.ai is the actual deployed production-like environment
PROD_URL="${PRODUCTION_URL:-https://staging.ectropy.ai}"

# Validation results
PASSED=0
FAILED=0
WARNINGS=0

# Create evidence directory if it doesn't exist
EVIDENCE_DIR="evidence"
mkdir -p "$EVIDENCE_DIR"

# Output file
OUTPUT_FILE="$EVIDENCE_DIR/production-validation-$(date +%Y%m%d-%H%M%S).txt"

echo "🔍 Production Validation Script" | tee "$OUTPUT_FILE"
echo "=================================" | tee -a "$OUTPUT_FILE"
echo "Date: $(date)" | tee -a "$OUTPUT_FILE"
echo "URL: $PROD_URL" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

# Function to log result
log_result() {
    local status=$1
    local message=$2
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓${NC} $message" | tee -a "$OUTPUT_FILE"
        ((PASSED++))
    elif [ "$status" = "FAIL" ]; then
        echo -e "${RED}✗${NC} $message" | tee -a "$OUTPUT_FILE"
        ((FAILED++))
    else
        echo -e "${YELLOW}⚠${NC} $message" | tee -a "$OUTPUT_FILE"
        ((WARNINGS++))
    fi
}

# 1. HTTPS Check with retry logic
echo "1. Testing HTTPS..." | tee -a "$OUTPUT_FILE"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $CURL_TIMEOUT --retry $CURL_RETRIES --retry-delay $CURL_RETRY_DELAY "$PROD_URL")
if [ "$HTTP_CODE" = "200" ]; then
    log_result "PASS" "HTTPS responding with 200"
else
    log_result "FAIL" "HTTPS responding with $HTTP_CODE (expected 200)"
fi

# 2. HTTP → HTTPS Redirect
echo "2. Testing HTTP → HTTPS redirect..." | tee -a "$OUTPUT_FILE"
# Extract domain from PROD_URL
PROD_DOMAIN=$(echo "$PROD_URL" | sed 's|https\?://||' | cut -d'/' -f1)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $CURL_TIMEOUT --retry $CURL_RETRIES --retry-delay $CURL_RETRY_DELAY "http://$PROD_DOMAIN")
if [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "308" ]; then
    log_result "PASS" "HTTP redirects to HTTPS (code: $HTTP_CODE)"
else
    log_result "WARN" "HTTP redirect returned code: $HTTP_CODE (expected 301/302/308)"
fi

# 3. API Health with retry logic
echo "3. Testing API health endpoint..." | tee -a "$OUTPUT_FILE"
API_RESPONSE=$(curl -s --max-time $CURL_TIMEOUT --retry $CURL_RETRIES --retry-delay $CURL_RETRY_DELAY "$PROD_URL/api/health")
if echo "$API_RESPONSE" | jq -e '.status == "healthy" or .status == "degraded"' > /dev/null 2>&1; then
    API_STATUS=$(echo "$API_RESPONSE" | jq -r '.status')
    API_ENV=$(echo "$API_RESPONSE" | jq -r '.environment')
    log_result "PASS" "API health endpoint responding correctly (status: $API_STATUS, env: $API_ENV)"
else
    log_result "FAIL" "API health endpoint not responding correctly"
    echo "Response: $API_RESPONSE" | tee -a "$OUTPUT_FILE"
fi

# 4. MCP Health with retry logic
echo "4. Testing MCP health endpoint..." | tee -a "$OUTPUT_FILE"
MCP_RESPONSE=$(curl -s --max-time $CURL_TIMEOUT --retry $CURL_RETRIES --retry-delay $CURL_RETRY_DELAY "$PROD_URL/mcp/health")
if echo "$MCP_RESPONSE" | jq -e '.service == "mcp-server"' > /dev/null 2>&1; then
    MCP_STATUS=$(echo "$MCP_RESPONSE" | jq -r '.status // "unknown"')
    MCP_ENV=$(echo "$MCP_RESPONSE" | jq -r '.environment // "unknown"')
    log_result "PASS" "MCP health endpoint responding correctly (status: $MCP_STATUS, env: $MCP_ENV)"
else
    log_result "FAIL" "MCP health endpoint not responding correctly"
    echo "Response: $MCP_RESPONSE" | tee -a "$OUTPUT_FILE"
fi

# 5. SSL Certificate
echo "5. Checking SSL certificate..." | tee -a "$OUTPUT_FILE"
# Extract domain from PROD_URL
PROD_DOMAIN=$(echo "$PROD_URL" | sed 's|https\?://||' | cut -d'/' -f1)
if timeout $OPENSSL_TIMEOUT openssl s_client -connect "$PROD_DOMAIN:443" -servername "$PROD_DOMAIN" < /dev/null 2>&1 | grep -q "Verify return code: 0"; then
    log_result "PASS" "SSL certificate valid for $PROD_DOMAIN"
else
    log_result "FAIL" "SSL certificate validation failed for $PROD_DOMAIN"
fi

# 6. Security Headers
echo "6. Checking security headers..." | tee -a "$OUTPUT_FILE"
HEADERS=$(curl -s -I --max-time $CURL_TIMEOUT --retry $CURL_RETRIES --retry-delay $CURL_RETRY_DELAY "$PROD_URL")
SECURITY_HEADERS=0
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
    ((SECURITY_HEADERS++))
fi
if echo "$HEADERS" | grep -qi "x-frame-options"; then
    ((SECURITY_HEADERS++))
fi
if echo "$HEADERS" | grep -qi "strict-transport-security"; then
    ((SECURITY_HEADERS++))
fi

if [ $SECURITY_HEADERS -ge 2 ]; then
    log_result "PASS" "Security headers present ($SECURITY_HEADERS/3)"
elif [ $SECURITY_HEADERS -eq 1 ]; then
    log_result "WARN" "Some security headers missing ($SECURITY_HEADERS/3)"
else
    log_result "WARN" "Security headers missing (0/3)"
fi

# 7. Database Health
echo "7. Checking database health..." | tee -a "$OUTPUT_FILE"
DB_STATUS=$(echo "$API_RESPONSE" | jq -r '.services.database // .database.status // "unknown"')
if [ "$DB_STATUS" = "healthy" ]; then
    log_result "PASS" "Database healthy"
elif [ "$DB_STATUS" = "unknown" ]; then
    log_result "WARN" "Database status not reported in health endpoint"
else
    log_result "FAIL" "Database status: $DB_STATUS"
fi

# 8. Redis Health
echo "8. Checking Redis health..." | tee -a "$OUTPUT_FILE"
REDIS_STATUS=$(echo "$API_RESPONSE" | jq -r '.services.redis // "unknown"')
if [ "$REDIS_STATUS" = "healthy" ]; then
    log_result "PASS" "Redis healthy"
elif [ "$REDIS_STATUS" = "unknown" ]; then
    log_result "WARN" "Redis status not reported in health endpoint"
else
    log_result "FAIL" "Redis status: $REDIS_STATUS"
fi

# Summary
echo "" | tee -a "$OUTPUT_FILE"
echo "=================================" | tee -a "$OUTPUT_FILE"
echo "Validation Summary" | tee -a "$OUTPUT_FILE"
echo "=================================" | tee -a "$OUTPUT_FILE"
echo "Passed:   $PASSED" | tee -a "$OUTPUT_FILE"
echo "Failed:   $FAILED" | tee -a "$OUTPUT_FILE"
echo "Warnings: $WARNINGS" | tee -a "$OUTPUT_FILE"
echo "Total:    $((PASSED + FAILED + WARNINGS))" | tee -a "$OUTPUT_FILE"
echo "" | tee -a "$OUTPUT_FILE"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}" | tee -a "$OUTPUT_FILE"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Review $OUTPUT_FILE for details.${NC}" | tee -a "$OUTPUT_FILE"
    exit 1
fi
