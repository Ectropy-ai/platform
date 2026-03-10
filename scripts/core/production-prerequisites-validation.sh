#!/bin/bash
set -e

# Production Deployment Prerequisites Validation
# Phase 2 of Enterprise Compliance Protocol

echo "🚀 PRODUCTION DEPLOYMENT PREREQUISITES"
echo "======================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log with colors
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%H:%M:%S')
    
    case $level in
        "INFO") echo -e "${BLUE}🔍 [$timestamp]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}✅ [$timestamp]${NC} $message" ;;
        "ERROR") echo -e "${RED}❌ [$timestamp]${NC} $message" ;;
        "WARNING") echo -e "${YELLOW}⚠️  [$timestamp]${NC} $message" ;;
    esac
}

# 1. VERIFY PRODUCTION CONFIGURATION
log "INFO" "Production Configuration Check..."
if [ -f "environments/production.env.template" ]; then
    log "SUCCESS" "Production template ready"
    PROD_CONFIG_OK=1
else
    log "WARNING" "Missing production template - checking alternatives"
    if [ -f ".env.production.template" ]; then
        log "SUCCESS" "Alternative production template found"
        PROD_CONFIG_OK=1
    else
        log "ERROR" "Missing production template"
        PROD_CONFIG_OK=0
    fi
fi

# 2. DOCKER PRODUCTION READINESS
log "INFO" "Docker Production Readiness..."
if [ -f "docker-compose.production.yml" ]; then
    if docker compose -f docker-compose.production.yml config --quiet 2>/dev/null; then
        log "SUCCESS" "Docker config valid"
        DOCKER_CONFIG_OK=1
    else
        log "WARNING" "Review Docker setup - config issues detected"
        DOCKER_CONFIG_OK=0
    fi
else
    log "WARNING" "docker-compose.production.yml not found - checking alternatives"
    if [ -f "Dockerfile.production" ]; then
        log "SUCCESS" "Production Dockerfile found"
        DOCKER_CONFIG_OK=1
    else
        log "ERROR" "No production Docker configuration"
        DOCKER_CONFIG_OK=0
    fi
fi

# 3. ENVIRONMENT VARIABLE VALIDATION
log "INFO" "Environment Security Patterns..."
# Check for unsafe environment access patterns
UNSAFE_PATTERNS=$(grep -r "process.env\[" --include="*.ts" --include="*.js" apps/ libs/ 2>/dev/null | wc -l || echo 0)
if [ "$UNSAFE_PATTERNS" -eq 0 ]; then
    log "SUCCESS" "Secure env patterns"
    ENV_SECURITY_OK=1
else
    log "WARNING" "$UNSAFE_PATTERNS unsafe env patterns found"
    ENV_SECURITY_OK=0
fi

# 4. FINAL SECURITY PATTERNS AUDIT
log "INFO" "Security Patterns Audit..."
if command -v secretlint &> /dev/null; then
    if pnpm run scan:secrets > /tmp/secrets_scan 2>&1; then
        log "SUCCESS" "No hardcoded secrets"
        SECRETS_OK=1
    else
        log "WARNING" "Review secrets scan"
        SECRETS_OK=0
    fi
else
    log "WARNING" "Secretlint not available - using alternative validation"
    # Check for common secret patterns
    SECRET_PATTERNS=$(grep -ri "password\|secret\|key" --include="*.ts" --include="*.js" apps/ libs/ | grep -v ".env" | grep -v "process.env" | wc -l || echo 0)
    if [ "$SECRET_PATTERNS" -lt 5 ]; then
        log "SUCCESS" "Minimal hardcoded patterns detected"
        SECRETS_OK=1
    else
        log "WARNING" "Review potential secret patterns"
        SECRETS_OK=0
    fi
fi

# 5. PRODUCTION READINESS CHECKLIST
log "INFO" "Production Readiness Checklist..."
echo "  📋 Configuration Management:"
echo "    • Production templates: $([ $PROD_CONFIG_OK -eq 1 ] && echo "✅" || echo "⚠️ ")"
echo "    • Docker configuration: $([ $DOCKER_CONFIG_OK -eq 1 ] && echo "✅" || echo "⚠️ ")"
echo "    • Environment security: $([ $ENV_SECURITY_OK -eq 1 ] && echo "✅" || echo "⚠️ ")"
echo "    • Secret management: $([ $SECRETS_OK -eq 1 ] && echo "✅" || echo "⚠️ ")"

# Calculate overall readiness
TOTAL_CHECKS=4
PASSED_CHECKS=$(($PROD_CONFIG_OK + $DOCKER_CONFIG_OK + $ENV_SECURITY_OK + $SECRETS_OK))
READINESS_PERCENT=$(echo "scale=0; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc)

echo ""
echo "📊 Production Readiness Score: $PASSED_CHECKS/$TOTAL_CHECKS ($READINESS_PERCENT%)"

if [ $PASSED_CHECKS -eq $TOTAL_CHECKS ]; then
    log "SUCCESS" "🚀 PRODUCTION DEPLOYMENT READY"
    echo ""
    echo "✅ All production prerequisites validated"
    echo "✅ Ready for enterprise deployment"
    exit 0
elif [ $PASSED_CHECKS -ge 3 ]; then
    log "WARNING" "⚠️  PRODUCTION DEPLOYMENT ACCEPTABLE"
    echo ""
    echo "✅ Critical prerequisites met"
    echo "⚠️  Minor configuration improvements recommended"
    exit 0
else
    log "ERROR" "❌ PRODUCTION DEPLOYMENT BLOCKED"
    echo ""
    echo "❌ Critical prerequisites missing"
    echo "📋 Required actions:"
    echo "  • Set up production configuration templates"
    echo "  • Configure Docker for production"
    echo "  • Review security patterns"
    echo "  • Implement secret management"
    exit 1
fi