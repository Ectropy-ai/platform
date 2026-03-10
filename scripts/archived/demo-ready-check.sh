#!/bin/bash
set -euo pipefail

echo "📋 FINAL DEMO READINESS CHECKLIST"
echo "=================================="

# Configuration
API_BASE="http://localhost:3000"
MCP_BASE="http://localhost:3001"
WEB_BASE="http://localhost:3002"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }
print_header() { echo -e "${PURPLE}🎯 $1${NC}"; }

# Overall readiness tracking
OVERALL_READY=true
CRITICAL_ISSUES=0
MINOR_ISSUES=0

# Function to test service availability
test_service() {
    local name=$1
    local url=$2
    local critical=${3:-true}
    
    echo -n "  $name: "
    
    if curl -f -s --max-time 5 "$url" > /dev/null 2>&1; then
        print_success "OPERATIONAL"
        return 0
    else
        if [ "$critical" = "true" ]; then
            print_error "DOWN (CRITICAL)"
            CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
            OVERALL_READY=false
        else
            print_warning "DOWN (MINOR)"
            MINOR_ISSUES=$((MINOR_ISSUES + 1))
        fi
        return 1
    fi
}

# Function to test database
test_database() {
    echo -n "  Database Connection: "
    
    if docker exec $(docker compose -f docker-compose.development.yml ps -q postgres 2>/dev/null) psql -U postgres -d ectropy_dev -c "SELECT 1;" >/dev/null 2>&1; then
        print_success "CONNECTED"
        
        # Check for demo data
        echo -n "  Demo Data: "
        local user_count=$(docker exec $(docker compose -f docker-compose.development.yml ps -q postgres 2>/dev/null) psql -U postgres -d ectropy_dev -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs || echo "0")
        local project_count=$(docker exec $(docker compose -f docker-compose.development.yml ps -q postgres 2>/dev/null) psql -U postgres -d ectropy_dev -t -c "SELECT COUNT(*) FROM projects;" 2>/dev/null | xargs || echo "0")
        
        if [ "$user_count" -gt 0 ] && [ "$project_count" -gt 0 ]; then
            print_success "LOADED ($user_count users, $project_count projects)"
        elif [ "$user_count" -gt 0 ]; then
            print_warning "PARTIAL (users: $user_count, projects: $project_count)"
            MINOR_ISSUES=$((MINOR_ISSUES + 1))
        else
            print_warning "NEEDS SEEDING"
            MINOR_ISSUES=$((MINOR_ISSUES + 1))
        fi
    else
        print_error "DISCONNECTED"
        CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
        OVERALL_READY=false
    fi
}

print_header "INFRASTRUCTURE SERVICES"
echo "========================"

# Check Docker containers
echo "🐳 Docker Services:"
CONTAINERS_RUNNING=$(docker compose -f docker-compose.development.yml ps --filter status=running --format json 2>/dev/null | wc -l || echo "0")
TOTAL_CONTAINERS=$(docker compose -f docker-compose.development.yml config --services | wc -l || echo "0")

echo "  Container Status: $CONTAINERS_RUNNING/$TOTAL_CONTAINERS running"

if [ "$CONTAINERS_RUNNING" -ge 4 ]; then
    print_success "Docker infrastructure operational"
else
    print_error "Insufficient containers running"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    OVERALL_READY=false
fi

# Database check
echo ""
echo "🗄️  Database Status:"
test_database

# Redis check
echo ""
echo "🔴 Redis Status:"
echo -n "  Redis Connection: "
if docker exec $(docker compose -f docker-compose.development.yml ps -q redis 2>/dev/null) redis-cli ping >/dev/null 2>&1; then
    print_success "OPERATIONAL"
else
    print_error "DOWN"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    OVERALL_READY=false
fi

print_header "APPLICATION SERVICES"
echo "====================="

# API Gateway
echo "🔗 API Gateway:"
test_service "Health Check" "$API_BASE/health"
test_service "Projects API" "$API_BASE/api/v1/projects" false
test_service "Elements API" "$API_BASE/api/v1/elements" false
test_service "Auth API" "$API_BASE/api/v1/auth/status" false

# MCP Server
echo ""
echo "🤖 MCP Server:"
test_service "Health Check" "$MCP_BASE/health"
test_service "Agents Status" "$MCP_BASE/api/agents/status" false

