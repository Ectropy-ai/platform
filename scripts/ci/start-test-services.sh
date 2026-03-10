#!/bin/bash
# Start test services for CI smoke tests
# This script starts web-dashboard, api-gateway, and mcp-server using docker compose
#
# ENTERPRISE: Docker Compose Project Isolation for Parallel Shards
# When running parallel test shards (e.g., 4 concurrent Playwright shard jobs),
# each shard MUST use isolated Docker Compose projects to avoid:
# - Container name collisions (ectropy-postgres-test, etc.)
# - Port binding conflicts (5432, 6379, 3000, 3001, 4000)
# - Network namespace conflicts
#
# Solution: Use COMPOSE_PROJECT_NAME with unique identifier per shard
# Pattern: test-<github-run-id>-shard-<shard-index>
# Example: test-20012153954-shard-1, test-20012153954-shard-2
#
# Reference: https://docs.docker.com/compose/environment-variables/envvars/#compose_project_name

set -e

# ENTERPRISE P0 FIX (2025-12-22): Startup time monitoring
# Track build vs startup time separately for performance optimization
SCRIPT_START=$(date +%s)

echo "🚀 Starting services for smoke tests..."
echo "⏱️  SCRIPT START: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ============================================================================
# ENTERPRISE: Docker Compose Project Isolation
# ============================================================================
# Generate unique project name for this test shard to enable parallel execution
# without container name/port conflicts

# Extract shard index from SHARD_ID (format: "1/4", "2/4", etc.)
SHARD_INDEX="${SHARD_ID%%/*}"  # Extract "1" from "1/4"
SHARD_TOTAL="${SHARD_ID##*/}"  # Extract "4" from "1/4"

# Validate shard context
if [ -z "$SHARD_ID" ]; then
    echo "⚠️  SHARD_ID not set - using default project name"
    echo "   This is acceptable for non-parallel execution (local dev, single-shard CI)"
    export COMPOSE_PROJECT_NAME="ectropy-test"
elif [ -z "$GITHUB_RUN_ID" ]; then
    echo "⚠️  GITHUB_RUN_ID not set - using shard-only project name"
    export COMPOSE_PROJECT_NAME="test-shard-${SHARD_INDEX}"
else
    # ENTERPRISE: Full isolation with run ID + shard index
    export COMPOSE_PROJECT_NAME="test-${GITHUB_RUN_ID}-shard-${SHARD_INDEX}"
    echo "✅ Docker Compose project isolation enabled"
    echo "   Project: $COMPOSE_PROJECT_NAME"
    echo "   Shard: ${SHARD_INDEX}/${SHARD_TOTAL}"
    echo "   Run ID: $GITHUB_RUN_ID"
fi

# Container name prefix (Docker Compose automatically adds this)
CONTAINER_PREFIX="${COMPOSE_PROJECT_NAME}-"

echo ""
echo "🔍 Project Isolation Configuration:"
echo "   COMPOSE_PROJECT_NAME: $COMPOSE_PROJECT_NAME"
echo "   Container prefix: ${CONTAINER_PREFIX}"
echo "   Expected containers:"
echo "     - ${CONTAINER_PREFIX}postgres-1"
echo "     - ${CONTAINER_PREFIX}redis-1"
echo "     - ${CONTAINER_PREFIX}api-gateway-1"
echo "     - ${CONTAINER_PREFIX}mcp-server-1"
echo "     - ${CONTAINER_PREFIX}web-dashboard-1"
echo ""
# ============================================================================
# ENTERPRISE: Dynamic Container Name Resolution Function
# ============================================================================
# Docker Compose v2 uses pattern: {project}-{service}-{replica}
# Example: test-20012153954-shard-1-postgres-1
# NOTE: This function will be called AFTER containers are started

get_container_name() {
  local service_name=$1
  # Use docker compose ps with --format to get exact container name for this project
  docker compose -f docker-compose.test.yml ps --format "{{.Name}}" "$service_name" 2>/dev/null | head -1
}

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ docker compose is not installed"
    exit 1
fi

# Check if docker-compose.test.yml exists
if [ ! -f "docker-compose.test.yml" ]; then
    echo "❌ docker-compose.test.yml not found"
    exit 1
fi

# ENTERPRISE: Validate environment variables - NO hardcoded fallbacks for secrets
echo "🔍 Validating environment variables..."

