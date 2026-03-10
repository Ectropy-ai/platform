#!/bin/bash
# OAuth Debugging Script for DigitalOcean Console
# Run this on the staging server to diagnose OAuth flow failures
# Usage: bash oauth-debug.sh

set -euo pipefail

LOG_FILE="oauth-debug-$(date +%Y%m%d-%H%M%S).log"

echo "========================================"
echo "  Ectropy OAuth Flow Diagnostics"
echo "========================================"
echo ""
echo "Target: staging.ectropy.ai"
echo "Date: $(date)"
echo "Log file: $LOG_FILE"
echo ""

# Container names
API_CONTAINER="ectropy-api-gateway"
REDIS_CONTAINER="ectropy-redis"
WEB_CONTAINER="ectropy-web-dashboard"
NGINX_CONTAINER="nginx"

# Helper function for logging
log_section() {
  echo "" | tee -a "$LOG_FILE"
  echo "=== $1 ===" | tee -a "$LOG_FILE"
}

# 1. Container Health
log_section "1. Container Status"
docker ps -a --filter name=ectropy --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | tee -a "$LOG_FILE"

# 2. API Gateway Startup Logs
log_section "2. API Gateway Startup Logs (OAuth/Session Initialization)"
docker logs $API_CONTAINER 2>&1 | grep -E "OAuth|Session|Passport|express-session|connect-redis|GOOGLE_CLIENT_ID" | head -30 || echo "No OAuth initialization logs found" | tee -a "$LOG_FILE"

# 3. API Gateway Recent OAuth Activity
log_section "3. Recent OAuth Activity (last 100 lines)"
docker logs $API_CONTAINER --tail 100 2>&1 | grep -E "OAUTH|SESSION|PASSPORT|auth/google|auth/me|/auth/" || echo "❌ NO OAuth logs found - this is the issue!" | tee -a "$LOG_FILE"

# 4. API Gateway Recent Errors
log_section "4. API Gateway Recent Errors"
docker logs $API_CONTAINER --tail 200 2>&1 | grep -E "ERROR|Error|error|Exception|ECONNREFUSED|ENOTFOUND" | tail -30 || echo "No recent errors" | tee -a "$LOG_FILE"

# 5. Redis Connectivity
log_section "5. Redis Connectivity Test"
echo "Redis PING:" | tee -a "$LOG_FILE"
docker exec $REDIS_CONTAINER redis-cli -a "$REDIS_PASSWORD" ping 2>&1 | tee -a "$LOG_FILE"

echo "Redis DB size:" | tee -a "$LOG_FILE"
docker exec $REDIS_CONTAINER redis-cli -a "$REDIS_PASSWORD" dbsize 2>&1 | tee -a "$LOG_FILE"

echo "Redis session keys (ectropy:session:*):" | tee -a "$LOG_FILE"
docker exec $REDIS_CONTAINER redis-cli -a "$REDIS_PASSWORD" --scan --pattern "ectropy:session:*" 2>&1 | head -20 || echo "No session keys found" | tee -a "$LOG_FILE"

echo "Redis AUTH keys:" | tee -a "$LOG_FILE"
docker exec $REDIS_CONTAINER redis-cli -a "$REDIS_PASSWORD" keys "*auth*" 2>&1 | head -20 || echo "No auth keys found" | tee -a "$LOG_FILE"

# 6. Environment Variables
log_section "6. Environment Variables (Sensitive Redacted)"
docker exec $API_CONTAINER printenv | grep -E "GOOGLE_CLIENT_ID|OAUTH_REDIRECT|FRONTEND_URL|SESSION_SECRET|REDIS|AUTHORIZED_USERS|NODE_ENV" | sed 's/=\(.\{10\}\).*/=\1***REDACTED***/g' | tee -a "$LOG_FILE"

# 7. Test API Gateway Health
log_section "7. Test /auth/health Endpoint"
docker exec $API_CONTAINER curl -s http://localhost:4000/auth/health 2>&1 | tee -a "$LOG_FILE"

# 8. Test API Gateway /auth/me
log_section "8. Test /auth/me Endpoint (should return 401 without session)"
docker exec $API_CONTAINER curl -s -w "\nHTTP Status: %{http_code}\n" http://localhost:4000/auth/me 2>&1 | tee -a "$LOG_FILE"

# 9. Test API Gateway /auth/google (should redirect to Google)
log_section "9. Test /auth/google Endpoint (should redirect 302)"
docker exec $API_CONTAINER curl -s -w "\nHTTP Status: %{http_code}\n" -I http://localhost:4000/auth/google 2>&1 | head -20 | tee -a "$LOG_FILE"

