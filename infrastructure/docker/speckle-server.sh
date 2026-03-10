#!/bin/bash

# Speckle Server Management Script
# This script helps manage Speckle server for BIM integration demos

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.speckle.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not available in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed or not available in PATH"
        exit 1
    fi
}

# Function to start Speckle services
start_speckle() {
    print_status "Starting Speckle server services..."
    
    # Check if services are already running
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        print_warning "Some Speckle services are already running"
        docker-compose -f "$COMPOSE_FILE" ps
        return 0
    fi
    
    # Start services
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 10
    
    # Check service status
    if check_services; then
        print_success "Speckle server is running!"
        print_status "Access URLs:"
        print_status "  - Speckle Server: http://localhost:3000"
        print_status "  - Speckle Frontend: http://localhost:8080"
        print_status "  - Preview Service: http://localhost:3001"
        print_status ""
        print_status "Default credentials will be created on first access"
    else
        print_error "Failed to start Speckle services"
        show_logs
        exit 1
    fi
}

# Function to stop Speckle services
stop_speckle() {
    print_status "Stopping Speckle server services..."
    docker-compose -f "$COMPOSE_FILE" down
    print_success "Speckle services stopped"
}

# Function to restart Speckle services
restart_speckle() {
    print_status "Restarting Speckle server services..."
    docker-compose -f "$COMPOSE_FILE" restart
    sleep 5
    if check_services; then
        print_success "Speckle services restarted successfully"
    else
        print_error "Failed to restart Speckle services"
    fi
}

# Function to check service status
check_services() {
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3000/health &> /dev/null; then
            return 0
        fi
        
        print_status "Attempt $attempt/$max_attempts: Waiting for Speckle server..."
        sleep 2
        ((attempt++))
    done
    
    return 1
}

# Function to show service status
status_speckle() {
    print_status "Speckle service status:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    print_status ""
    print_status "Service health checks:"
    
    # Check Speckle server
    if curl -s http://localhost:3000/health &> /dev/null; then
        print_success "Speckle Server: Running (http://localhost:3000)"
    else
        print_error "Speckle Server: Not responding"
    fi
    
    # Check frontend
    if curl -s http://localhost:8080 &> /dev/null; then
        print_success "Speckle Frontend: Running (http://localhost:8080)"
    else
        print_error "Speckle Frontend: Not responding"
    fi
    
    # Check preview service
    if curl -s http://localhost:3001/health &> /dev/null; then
        print_success "Preview Service: Running (http://localhost:3001)"
    else
        print_error "Preview Service: Not responding"
    fi
}

# Function to show logs
show_logs() {
    print_status "Speckle service logs:"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
}

# Function to clean up (remove containers and volumes)
cleanup_speckle() {
    print_warning "This will remove all Speckle containers and data volumes"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up Speckle services..."
        docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

# Function to setup initial data
setup_demo_data() {
    print_status "Setting up demo data for Speckle..."
    
    # Wait for services to be ready
    if ! check_services; then
        print_error "Speckle server is not running. Please start it first."
        exit 1
    fi
    
    # Create demo user and project (this would typically be done via API)
    print_status "Demo setup complete. You can now:"
    print_status "1. Visit http://localhost:8080 to access Speckle"
    print_status "2. Create an account or use existing credentials"
    print_status "3. Create a project for BIM integration testing"
    print_status "4. Run the BIM integration demo"
}

# Function to show help
show_help() {
    cat << EOF
Speckle Server Management Script

Usage: $0 [COMMAND]

Commands:
    start       Start Speckle server services
    stop        Stop Speckle server services
    restart     Restart Speckle server services
    status      Show service status and health
    logs        Show service logs
    cleanup     Remove all containers and volumes
    setup       Setup demo data
    help        Show this help message

Examples:
    $0 start        # Start all Speckle services
    $0 status       # Check if services are running
    $0 logs         # View recent logs
    $0 cleanup      # Remove everything (destructive)

Environment:
    The script uses docker-compose.speckle.yml for service definitions.
    Default ports: 3000 (server), 8080 (frontend), 3001 (preview)

For more information, see the README.md file.
EOF
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    
    # Handle commands
    case "${1:-help}" in
        "start")
            start_speckle
            ;;
        "stop")
            stop_speckle
            ;;
        "restart")
            restart_speckle
            ;;
        "status")
            status_speckle
            ;;
        "logs")
            show_logs
            ;;
        "cleanup")
            cleanup_speckle
            ;;
        "setup")
            setup_demo_data
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