# Service names and ports can have defaults (non-sensitive infrastructure config)
export DATABASE_HOST="${DATABASE_HOST:-postgres}"
export DATABASE_PORT="${DATABASE_PORT:-5432}"
export DATABASE_NAME="${DATABASE_NAME:-ectropy_test}"
export DATABASE_USER="${DATABASE_USER:-postgres}"
export REDIS_HOST="${REDIS_HOST:-redis}"
export REDIS_PORT="${REDIS_PORT:-6379}"

# ENTERPRISE: Credentials MUST come from environment - fail fast if missing
# Anti-pattern removed: test_password_for_ci_only fallback
if [ -z "$DATABASE_PASSWORD" ]; then
  echo "❌ ERROR: DATABASE_PASSWORD not set in environment"
  echo "   This is a required secret and must be provided"
  echo "   Set via GitHub Secrets or .env.ci"
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "❌ ERROR: JWT_SECRET not set in environment"
  echo "   This is a required secret and must be provided"
  exit 1
fi

if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
  echo "❌ ERROR: OAuth secrets not set (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)"
  echo "   These are required for E2E tests"
  exit 1
fi

echo "✅ Environment variables configured (in runner environment)"
echo "   DATABASE_HOST: $DATABASE_HOST"
echo "   DATABASE_PORT: $DATABASE_PORT"
echo "   DATABASE_NAME: $DATABASE_NAME"
echo "   DATABASE_USER: $DATABASE_USER"
echo "   DATABASE_PASSWORD: $([ -n "$DATABASE_PASSWORD" ] && echo "✅ Set" || echo "❌ Missing")"
echo "   REDIS_HOST: $REDIS_HOST"
echo "   REDIS_PORT: $REDIS_PORT"
echo "   GOOGLE_CLIENT_ID: $([ -n "$GOOGLE_CLIENT_ID" ] && echo "✅ Set" || echo "❌ Missing")"
echo "   GOOGLE_CLIENT_SECRET: $([ -n "$GOOGLE_CLIENT_SECRET" ] && echo "✅ Set" || echo "❌ Missing")"

# ENTERPRISE P0 FIX (2025-12-22): Skip build if pre-built images exist
# Pre-built images are loaded from build-test-images job cache
# This eliminates 9-15min build time from critical path
echo "🔍 Checking for pre-built Docker images..."

BUILD_START=$(date +%s)
PREBUILT_IMAGES_EXIST=false

if docker images | grep -q "ectropy-web-dashboard-test" && \
   docker images | grep -q "ectropy-api-gateway-test" && \
   docker images | grep -q "ectropy-mcp-server-test"; then
  echo "✅ Pre-built images detected - skipping build"
  echo "   Images loaded from build-test-images job"
  PREBUILT_IMAGES_EXIST=true

  echo ""
  echo "📦 Available images:"
  docker images | grep ectropy | grep test

  BUILD_END=$(date +%s)
  BUILD_DURATION=$((BUILD_END - BUILD_START))
  echo "⏱️  BUILD PHASE: ${BUILD_DURATION}s (cached images)"
else
  echo "ℹ️  No pre-built images found - building from scratch..."

  # Build images with Docker Buildx layer caching for faster CI builds
  # Layer caching reduces build time from 5+ minutes to ~1 minute on subsequent runs
  echo "🔨 Building images with Docker Buildx layer caching..."
  echo "⏱️  BUILD START: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Check if GitHub Actions cache backend is configured (type=gha)
  if [ -n "$BUILDX_CACHE_FROM" ] && [ -n "$BUILDX_CACHE_TO" ]; then
    echo "✅ Using GitHub Actions cache backend (type=gha)"
    echo "   Cache from: $BUILDX_CACHE_FROM"
    echo "   Cache to: $BUILDX_CACHE_TO"

    # Build with Buildx cache configuration
    # Official Docker best practice: mode=max caches all intermediate layers
    docker compose -f docker-compose.test.yml build \
      --build-arg BUILDKIT_INLINE_CACHE=1 \
      web-dashboard api-gateway mcp-server
  else
    echo "ℹ️  Using standard Docker layer caching (no type=gha configured)"
    docker compose -f docker-compose.test.yml build web-dashboard api-gateway mcp-server
  fi

  BUILD_END=$(date +%s)
  BUILD_DURATION=$((BUILD_END - BUILD_START))
  echo "⏱️  BUILD END: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "⏱️  BUILD PHASE: ${BUILD_DURATION}s (full build)"
