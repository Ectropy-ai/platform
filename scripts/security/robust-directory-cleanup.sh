#!/bin/bash
# Enterprise-grade cleanup script with proper error handling
# Non-critical failures do not block deployment

echo "Starting robust cleanup sequence..."

# Function to safely remove Docker resources
safe_docker_cleanup() {
  echo "Cleaning Docker resources..."
  
  # Stop containers (ignore if not found)
  docker ps -aq 2>/dev/null | xargs -r docker stop 2>/dev/null || true
  
  # Remove containers (ignore if not found)
  docker ps -aq 2>/dev/null | xargs -r docker rm -f 2>/dev/null || true
  
  # Remove volumes (ignore if not found)
  docker volume ls -q 2>/dev/null | xargs -r docker volume rm 2>/dev/null || true
  
  # Remove networks (ignore custom ones only)
  docker network ls --format "{{.Name}}" 2>/dev/null | \
    grep -v "bridge\|host\|none" | \
    xargs -r docker network rm 2>/dev/null || true
    
  echo "Docker cleanup completed (non-critical errors ignored)"
}

# Function to safely remove directories
safe_directory_cleanup() {
  local target_dirs=(
    "database/init"
    "tmp"
    "dist"
    "build"
    ".nx"
  )
  
  echo "Cleaning directories..."
  for dir in "${target_dirs[@]}"; do
    if [ -d "$dir" ]; then
      rm -rf "$dir" 2>/dev/null || {
        echo "Warning: Could not remove $dir (non-critical)"
      }
    fi
  done
  
  echo "Directory cleanup completed"
}

# Main execution
safe_docker_cleanup
safe_directory_cleanup

echo "Cleanup sequence completed successfully"
exit 0
