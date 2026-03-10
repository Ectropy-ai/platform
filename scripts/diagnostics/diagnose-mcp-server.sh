#!/bin/bash

##
# MCP Server Diagnostic Script
#
# Comprehensive diagnostics for MCP server deployment issues
# Usage: Run this script on staging.ectropy.ai server
##

set -e

echo "========================================"
echo "🔍 MCP Server Diagnostics"
echo "========================================"
echo "Server: $(hostname)"
echo "Date: $(date)"
echo "User: $(whoami)"
echo ""

# Detect Docker Compose command
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
  echo "✅ Docker Compose V2 detected"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
  echo "✅ Docker Compose V1 detected"
else
  echo "❌ Docker Compose not found!"
  exit 1
fi

echo ""
echo "========================================"
echo "1. Container Status"
echo "========================================"
echo ""

# Check if ectropy-mcp container exists
if docker ps -a --format "{{.Names}}" | grep -q "ectropy-mcp"; then
  echo "Container ectropy-mcp exists"
  echo ""

  # Get container status
  CONTAINER_STATUS=$(docker ps -a --filter "name=ectropy-mcp" --format "{{.Status}}")
  echo "Status: $CONTAINER_STATUS"
  echo ""

  # Check if running
  if docker ps --format "{{.Names}}" | grep -q "ectropy-mcp"; then
    echo "✅ Container is running"
  else
    echo "❌ Container exists but is NOT running"
    echo ""
    echo "Recent container logs:"
    docker logs --tail 50 ectropy-mcp 2>&1 || echo "Failed to get logs"
  fi
else
  echo "❌ Container ectropy-mcp does NOT exist"
  echo ""
  echo "Checking for any MCP-related containers..."
  docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep mcp || echo "No MCP containers found"
fi

echo ""
echo "========================================"
echo "2. Docker Compose Status"
echo "========================================"
echo ""

cd /var/www/ectropy || cd /opt/ectropy || { echo "❌ Cannot find deployment directory"; exit 1; }

echo "Current directory: $(pwd)"
echo ""

if [ -f "docker-compose.staging.yml" ]; then
  echo "✅ docker-compose.staging.yml found"
  echo ""
  echo "Docker Compose services status:"
  $DOCKER_COMPOSE_CMD -f docker-compose.staging.yml ps
else
  echo "❌ docker-compose.staging.yml not found"
  echo "Available compose files:"
  ls -la docker-compose*.yml 2>/dev/null || echo "No compose files found"
fi

echo ""
echo "========================================"
echo "3. Port Availability"
echo "========================================"
echo ""

echo "Checking if MCP ports are listening..."
for port in 3001 3002; do
  if ss -tlnp | grep -q ":$port "; then
    echo "✅ Port $port is listening"
    ss -tlnp | grep ":$port "
  else
    echo "❌ Port $port is NOT listening"
  fi
done

echo ""
echo "========================================"
echo "4. Network Connectivity"
echo "========================================"
echo ""

echo "Testing internal health check..."
if docker exec ectropy-mcp curl -f -m 5 http://localhost:3001/health 2>/dev/null; then
  echo "✅ Internal health check successful"
else
  echo "❌ Internal health check failed"
  echo ""
  echo "Testing if container has network access..."
  docker exec ectropy-mcp ping -c 2 google.com 2>/dev/null || echo "❌ No external network"
fi

echo ""
echo "Testing health check from host..."
if curl -f -m 5 http://localhost:3001/health 2>/dev/null; then
  echo "✅ Host → MCP health check successful"
else
  echo "❌ Host → MCP health check failed"
fi

echo ""
echo "========================================"
echo "5. Environment Variables"
echo "========================================"
echo ""

if [ -f ".env" ]; then
  echo "✅ .env file exists"
  echo ""
  echo "Checking critical MCP variables (values hidden for security):"
  grep -E "^(MCP_PORT|MCP_API_KEY|DATABASE_URL|REDIS)" .env | sed 's/=.*/=***/' || echo "No MCP variables found"
else
  echo "❌ .env file not found"
fi

echo ""
echo "========================================"
echo "6. Docker Image"
echo "========================================"
echo ""

echo "Checking for ectropy-mcp-server images..."
docker images | grep -E "(ectropy-mcp|mcp-server)" || echo "No MCP images found"

echo ""
echo "========================================"
echo "7. Recent Docker Events"
echo "========================================"
echo ""