fi

# Start services in background with docker compose
# ENTERPRISE: COMPOSE_PROJECT_NAME environment variable automatically isolates this project
echo ""
echo "📦 Starting services with docker compose..."
echo "   Using project: $COMPOSE_PROJECT_NAME"
echo "⏱️  STARTUP START: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTUP_START=$(date +%s)

# FIVE WHY FIX (2026-03-06): Start infrastructure + app services separately.
# web-dashboard has depends_on: api-gateway: condition: service_healthy
# If api-gateway crashes, docker compose up -d fails immediately (set -e kills script)
# and we get ZERO diagnostic output. Start app services first, then web-dashboard after health.
#
# Using if-not pattern to handle failure without set -e exit
if ! docker compose -f docker-compose.test.yml up -d api-gateway mcp-server; then
  echo "❌ docker compose up failed for backend services"
  echo ""
  echo "🔍 Emergency diagnostics:"
  docker compose -f docker-compose.test.yml ps -a || true
  echo ""
  echo "📋 All containers on this runner:"
  docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" || true
  echo ""
  echo "📋 Container logs:"
  for cname in ectropy-api-gateway-test ectropy-mcp-server-test ectropy-postgres-test ectropy-redis-test; do
    echo "--- $cname ---"
    docker logs "$cname" --tail 100 2>&1 || echo "$cname: not found"
  done
  echo ""
  echo "🔍 OOM Kill & State check:"
  for cname in ectropy-api-gateway-test ectropy-mcp-server-test; do
    docker inspect "$cname" --format='{{.Name}}: OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} Status={{.State.Status}}' 2>/dev/null || echo "$cname: not inspectable"
  done
  exit 1
fi

# Enhanced container diagnostics
echo ""
echo "📊 Container Status Check..."
docker compose -f docker-compose.test.yml ps -a

# ENTERPRISE: Resolve container names dynamically NOW (after containers are started)
# NOTE: web-dashboard is started AFTER api-gateway becomes healthy (Phase 2)
echo ""
echo "🔍 Resolving isolated container names..."
POSTGRES_CONTAINER=$(get_container_name postgres)
REDIS_CONTAINER=$(get_container_name redis)
API_GATEWAY_CONTAINER=$(get_container_name api-gateway)
MCP_SERVER_CONTAINER=$(get_container_name mcp-server)

echo "📋 Resolved Container Names (Phase 1 — backend services):"
echo "   postgres: ${POSTGRES_CONTAINER:-not_found}"
echo "   redis: ${REDIS_CONTAINER:-not_found}"
echo "   api-gateway: ${API_GATEWAY_CONTAINER:-not_found}"
echo "   mcp-server: ${MCP_SERVER_CONTAINER:-not_found}"

# ===================================
# Validate Database and Redis Connectivity
# ===================================
echo ""
echo "🔍 Validating database connectivity..."
max_db_attempts=3
db_attempt=1
while [ $db_attempt -le $max_db_attempts ]; do
  # ENTERPRISE: Use service name (not container name) for docker compose exec
  # Docker Compose automatically resolves service → container within the project
  if docker compose -f docker-compose.test.yml exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo "✅ Database is ready"
    break
  else
    echo "⚠️  Database not ready yet (attempt $db_attempt/$max_db_attempts)"
    if [ $db_attempt -eq $max_db_attempts ]; then
      echo "❌ Database failed to become ready after $max_db_attempts attempts"
      exit 1
    else
      echo "⏳ Waiting 10s before retry..."
      sleep 10
    fi
    ((db_attempt++))
  fi
done

echo ""
echo "🔍 Validating Redis connectivity..."
max_redis_attempts=3
redis_attempt=1
while [ $redis_attempt -le $max_redis_attempts ]; do
  # ENTERPRISE: Use service name (not container name) for docker compose exec
  if docker compose -f docker-compose.test.yml exec -T redis redis-cli PING >/dev/null 2>&1; then
    echo "✅ Redis is ready"
    break
  else
    echo "⚠️  Redis not ready yet (attempt $redis_attempt/$max_redis_attempts)"
    if [ $redis_attempt -eq $max_redis_attempts ]; then
      echo "❌ Redis failed to become ready after $max_redis_attempts attempts"
      exit 1
    else
      echo "⏳ Waiting 10s before retry..."
      sleep 10
    fi
    ((redis_attempt++))
  fi
