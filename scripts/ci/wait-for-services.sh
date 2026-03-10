#!/bin/bash
# Wait for services to be ready
# Validates that web-dashboard, api-gateway, and mcp-server are responding

set -e

# Service configuration: name:port:endpoint
services=(
  "web-dashboard:3000:/"
  "api-gateway:4000:/health"
  "mcp-server:3002:/health"
)

MAX_WAIT=300  # Maximum wait time in seconds (5 minutes for cold starts)
RETRY_DELAY=2  # Delay between retries in seconds
MAX_ATTEMPTS=5  # Maximum retry attempts for each service (increased for reliability)

# Function to check service health
check_service() {
  local name=$1
  local port=$2
  local endpoint=$3
  local attempt=$4
  
  echo "⏳ Waiting for $name on port $port (attempt $attempt/$MAX_ATTEMPTS)..."
  
  ELAPSED=0
  SUCCESS=false
  
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Try to connect to the service
    if curl -f -s -m 5 "http://localhost:$port$endpoint" > /dev/null 2>&1; then
      echo "✅ $name ready (after ${ELAPSED}s)"
      SUCCESS=true
      break
    fi
    
    # Increment elapsed time
    ELAPSED=$((ELAPSED + RETRY_DELAY))
    
    # Show progress every 10 seconds with enhanced diagnostics
    if [ $((ELAPSED % 10)) -eq 0 ]; then
      echo "   Still waiting for $name... (${ELAPSED}s elapsed)"
      
      # Every 30 seconds, show brief container status
      if [ $((ELAPSED % 30)) -eq 0 ]; then
        CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' "ectropy-${name}-test" 2>/dev/null || echo "unknown")
        HEALTH_STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' "ectropy-${name}-test" 2>/dev/null || echo "unknown")
        echo "   Container Status: $CONTAINER_STATUS | Health: $HEALTH_STATUS"
        
        # Show last 5 lines of logs for debugging
        if [ $ELAPSED -ge 60 ]; then
          echo "   Last 5 log lines:"
          docker logs "ectropy-${name}-test" --tail 5 2>&1 | sed 's/^/     /'
        fi
      fi
    fi
    
    sleep $RETRY_DELAY
  done
  
  if [ "$SUCCESS" = false ]; then
    return 1
  fi
  
  return 0
}

# Function to show detailed diagnostics on failure
show_diagnostics() {
  local name=$1
  
  echo ""
  echo "🔍 === Diagnostic Information for $name ==="
  
  # Show container status
  echo "📊 Container Status:"
  docker compose -f docker-compose.test.yml ps "$name" || true
  
  # Show container health
  echo ""
  echo "🏥 Container Health:"
  docker inspect --format='{{.State.Health.Status}}' "ectropy-${name}-test" 2>/dev/null || echo "Health check not available"
  
  # Show last 100 lines of logs
  echo ""
  echo "📋 Last 100 lines of logs:"
  docker compose -f docker-compose.test.yml logs --tail=100 "$name" || true
  
  # Show resource usage
  echo ""
  echo "💻 Resource Usage:"
  docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" "ectropy-${name}-test" 2>/dev/null || echo "Stats not available"
  
  echo "=== End Diagnostic Information ==="
  echo ""
}

# Main service checking loop with retry logic
for service in "${services[@]}"; do
  IFS=':' read -r name port endpoint <<< "$service"
  
  SUCCESS=false
  
  for attempt in $(seq 1 $MAX_ATTEMPTS); do
    if check_service "$name" "$port" "$endpoint" "$attempt"; then
      SUCCESS=true
      break
    fi
    
    if [ $attempt -lt $MAX_ATTEMPTS ]; then
      echo "⚠️  $name failed to respond (attempt $attempt/$MAX_ATTEMPTS)"
      echo "   Waiting 10 seconds before retry..."
      sleep 10
      
      # Check if container is still running
      if ! docker compose -f docker-compose.test.yml ps "$name" | grep -q "Up"; then
        echo "⚠️  Container appears to be stopped or unhealthy, restarting..."
        docker compose -f docker-compose.test.yml restart "$name" || true
        sleep 5
      fi
    fi
  done
  
  if [ "$SUCCESS" = false ]; then
    echo "❌ $name failed to start after $MAX_ATTEMPTS attempts (timeout after ${MAX_WAIT}s per attempt)"
    show_diagnostics "$name"
    exit 1
  fi
done

echo "✅ All services ready"
exit 0