# 10. Nginx Configuration
log_section "10. Nginx Configuration (OAuth routes)"
docker exec $NGINX_CONTAINER cat /etc/nginx/conf.d/default.conf 2>&1 | grep -B 5 -A 15 "location /auth" || echo "Nginx not found or no /auth location" | tee -a "$LOG_FILE"

# 11. Nginx Access Logs (OAuth requests)
log_section "11. Nginx Access Logs (OAuth requests)"
docker logs $NGINX_CONTAINER 2>&1 | grep -E "/auth/|oauth" | tail -30 || echo "No OAuth requests in nginx logs" | tee -a "$LOG_FILE"

# 12. Test OAuth URLs from Internet
log_section "12. Test OAuth Callback URL from Outside"
echo "Testing: https://staging.ectropy.ai/auth/google/callback" | tee -a "$LOG_FILE"
curl -s -w "\nHTTP Status: %{http_code}\n" -L https://staging.ectropy.ai/auth/google/callback 2>&1 | head -30 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Testing: https://staging.ectropy.ai/auth/health" | tee -a "$LOG_FILE"
curl -s -w "\nHTTP Status: %{http_code}\n" https://staging.ectropy.ai/auth/health 2>&1 | tee -a "$LOG_FILE"

# 13. Check CORS/Cookie Configuration
log_section "13. CORS and Cookie Configuration in Logs"
docker logs $API_CONTAINER --tail 200 2>&1 | grep -iE "cors|cookie|sameSite|secure|credentials|origin|access-control" | tail -20 || echo "No CORS/cookie logs" | tee -a "$LOG_FILE"

# 14. Check Session Configuration
log_section "14. Session Configuration Details"
docker logs $API_CONTAINER 2>&1 | grep -iE "session|store|redis.*connected|connect-redis" | head -20 || echo "No session configuration logs" | tee -a "$LOG_FILE"

# 15. Check Passport.js Configuration
log_section "15. Passport.js Configuration"
docker logs $API_CONTAINER 2>&1 | grep -iE "passport|strategy|google.*oauth|serializ|deserializ" | head -20 || echo "No Passport.js logs" | tee -a "$LOG_FILE"

# 16. Web Dashboard Container Health
log_section "16. Web Dashboard Container Status"
docker logs $WEB_CONTAINER --tail 50 2>&1 | grep -iE "error|oauth|auth|api.*url" || echo "No relevant web-dashboard logs" | tee -a "$LOG_FILE"

# 17. Network Connectivity Between Containers
log_section "17. Network Connectivity (API Gateway -> Redis)"
docker exec $API_CONTAINER sh -c "nc -zv redis 6379 2>&1" || echo "Netcat not available, testing with ping..." | tee -a "$LOG_FILE"
docker exec $API_CONTAINER sh -c "ping -c 2 redis 2>&1" || echo "Cannot test connectivity" | tee -a "$LOG_FILE"

# 18. Summary
log_section "DIAGNOSTIC SUMMARY"
echo "" | tee -a "$LOG_FILE"
echo "✅ Checks completed. Key findings:" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Check if OAuth logs exist
if docker logs $API_CONTAINER --tail 100 2>&1 | grep -qE "OAUTH|auth/google"; then
  echo "✅ OAuth logs found in API Gateway" | tee -a "$LOG_FILE"
else
  echo "❌ NO OAuth logs in API Gateway - OAuth requests not reaching backend!" | tee -a "$LOG_FILE"
fi

# Check if Redis is accessible
if docker exec $REDIS_CONTAINER redis-cli -a "$REDIS_PASSWORD" ping 2>&1 | grep -q "PONG"; then
  echo "✅ Redis is accessible" | tee -a "$LOG_FILE"
else
  echo "❌ Redis is NOT accessible" | tee -a "$LOG_FILE"
fi

# Check session count
SESSION_COUNT=$(docker exec $REDIS_CONTAINER redis-cli -a "$REDIS_PASSWORD" --scan --pattern "ectropy:session:*" 2>&1 | wc -l)
echo "📊 Session count in Redis: $SESSION_COUNT" | tee -a "$LOG_FILE"

if [ "$SESSION_COUNT" -eq 0 ]; then
  echo "⚠️  No sessions in Redis - OAuth flow not creating sessions!" | tee -a "$LOG_FILE"
fi

echo "" | tee -a "$LOG_FILE"
echo "========================================"
echo "  Diagnostics Complete"
echo "========================================"
echo ""
echo "📄 Log file saved to: $LOG_FILE"
echo ""
echo "Next steps:"
echo "1. Review the log file for errors"
echo "2. If NO OAuth logs found: Check frontend OAuth button implementation"
echo "3. If OAuth logs found but no sessions: Check session/Redis configuration"
echo "4. Share $LOG_FILE for detailed analysis"