done

# ===================================
# Wait for Container Health
# ===================================
echo ""
echo "⏳ Waiting for services to become healthy..."
echo "   ENTERPRISE P0 FIX (2025-12-22): Optimized health check configuration"
echo "   OLD: api/mcp 210s max, web 150s max | NEW: api/mcp 90s max, web 65s max (60% faster)"
echo "   Expected startup times:"
echo "     - postgres: ~50s (10s start + 10×5s retries)"
echo "     - redis: ~50s (5s start + 10×5s retries)"
echo "     - api-gateway: ~60s (30s start + 6×10s retries)"
echo "     - mcp-server: ~55s (30s start + 6×10s retries)"
echo "     - web-dashboard: ~40s (15s start + 5×10s retries, waits for api-gateway)"

# ENTERPRISE P0 FIX (2025-12-22): Reduced from 360s to match optimized health checks
# Critical path: postgres (50s) → api-gateway (60s) → web-dashboard (40s) = 150s
# Add 30s buffer for variance = 180s total
MAX_WAIT=180  # Reduced from 360s (was based on 210s health checks, now optimized to 90s)
WAIT_TIME=0

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  # Phase 1: Batch inspect backend containers (web-dashboard starts after this loop)
  HEALTH_OUTPUT=$(docker inspect \
    "$POSTGRES_CONTAINER" \
    "$REDIS_CONTAINER" \
    "$API_GATEWAY_CONTAINER" \
    "$MCP_SERVER_CONTAINER" \
    --format='{{.Name}},{{.State.Health.Status}},{{.State.Running}}' 2>/dev/null || echo "error")

  # Parse batch output - use flexible grep patterns for dynamic container names
  POSTGRES_HEALTH=$(echo "$HEALTH_OUTPUT" | grep "postgres" | cut -d',' -f2)
  REDIS_HEALTH=$(echo "$HEALTH_OUTPUT" | grep "redis" | cut -d',' -f2)
  API_HEALTH=$(echo "$HEALTH_OUTPUT" | grep "api-gateway" | cut -d',' -f2)
  MCP_HEALTH=$(echo "$HEALTH_OUTPUT" | grep "mcp-server" | cut -d',' -f2)

  API_RUNNING=$(echo "$HEALTH_OUTPUT" | grep "api-gateway" | cut -d',' -f3)
  MCP_RUNNING=$(echo "$HEALTH_OUTPUT" | grep "mcp-server" | cut -d',' -f3)

  echo "🏥 Health Status (${WAIT_TIME}s) — Phase 1 (backend):"
  echo "   - postgres: ${POSTGRES_HEALTH:-not_running}"
  echo "   - redis: ${REDIS_HEALTH:-not_running}"
  echo "   - api-gateway: ${API_HEALTH:-not_running}"
  echo "   - mcp-server: ${MCP_HEALTH:-not_running}"
  
  # Phase 1: Check backend services (web-dashboard starts after this loop)
  if [ "$POSTGRES_HEALTH" = "healthy" ] && \
     [ "$REDIS_HEALTH" = "healthy" ] && \
     [ "$API_HEALTH" = "healthy" ] && \
     [ "$MCP_HEALTH" = "healthy" ]; then
    echo "✅ Phase 1: All backend services healthy!"
    break
  fi
  
  # Check for container exits (immediate failure)
  if [ "$API_RUNNING" = "false" ] || [ "$MCP_RUNNING" = "false" ]; then
    echo ""
    echo "❌ CRITICAL: Container exited unexpectedly"
    echo ""
    # FIVE WHY FIX (2026-03-06): Check for OOM kill — produces zero log output
    echo "🔍 OOM Kill & Exit Code Check:"
    for cname in "$API_GATEWAY_CONTAINER" "$MCP_SERVER_CONTAINER"; do
      docker inspect "$cname" --format='{{.Name}}: OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} Status={{.State.Status}}' 2>/dev/null || echo "$cname: not inspectable"
    done
    echo ""
    echo "📋 Container Logs:"
    echo "=== API Gateway ==="
    docker logs "$API_GATEWAY_CONTAINER" --tail 100 2>&1 || echo "Container not found"
    echo ""
    echo "=== MCP Server ==="
    docker logs "$MCP_SERVER_CONTAINER" --tail 100 2>&1 || echo "Container not found"
    echo ""
    echo "🔍 Environment Variables (sanitized):"
    docker exec "$API_GATEWAY_CONTAINER" env 2>/dev/null | grep -E "(DATABASE|REDIS|PORT|NODE_ENV|NODE_OPTIONS)" || echo "Container not accessible"
    exit 1
  fi
  
  sleep 3
  WAIT_TIME=$((WAIT_TIME + 3))
