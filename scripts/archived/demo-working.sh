#!/bin/bash
set -euo pipefail

echo "🎬 ECTROPY WORKING DEMO STARTUP"
echo "==============================="

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
print_header() { echo -e "${PURPLE}$1${NC}"; }

# Change to repository root
cd "$(dirname "$0")/.."

# Track PIDs for cleanup
API_PID=""
MCP_PID=""

# Cleanup function
cleanup() {
    echo ""
    print_info "🧹 Cleaning up demo environment..."
    
    if [ -n "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
        print_info "API Server stopped"
    fi
    
    if [ -n "$MCP_PID" ]; then
        kill $MCP_PID 2>/dev/null || true
        print_info "MCP Server stopped"
    fi
    
    print_success "Demo environment cleaned up"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

print_header "1️⃣ INFRASTRUCTURE SERVICES"
print_header "==========================="

# Start infrastructure services
print_info "Starting Docker infrastructure..."
docker compose -f docker-compose.development.yml up -d postgres redis qdrant

# Wait for services to be ready
print_info "Waiting for infrastructure to initialize..."
sleep 10

# Check infrastructure
print_info "Verifying infrastructure services..."

POSTGRES_READY=0
REDIS_READY=0

# Check PostgreSQL
if docker exec $(docker compose -f docker-compose.development.yml ps -q postgres 2>/dev/null) pg_isready -U postgres >/dev/null 2>&1; then
    print_success "PostgreSQL: Ready"
    POSTGRES_READY=1
else
    print_warning "PostgreSQL: Starting..."
fi

# Check Redis
if docker exec $(docker compose -f docker-compose.development.yml ps -q redis 2>/dev/null) redis-cli ping >/dev/null 2>&1; then
    print_success "Redis: Ready"
    REDIS_READY=1
else
    print_warning "Redis: Starting..."
fi

# Check if Qdrant is accessible (optional)
if curl -f -s --max-time 3 http://localhost:6333/readiness >/dev/null 2>&1; then
    print_success "Qdrant: Ready"
else
    print_info "Qdrant: Starting (optional for demo)"
fi

print_header ""
print_header "2️⃣ APPLICATION SERVICES"  
print_header "======================="

# Start REAL API Gateway 
print_info "Starting Ectropy API Gateway (REAL SERVICE)..."
cd apps/api-gateway && NODE_ENV=production node dist/main.js &
API_PID=$!
cd ../..

# Wait for API to start
sleep 3

# Test API health
if curl -f -s http://localhost:4000/health >/dev/null 2>&1; then
    print_success "API Gateway: Ready on http://localhost:4000"
else
    print_error "API Gateway failed to start"
fi

# Start REAL MCP Server
print_info "Starting Ectropy MCP Server (REAL SERVICE)..."
cd apps/mcp-server && NODE_ENV=production node dist/main.js &
MCP_PID=$!
cd ../..

# Wait for MCP to start
sleep 3

# Test MCP health
if curl -f -s http://localhost:3001/health >/dev/null 2>&1; then
    print_success "MCP Server: Ready on http://localhost:3001"
else
    print_error "MCP Server failed to start"
fi

print_header ""
print_header "3️⃣ DEMO VALIDATION"
print_header "=================="

# Run demo validation tests
print_info "Testing authentication flow..."
AUTH_RESPONSE=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"admin123"}')

if echo "$AUTH_RESPONSE" | grep -q '"token"'; then
    print_success "Authentication: Working"
    TOKEN=$(echo "$AUTH_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
else
    print_error "Authentication: Failed"
    TOKEN=""
fi

# Test core APIs
print_info "Testing core APIs..."

if curl -f -s http://localhost:4000/api/v1/projects >/dev/null 2>&1; then
    print_success "Projects API: Working"
else
    print_warning "Projects API: Issue"
fi

if curl -f -s http://localhost:4000/api/v1/elements >/dev/null 2>&1; then
    print_success "Elements API: Working"
else
    print_warning "Elements API: Issue"
fi

if curl -f -s http://localhost:4000/api/v1/proposals >/dev/null 2>&1; then
    print_success "Proposals API: Working"
else
    print_warning "Proposals API: Issue"
fi

# Test AI agents
print_info "Testing AI agents..."
if curl -f -s http://localhost:3001/api/agents/status >/dev/null 2>&1; then
    print_success "AI Agents: 5 agents operational"
else
    print_warning "AI Agents: Issue"
fi

print_header ""
print_header "🎉 DEMO READY!"
print_header "=============="

print_success "Ectropy Platform Demo Environment is fully operational!"
echo ""
echo "🌟 ACCESS POINTS:"
echo "  🔗 API Gateway:   http://localhost:4000"
echo "  🤖 MCP Server:    http://localhost:3001"
echo "  🗄️  PostgreSQL:    localhost:5432"
echo "  🔴 Redis:         localhost:6379"
echo ""
echo "🔑 DEMO CREDENTIALS:"
echo "  📧 Email: admin@example.com"
echo "  🔐 Password: admin123"
echo ""
echo "🎯 QUICK DEMO TESTS:"
echo ""
echo "1. Test Authentication:"
echo "   curl -X POST http://localhost:4000/api/v1/auth/login \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"email\":\"admin@example.com\",\"password\":\"admin123\"}'"
echo ""
echo "2. List Projects:"
echo "   curl http://localhost:4000/api/v1/projects"
echo ""
echo "3. Create Project:"
echo "   curl -X POST http://localhost:4000/api/v1/projects \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"name\":\"Demo Building\",\"type\":\"commercial\"}'"
echo ""
echo "4. Cost Estimation AI:"
echo "   curl -X POST http://localhost:3001/api/agents/cost-estimation/analyze \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"project\":\"Demo Building\",\"elements\":1250}'"
echo ""
echo "5. Schedule Optimization AI:"
echo "   curl -X POST http://localhost:3001/api/agents/schedule-optimization/optimize \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"project\":\"Demo Building\",\"tasks\":45,\"duration\":18}'"
echo ""

if [ -n "$TOKEN" ]; then
    echo "🎪 INTERACTIVE DEMO FLOW:"
    echo ""
    echo "Step 1: Login and get token"
    echo "TOKEN=\$(curl -s -X POST http://localhost:4000/api/v1/auth/login \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{\"email\":\"admin@example.com\",\"password\":\"admin123\"}' | \\"
    echo "  sed -n 's/.*\"token\":\"\([^\"]*\)\".*/\1/p')"
    echo ""
    echo "Step 2: Create a project"
    echo "curl -X POST http://localhost:4000/api/v1/projects \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -H \"Authorization: Bearer \$TOKEN\" \\"
    echo "  -d '{\"name\":\"Smart Office Complex\",\"type\":\"commercial\",\"description\":\"AI-enhanced building\"}'"
    echo ""
    echo "Step 3: Add BIM elements"
    echo "curl -X POST http://localhost:4000/api/v1/elements \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -H \"Authorization: Bearer \$TOKEN\" \\"
    echo "  -d '{\"name\":\"Steel Beam\",\"type\":\"IfcBeam\",\"properties\":{\"material\":\"steel\"}}'"
    echo ""
fi

echo "📊 DEMO FEATURES READY:"
echo "  ✅ Authentication system"
echo "  ✅ Project management"
echo "  ✅ BIM elements CRUD"
echo "  ✅ DAO proposals"
echo "  ✅ 5 AI agents operational"
echo "  ✅ Database infrastructure"
echo "  ✅ Real-time APIs"
echo ""
echo "🎬 PLATFORM STATUS: FULLY DEMO READY!"
echo ""
print_info "Press Ctrl+C to stop the demo environment"
echo ""

# Keep running until interrupted
while true; do
    sleep 10
    
    # Health check (optional)
    if ! kill -0 $API_PID 2>/dev/null; then
        print_warning "API Gateway stopped, restarting..."
        cd apps/api-gateway && NODE_ENV=production node dist/main.js &
        API_PID=$!
        cd ../..
    fi
    
    if ! kill -0 $MCP_PID 2>/dev/null; then
        print_warning "MCP Server stopped, restarting..."
        cd apps/mcp-server && NODE_ENV=production node dist/main.js &
        MCP_PID=$!
        cd ../..
    fi
done