echo "Recent events for ectropy-mcp container (last 10)..."
docker events --filter "container=ectropy-mcp" --since 1h --until 0s 2>/dev/null | tail -10 || echo "No recent events"

echo ""
echo "========================================"
echo "8. Dependency Health"
echo "========================================"
echo ""

echo "Checking postgres container..."
if docker ps --format "{{.Names}}" | grep -q "ectropy-postgres"; then
  echo "✅ PostgreSQL container running"
  docker exec ectropy-postgres pg_isready -U postgres 2>/dev/null && echo "  ✅ PostgreSQL ready" || echo "  ❌ PostgreSQL not ready"
else
  echo "❌ PostgreSQL container not running"
fi

echo ""
echo "Checking redis container..."
if docker ps --format "{{.Names}}" | grep -q "ectropy-redis"; then
  echo "✅ Redis container running"
  docker exec ectropy-redis redis-cli ping 2>/dev/null | grep -q "PONG" && echo "  ✅ Redis responding" || echo "  ❌ Redis not responding"
else
  echo "❌ Redis container not running"
fi

echo ""
echo "========================================"
echo "9. Disk Space"
echo "========================================"
echo ""

df -h /var/www/ectropy 2>/dev/null || df -h /opt/ectropy 2>/dev/null || df -h /

echo ""
echo "Docker volume usage..."
docker system df -v | grep -E "(VOLUME NAME|ectropy)" || docker system df

echo ""
echo "========================================"
echo "10. Nginx Configuration"
echo "========================================"
echo ""

if [ -f "/etc/nginx/sites-available/ectropy-staging" ]; then
  echo "✅ Nginx config found"
  echo ""
  echo "MCP-related proxy rules:"
  grep -E "(location.*/health|location.*/api/mcp|location.*/api/tools)" /etc/nginx/sites-available/ectropy-staging | head -10
else
  echo "❌ Nginx config not found at expected location"
fi

echo ""
echo "Testing nginx routing to MCP..."
if curl -f -m 5 http://localhost/health 2>/dev/null; then
  echo "✅ Nginx → MCP /health routing works"
else
  echo "❌ Nginx → MCP /health routing failed"
fi

echo ""
echo "========================================"
echo "📋 Diagnostic Summary"
echo "========================================"
echo ""

# Generate summary
CONTAINER_RUNNING=$(docker ps --format "{{.Names}}" | grep -q "ectropy-mcp" && echo "YES" || echo "NO")
PORT_3001=$(ss -tlnp | grep -q ":3001 " && echo "LISTENING" || echo "NOT LISTENING")
PORT_3002=$(ss -tlnp | grep -q ":3002 " && echo "LISTENING" || echo "NOT LISTENING")

echo "Container Running: $CONTAINER_RUNNING"
echo "Port 3001: $PORT_3001"
echo "Port 3002: $PORT_3002"

echo ""
echo "========================================"
echo "🔧 Recommended Actions"
echo "========================================"
echo ""

if [ "$CONTAINER_RUNNING" = "NO" ]; then
  echo "❌ MCP container is not running"
  echo ""
  echo "Try these steps:"
  echo "1. Check container logs: docker logs ectropy-mcp --tail 100"
  echo "2. Restart container: cd /var/www/ectropy && $DOCKER_COMPOSE_CMD -f docker-compose.staging.yml up -d ectropy-mcp"
  echo "3. If restart fails, check .env file and rebuild: $DOCKER_COMPOSE_CMD -f docker-compose.staging.yml up -d --force-recreate ectropy-mcp"
  echo ""
elif [ "$PORT_3001" = "NOT LISTENING" ]; then
  echo "❌ Container running but port 3001 not listening"
  echo ""
  echo "Check if MCP server started successfully:"
  echo "1. docker logs ectropy-mcp --tail 100"
  echo "2. docker exec ectropy-mcp ps aux"
  echo "3. Check if health check is failing: docker inspect ectropy-mcp | grep -A 10 Health"
else
  echo "✅ MCP container appears healthy"
  echo ""
  echo "If you're still experiencing issues:"
  echo "1. Check Nginx is routing correctly: nginx -t && systemctl restart nginx"
  echo "2. Test external access: curl https://staging.ectropy.ai/health"
  echo "3. Check firewall rules: ufw status"
fi

echo ""
echo "========================================"
echo "✅ Diagnostics Complete"
echo "========================================"