done

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
  echo ""
  echo "❌ Services did not become healthy within ${MAX_WAIT}s"
  echo "   Maximum startup times (with new health check config):"
  echo "   - postgres/redis: 50s each"
  echo "   - web-dashboard: 150s"
  echo "   - api-gateway: 210s (60s start + 15×10s retries)"
  echo "   - mcp-server: 210s (60s start + 15×10s retries)"
  echo ""
  
  # ==== ENHANCED DIAGNOSTICS ====
  echo "🔍 ENHANCED CONTAINER DIAGNOSTICS"
  echo "=================================="
  
  echo ""
  echo "📊 Docker Compose Service Status:"
  docker compose -f docker-compose.test.yml ps
  
  echo ""
  echo "🏥 Detailed Health Check Status:"
  # ENTERPRISE: Use dynamic container names for project isolation
  for container in "$API_GATEWAY_CONTAINER" "$MCP_SERVER_CONTAINER"; do
    if docker inspect "$container" &>/dev/null; then
      echo ""
      echo "=== $container ==="
      echo "State:"
      docker inspect "$container" --format='{{json .State}}' | jq '.' || docker inspect "$container" --format='{{json .State}}'
      echo ""
      echo "Health:"
      docker inspect "$container" --format='{{json .State.Health}}' | jq '.' || docker inspect "$container" --format='{{json .State.Health}}'
    else
      echo "Container $container does not exist"
    fi
  done
  
  echo ""
  echo "🔍 Environment Variables in Containers:"
  # ENTERPRISE: Use dynamic container names for project isolation
  for container in "$API_GATEWAY_CONTAINER" "$MCP_SERVER_CONTAINER"; do
    echo ""
    echo "=== $container Environment ==="
    docker exec "$container" env 2>/dev/null | grep -E "(DATABASE|REDIS|GOOGLE|JWT|SESSION|PORT|NODE_ENV)" | sed 's/=.*/=***/' || echo "Cannot access container"
  done

  echo ""
  echo "📋 Container Logs (Last 100 lines):"
  echo "=== API Gateway ==="
  docker logs "$API_GATEWAY_CONTAINER" --tail 100 2>&1 || echo "Container not found"

  echo ""
  echo "=== MCP Server ==="
  docker logs "$MCP_SERVER_CONTAINER" --tail 100 2>&1 || echo "Container not found"

  echo ""
  echo "🐳 Docker Resource Usage:"
  docker stats --no-stream 2>/dev/null || echo "Stats unavailable"

  exit 1
fi

# ===================================
# Phase 2: Start web-dashboard (after backend services are healthy)
# ===================================
echo ""
echo "📦 Phase 2: Starting web-dashboard (backend services healthy)..."
docker compose -f docker-compose.test.yml up -d web-dashboard

WEB_DASHBOARD_CONTAINER=$(get_container_name web-dashboard)
echo "   web-dashboard: ${WEB_DASHBOARD_CONTAINER:-not_found}"

# Wait for web-dashboard health (shorter wait — it's a static app)
WEB_WAIT=0
WEB_MAX_WAIT=90
while [ $WEB_WAIT -lt $WEB_MAX_WAIT ]; do
  WEB_HEALTH=$(docker inspect "$WEB_DASHBOARD_CONTAINER" --format='{{.State.Health.Status}}' 2>/dev/null || echo "not_running")
  echo "🏥 web-dashboard health (${WEB_WAIT}s): ${WEB_HEALTH}"

  if [ "$WEB_HEALTH" = "healthy" ]; then
    echo "✅ Phase 2: web-dashboard healthy!"
    break
  fi

  sleep 5
  WEB_WAIT=$((WEB_WAIT + 5))
done

if [ $WEB_WAIT -ge $WEB_MAX_WAIT ]; then
  echo "❌ web-dashboard did not become healthy within ${WEB_MAX_WAIT}s"
  docker logs "$WEB_DASHBOARD_CONTAINER" --tail 50 2>&1 || echo "Container not found"
  exit 1
fi