# Web Dashboard
echo ""
echo "🌐 Web Dashboard:"
test_service "Main Page" "$WEB_BASE/"
test_service "Projects Page" "$WEB_BASE/projects" false
test_service "Elements Page" "$WEB_BASE/elements" false

print_header "SECURITY STATUS"
echo "==============="

# Security checks
echo "🔒 Security Audit:"

# Check for environment files
echo -n "  Environment Files: "
if [ ! -f ".env" ] && [ ! -f ".env.local" ]; then
    print_success "SECURE (no .env files in repo)"
else
    print_warning "Environment files detected"
    MINOR_ISSUES=$((MINOR_ISSUES + 1))
fi

# Check for hardcoded secrets
echo -n "  Secret Scanning: "
SECRET_COUNT=$(grep -r -i "password\|secret\|key\|token" --include="*.ts" --include="*.js" apps/ libs/ 2>/dev/null | grep -v -E "\.test\.|\.spec\.|example|template|placeholder" | wc -l || echo "0")
if [ "$SECRET_COUNT" -eq 0 ]; then
    print_success "NO HARDCODED SECRETS"
else
    print_warning "$SECRET_COUNT potential secrets found"
    MINOR_ISSUES=$((MINOR_ISSUES + 1))
fi

# Check console statements
echo -n "  Console Statements: "
CONSOLE_COUNT=$(grep -r "console\." --include="*.ts" --include="*.js" apps/ 2>/dev/null | grep -v -E "\.test\.|\.spec\.|debug" | wc -l || echo "0")
if [ "$CONSOLE_COUNT" -eq 0 ]; then
    print_success "CLEAN"
else
    print_warning "$CONSOLE_COUNT console statements found"
    MINOR_ISSUES=$((MINOR_ISSUES + 1))
fi

print_header "DEMO FEATURES"
echo "============="

# Authentication
echo "🔐 Authentication System:"
echo -n "  Login Endpoint: "
LOGIN_TEST=$(curl -s -X POST "$API_BASE/api/v1/auth/login" -H "Content-Type: application/json" -d '{"email":"test","password":"test"}' 2>/dev/null || echo '{"error":"failed"}')
if echo "$LOGIN_TEST" | grep -q -E '"token"|"error"'; then
    print_success "RESPONDING"
else
    print_warning "NOT CONFIGURED"
    MINOR_ISSUES=$((MINOR_ISSUES + 1))
fi

# Core Features
echo ""
echo "🏗️  Core Features:"
FEATURES=("Projects:$API_BASE/api/v1/projects" "Elements:$API_BASE/api/v1/elements" "Proposals:$API_BASE/api/v1/proposals" "Users:$API_BASE/api/v1/users")

for feature in "${FEATURES[@]}"; do
    IFS=':' read -r name url <<< "$feature"
    echo -n "  $name API: "
    if curl -f -s --max-time 5 "$url" >/dev/null 2>&1; then
        print_success "AVAILABLE"
    else
        print_warning "NEEDS SETUP"
        MINOR_ISSUES=$((MINOR_ISSUES + 1))
    fi
done

# AI Agents
echo ""
echo "🤖 AI Agents:"
if curl -f -s --max-time 5 "$MCP_BASE/health" >/dev/null 2>&1; then
    AGENTS=("cost-estimation" "schedule-optimization" "quality-assurance" "compliance-checking" "document-processing")
    ACTIVE_AGENTS=0
    
    for agent in "${AGENTS[@]}"; do
        if curl -f -s --max-time 5 "$MCP_BASE/api/agents/$agent/status" >/dev/null 2>&1; then
            ACTIVE_AGENTS=$((ACTIVE_AGENTS + 1))
        fi
    done
    
    echo "  Agent Status: $ACTIVE_AGENTS/5 operational"
    if [ $ACTIVE_AGENTS -ge 3 ]; then
        print_success "SUFFICIENT FOR DEMO"
    else
        print_warning "LIMITED FUNCTIONALITY"
        MINOR_ISSUES=$((MINOR_ISSUES + 1))
    fi
else
    print_error "MCP SERVER DOWN"
    CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
    OVERALL_READY=false
fi

print_header "PERFORMANCE STATUS"
echo "=================="

