#!/bin/bash

# Bulletproof Speckle Server Management Script
# This script provides comprehensive Speckle server management

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.speckle.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Clean up any existing conflicting containers
cleanup_existing() {
    print_status "Cleaning up existing Speckle containers..."
    
    # Stop and remove existing containers
    docker stop speckle-server speckle-postgres speckle-redis speckle-preview speckle-frontend 2>/dev/null || true
    docker rm speckle-server speckle-postgres speckle-redis speckle-preview speckle-frontend 2>/dev/null || true
    
    # Clean up networks
    docker network rm speckle-network 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Start Speckle services
start_services() {
    print_status "Starting Speckle services..."
    
    # Pull latest images
    docker-compose -f "$COMPOSE_FILE" pull
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" up -d
    
    print_status "Waiting for services to initialize..."
    
    # Wait for health checks
    local max_wait=300  # 5 minutes
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then
            print_success "Services are healthy!"
            break
        fi
        
        print_status "Waiting for services... ($waited/$max_wait seconds)"
        sleep 10
        waited=$((waited + 10))
    done
    
    if [ $waited -ge $max_wait ]; then
        print_error "Services failed to start properly"
        show_logs
        exit 1
    fi
    
    print_success "Speckle server is running!"
    show_access_info
}

# Show access information
show_access_info() {
    print_status "Access Information:"
    echo "  🌐 Speckle Server: http://localhost:3000"
    echo "  🎨 Speckle Frontend: http://localhost:8080"
    echo "  🔍 Preview Service: http://localhost:3001"
    echo "  🗄️ PostgreSQL: localhost:5433"
    echo "  🗃️ Redis: localhost:6380"
    echo ""
    print_status "Default admin account will be created on first access"
}

# Show service status
show_status() {
    print_status "Speckle Service Status:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo ""
    print_status "Health Checks:"
    
    # Check each service
    if curl -s http://localhost:3000/graphql?query={serverInfo{name}} &> /dev/null; then
        print_success "✅ Speckle Server: Running"
    else
        print_error "❌ Speckle Server: Not responding"
    fi
    
    if curl -s http://localhost:3001 &> /dev/null; then
        print_success "✅ Preview Service: Running"
    else
        print_error "❌ Preview Service: Not responding"
    fi
    
    if curl -s http://localhost:8080 &> /dev/null; then
        print_success "✅ Frontend: Running"
    else
        print_error "❌ Frontend: Not responding"
    fi
    
    # Check database
    if docker exec speckle-postgres pg_isready -U speckle &> /dev/null; then
        print_success "✅ PostgreSQL: Ready"
    else
        print_error "❌ PostgreSQL: Not ready"
    fi
    
    # Check Redis
    if docker exec speckle-redis redis-cli ping &> /dev/null; then
        print_success "✅ Redis: Ready"
    else
        print_error "❌ Redis: Not ready"
    fi
}

# Show logs
show_logs() {
    print_status "Recent logs:"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
}

# Stop services
stop_services() {
    print_status "Stopping Speckle services..."
    docker-compose -f "$COMPOSE_FILE" down
    print_success "Services stopped"
}

# Restart services
restart_services() {
    print_status "Restarting Speckle services..."
    docker-compose -f "$COMPOSE_FILE" restart
    sleep 10
    show_status
}

# Main script logic
case "$1" in
    start)
        check_prerequisites
        cleanup_existing
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    clean)
        stop_services
        cleanup_existing
        print_success "Complete cleanup finished"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|clean}"
        echo ""
        echo "Commands:"
        echo "  start   - Start all Speckle services"
        echo "  stop    - Stop all Speckle services"
        echo "  restart - Restart all Speckle services"
        echo "  status  - Show service status and health"
        echo "  logs    - Show recent logs"
        echo "  clean   - Stop and remove all containers"
        exit 1
        ;;
esac