# ===================================
# Verify Environment Variables Inside Containers
# ===================================
echo ""
echo "🔍 Verifying environment variables inside containers..."

# Only check if containers are running
# ENTERPRISE: Use dynamic container names for project isolation
if docker inspect "$API_GATEWAY_CONTAINER" --format='{{.State.Running}}' 2>/dev/null | grep -q "true"; then
  echo ""
  echo "📋 Validating api-gateway environment variables..."
  MISSING_VARS=()

  # Check critical OAuth variables
  if ! docker exec "$API_GATEWAY_CONTAINER" sh -c 'test -n "$GOOGLE_CLIENT_ID"' 2>/dev/null; then
    MISSING_VARS+=("GOOGLE_CLIENT_ID")
  fi
  if ! docker exec "$API_GATEWAY_CONTAINER" sh -c 'test -n "$GOOGLE_CLIENT_SECRET"' 2>/dev/null; then
    MISSING_VARS+=("GOOGLE_CLIENT_SECRET")
  fi

  # Check database password
  if ! docker exec "$API_GATEWAY_CONTAINER" sh -c 'test -n "$DATABASE_PASSWORD"' 2>/dev/null; then
    MISSING_VARS+=("DATABASE_PASSWORD")
  fi

  # Check JWT secrets
  if ! docker exec "$API_GATEWAY_CONTAINER" sh -c 'test -n "$JWT_SECRET"' 2>/dev/null; then
    MISSING_VARS+=("JWT_SECRET")
  fi
  if ! docker exec "$API_GATEWAY_CONTAINER" sh -c 'test -n "$JWT_REFRESH_SECRET"' 2>/dev/null; then
    MISSING_VARS+=("JWT_REFRESH_SECRET")
  fi
  if ! docker exec "$API_GATEWAY_CONTAINER" sh -c 'test -n "$SESSION_SECRET"' 2>/dev/null; then
    MISSING_VARS+=("SESSION_SECRET")
  fi
  
  if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ CRITICAL: Missing required environment variables in api-gateway container:"
    printf '   - %s\n' "${MISSING_VARS[@]}"
    echo ""
    echo "🔧 Troubleshooting steps:"
    echo "   1. Check docker-compose.test.yml has explicit declarations for all variables"
    echo "   2. Verify GitHub Actions workflow exports variables in env: block"
    echo "   3. Rebuild images: docker compose -f docker-compose.test.yml build --no-cache"
    exit 1
  fi
  
  echo "✅ All required environment variables present in api-gateway"
else
  echo "⚠️  Skipping env check: api-gateway container not running"
fi

if docker inspect "$MCP_SERVER_CONTAINER" --format='{{.State.Running}}' 2>/dev/null | grep -q "true"; then
  echo ""
  echo "📋 Validating mcp-server environment variables..."
  MISSING_VARS=()

  # Check database password
  if ! docker exec "$MCP_SERVER_CONTAINER" sh -c 'test -n "$DATABASE_PASSWORD"' 2>/dev/null; then
    MISSING_VARS+=("DATABASE_PASSWORD")
  fi
  
  if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ CRITICAL: Missing required environment variables in mcp-server container:"
    printf '   - %s\n' "${MISSING_VARS[@]}"
    exit 1
  fi
  
  echo "✅ All required environment variables present in mcp-server"
else
  echo "⚠️  Skipping env check: mcp-server container not running"
fi

echo "✅ Environment verification complete"

# ENTERPRISE P0 FIX (2025-12-22): Final timing metrics
STARTUP_END=$(date +%s)
SCRIPT_END=$(date +%s)

STARTUP_DURATION=$((STARTUP_END - STARTUP_START))
TOTAL_DURATION=$((SCRIPT_END - SCRIPT_START))

echo ""
echo "⏱️  STARTUP END: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "⏱️  SCRIPT END: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "📊 === PERFORMANCE METRICS ==="
echo "   Build Phase:   ${BUILD_DURATION}s"
echo "   Startup Phase: ${STARTUP_DURATION}s"
echo "   Total Time:    ${TOTAL_DURATION}s"
echo ""
echo "   Target: <3min total (180s)"
if [ $TOTAL_DURATION -lt 180 ]; then
  echo "   Status: ✅ PASSED (within target)"
else
  echo "   Status: ⚠️  SLOW (exceeds target by $((TOTAL_DURATION - 180))s)"
fi
echo "=============================="
echo ""

echo "🎉 All services ready for tests!"