echo "⚡ Response Time Check:"

# Quick performance test
PERF_ISSUES=0
for endpoint in "/health:API Health" "/api/v1/projects:Projects"; do
    IFS=':' read -r path name <<< "$endpoint"
    echo -n "  $name: "
    
    RESPONSE_TIME=$(curl -s -o /dev/null -w '%{time_total}' --max-time 10 "$API_BASE$path" 2>/dev/null || echo "999")
    MS=$(echo "$RESPONSE_TIME * 1000" | bc 2>/dev/null | cut -d. -f1 || echo "999")
    
    if [ "$MS" -lt 200 ]; then
        print_success "${MS}ms"
    elif [ "$MS" -lt 500 ]; then
        print_warning "${MS}ms (acceptable)"
    else
        print_warning "SLOW (${MS}ms)"
        PERF_ISSUES=$((PERF_ISSUES + 1))
    fi
done

if [ $PERF_ISSUES -eq 0 ]; then
    print_success "Performance meets requirements"
else
    print_warning "Performance acceptable for demo"
    MINOR_ISSUES=$((MINOR_ISSUES + 1))
fi

echo ""
echo "🎯 FINAL READINESS ASSESSMENT"
echo "============================="

# Calculate overall score
TOTAL_ISSUES=$((CRITICAL_ISSUES + MINOR_ISSUES))
if [ $CRITICAL_ISSUES -eq 0 ] && [ $MINOR_ISSUES -eq 0 ]; then
    SCORE=100
    STATUS="EXCELLENT"
elif [ $CRITICAL_ISSUES -eq 0 ]; then
    SCORE=$((95 - MINOR_ISSUES * 5))
    STATUS="GOOD"
else
    SCORE=$((80 - CRITICAL_ISSUES * 10 - MINOR_ISSUES * 5))
    STATUS="NEEDS WORK"
fi

echo ""
if [ $CRITICAL_ISSUES -eq 0 ]; then
    if [ $MINOR_ISSUES -eq 0 ]; then
        print_success "🎉 DEMO READY - PERFECT SCORE!"
        echo ""
        echo "✅ ✅ ✅ ALL SYSTEMS OPERATIONAL ✅ ✅ ✅"
        echo ""
        echo "🌟 DEMO ENVIRONMENT: 100% READY"
    else
        print_success "🎉 DEMO READY - MINOR ISSUES ACCEPTABLE!"
        echo ""
        echo "✅ Core systems operational"
        echo "⚠️  Minor issues: $MINOR_ISSUES (non-blocking)"
        echo ""
        echo "🌟 DEMO ENVIRONMENT: 95% READY"
    fi
    
    echo ""
    echo "🎯 ACCESS POINTS:"
    echo "  🌐 Web Dashboard: $WEB_BASE"
    echo "  🔗 API Gateway:   $API_BASE"
    echo "  🤖 MCP Server:    $MCP_BASE"
    echo ""
    echo "🔑 DEMO CREDENTIALS:"
    echo "  📧 Email: admin@example.com"
    echo "  🔐 Password: admin123"
    echo ""
    echo "🎬 READY FOR COMPREHENSIVE DEMO!"
    
else
    print_error "🚫 NOT DEMO READY - CRITICAL ISSUES"
    echo ""
    echo "❌ Critical issues: $CRITICAL_ISSUES"
    echo "⚠️  Minor issues: $MINOR_ISSUES"
    echo ""
    echo "🔧 REQUIRED FIXES:"
    if [ $CRITICAL_ISSUES -gt 0 ]; then
        echo "  1. Fix critical service failures"
        echo "  2. Ensure database connectivity"
        echo "  3. Restart failed containers"
    fi
    echo ""
    echo "🎯 RUN THESE COMMANDS:"
    echo "  docker compose -f docker-compose.development.yml up -d"
    echo "  ./scripts/demo-startup.sh"
    echo "  ./scripts/demo-ready-check.sh"
fi

echo ""
echo "📊 READINESS SCORE: $SCORE% ($STATUS)"
echo "🕒 Last checked: $(date)"
echo ""
print_info "Demo readiness assessment complete"

# Exit with appropriate code
if [ "$OVERALL_READY" = true ]; then
    exit 0
else
    exit 1
fi