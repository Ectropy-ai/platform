#!/bin/bash
set -euo pipefail

echo "🏥 Enterprise Service Health Check v2.0"
echo "======================================="

# Function to log with timestamp
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check service health with robust jq parsing
check_service() {
  local service=$1
  local timeout=${2:-30}
  
  log "🔍 Checking $service health..."
  
  # Try to get service info with timeout
  local output
  if ! output=$(timeout "$timeout" docker compose ps "$service" --format json 2>/dev/null); then
    echo "unknown"
    return 1
  fi
  
  # Handle empty output
  if [ -z "$output" ]; then
    echo "not_found"
    return 1
  fi
  
  # Robust JSON parsing - handle both array and object formats
  local state
  if command -v jq >/dev/null 2>&1; then
    # Try to determine if it's an array or object
    if echo "$output" | jq -e 'type == "array"' >/dev/null 2>&1; then
      # Array format - get first element
      state=$(echo "$output" | jq -r '.[0].State // "unknown"' 2>/dev/null || echo "unknown")
    else
      # Object format - get State directly
      state=$(echo "$output" | jq -r '.State // "unknown"' 2>/dev/null || echo "unknown")
    fi
  else
    # Fallback without jq - use grep and sed
    if echo "$output" | grep -q '"State"'; then
      state=$(echo "$output" | grep -o '"State":"[^"]*"' | sed 's/"State":"\([^"]*\)"/\1/' | head -1)
    else
      state="unknown"
    fi
  fi
  
  echo "$state"
}

# Function to wait for service to be healthy
wait_for_service() {
  local service=$1
  local max_wait=${2:-120}
  local check_interval=${3:-5}
  
  log "⏳ Waiting for $service to be healthy (max ${max_wait}s)..."
  
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    local state
    state=$(check_service "$service" 10)
    
    case "$state" in
      "running")
        log "✅ $service is healthy"
        return 0
        ;;
      "starting"|"restarting")
        log "⏳ $service is starting... (${elapsed}s elapsed)"
        ;;
      "exited"|"dead")
        log "❌ $service has exited"
        return 1
        ;;
      "not_found")
        log "❌ $service not found"
        return 1
        ;;
      *)
        log "⚠️ $service state: $state (${elapsed}s elapsed)"
        ;;
    esac
    
    sleep $check_interval
    elapsed=$((elapsed + check_interval))
  done
  
  log "❌ $service did not become healthy within ${max_wait}s"
  return 1
}

# Function to check if Docker is available
check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "❌ Docker not available"
    return 1
  fi
  
  if ! docker info >/dev/null 2>&1; then
    log "❌ Docker daemon not running"
    return 1
  fi
  
  log "✅ Docker is available"
  return 0
}

# Function to check if docker-compose file exists
check_compose_file() {
  local compose_file="${1:-.devcontainer/docker-compose.yml}"
  
  if [ ! -f "$compose_file" ]; then
    log "❌ Docker compose file not found: $compose_file"
    return 1
  fi
  
  log "✅ Docker compose file found: $compose_file"
  return 0
}

# Main health check function
main() {
  local action="${1:-check}"
  local services=("postgres" "redis" "qdrant")
  
  case "$action" in
    "check")
      log "🔍 Running service health check..."
      
      # Check prerequisites
      if ! check_docker; then
        exit 1
      fi
      
      if ! check_compose_file; then
        exit 1
      fi
      
      # Check all services
      local failed_services=()
      for service in "${services[@]}"; do
        local state
        state=$(check_service "$service")
        
        case "$state" in
          "running")
            log "✅ $service: $state"
            ;;
          *)
            log "❌ $service: $state"
            failed_services+=("$service")
            ;;
        esac
      done
      
      # Summary
      if [ ${#failed_services[@]} -eq 0 ]; then
        log "🎉 All services are healthy!"
        exit 0
      else
        log "❌ Failed services: ${failed_services[*]}"
        exit 1
      fi
      ;;
      
    "wait")
      log "⏳ Waiting for all services to be healthy..."
      
      # Check prerequisites
      if ! check_docker; then
        exit 1
      fi
      
      # Wait for all services
      local failed_services=()
      for service in "${services[@]}"; do
        if ! wait_for_service "$service"; then
          failed_services+=("$service")
        fi
      done
      
      # Summary
      if [ ${#failed_services[@]} -eq 0 ]; then
        log "🎉 All services are healthy!"
        exit 0
      else
        log "❌ Services that failed to start: ${failed_services[*]}"
        exit 1
      fi
      ;;
      
    "status")
      log "📊 Service status summary:"
      for service in "${services[@]}"; do
        local state
        state=$(check_service "$service")
        printf "   %-10s %s\n" "$service:" "$state"
      done
      ;;
      
    *)
      echo "Usage: $0 [check|wait|status]"
      echo "  check  - Check current health status of all services"
      echo "  wait   - Wait for all services to become healthy"
      echo "  status - Show status summary"
      exit 1
      ;;
  esac
}

# Run main function with all arguments
main "$@"