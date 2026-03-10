#!/bin/bash

# =============================================================================
# ECTROPY DEMO USER SEEDING SCRIPT
# =============================================================================
#
# This script provides easy commands to seed demo users in different environments
#
# Usage:
#   ./scripts/seed-users.sh [command]
#
# Commands:
#   local     - Seed users in local development environment
#   docker    - Seed users in Docker environment
#   staging   - Seed users in staging environment (with confirmation)
#   verify    - Verify demo users exist in database
#   help      - Show this help message
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SEEDER_SCRIPT="$SCRIPT_DIR/seed-demo-users.js"

# Default environment variables
DEFAULT_DATABASE_URL="postgresql://postgres:ectropy_dev_password@localhost:5432/ectropy_local"
DOCKER_DATABASE_URL="postgresql://postgres:ectropy_dev_password@localhost:5432/ectropy_local"

# Helper functions
print_header() {
    echo -e "${BLUE}=============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=============================================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Node.js is available
check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed or not in PATH"
        echo "Please install Node.js 20+ to run the seeding script"
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 20 ]; then
        print_error "Node.js version 20+ required (found: $(node --version))"
        exit 1
    fi
}

# Check if required packages are installed
check_dependencies() {
    cd "$PROJECT_ROOT"
    
    if [ ! -d "node_modules" ]; then
        print_warning "Dependencies not installed. Installing..."
        if command -v pnpm &> /dev/null; then
            pnpm install
        elif command -v npm &> /dev/null; then
            pnpm install
        else
            print_error "Neither pnpm nor npm found. Please install dependencies manually."
            exit 1
        fi
    fi
}

# Seed users in local environment
seed_local() {
    print_header "SEEDING DEMO USERS - LOCAL ENVIRONMENT"
    
    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
    export NODE_ENV="development"
    
    echo "Database URL: $(echo $DATABASE_URL | sed 's/:.*@/:***@/')"
    
    cd "$PROJECT_ROOT"
    node "$SEEDER_SCRIPT"
    
    print_success "Local seeding completed!"
}

# Seed users in Docker environment
seed_docker() {
    print_header "SEEDING DEMO USERS - DOCKER ENVIRONMENT"
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    
    cd "$PROJECT_ROOT"
    
    # Option 1: Use Docker Compose service
    if docker compose version >/dev/null 2>&1; then
        echo "Using Docker Compose to seed users..."
        docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm demo-seeder
    else
        # Option 2: Run directly in postgres container
        echo "Running seeder script in Docker container..."
        
        # Copy the script to the container and run it
        docker exec -i ectropy_postgres_local psql -U postgres -d ectropy_local < database/seed-demo-users.sql
    fi
    
    print_success "Docker seeding completed!"
}

# Seed users in staging environment (with confirmation)
seed_staging() {
    print_header "SEEDING DEMO USERS - STAGING ENVIRONMENT"
    
    print_warning "You are about to seed demo users in STAGING environment!"
    print_warning "This will create/replace demo users with test credentials."
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "Seeding cancelled."
        exit 0
    fi
    
    if [ -z "$STAGING_DATABASE_URL" ]; then
        print_error "STAGING_DATABASE_URL environment variable is required"
        echo "Please set STAGING_DATABASE_URL and try again"
        exit 1
    fi
    
    export DATABASE_URL="$STAGING_DATABASE_URL"
    export NODE_ENV="staging"
    
    echo "Database URL: $(echo $DATABASE_URL | sed 's/:.*@/:***@/')"
    
    cd "$PROJECT_ROOT"
    node "$SEEDER_SCRIPT"
    
    print_success "Staging seeding completed!"
}

# Verify demo users exist
verify_users() {
    print_header "VERIFYING DEMO USERS"
    
    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
    
    echo "Checking database: $(echo $DATABASE_URL | sed 's/:.*@/:***@/')"
    
    cd "$PROJECT_ROOT"
    
    # Create a simple verification script
    cat > /tmp/verify-demo-users.js << 'EOF'
const { Client } = require('pg');
require('dotenv').config();

async function verify() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    try {
        await client.connect();
        
        const result = await client.query(`
            SELECT email, username, full_name, role, is_active, created_at
            FROM users 
            WHERE email IN ('demo@ectropy.com', 'admin@ectropy.com', 'test@ectropy.com')
            ORDER BY email
        `);
        
        if (result.rows.length === 0) {
            console.log('❌ No demo users found');
            process.exit(1);
        }
        
        console.log('✅ Found demo users:');
        console.log('');
        result.rows.forEach(user => {
            console.log(`📧 ${user.email}`);
            console.log(`   Name: ${user.full_name}`);
            console.log(`   Role: ${user.role}`);
            console.log(`   Active: ${user.is_active}`);
            console.log(`   Created: ${user.created_at.toISOString()}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Error verifying users:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

verify();
EOF
    
    node /tmp/verify-demo-users.js
    rm /tmp/verify-demo-users.js
    
    print_success "Verification completed!"
}

# Show help message
show_help() {
    echo "Ectropy Demo User Seeding Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  local     - Seed users in local development environment"
    echo "  docker    - Seed users in Docker environment"
    echo "  staging   - Seed users in staging environment (requires confirmation)"
    echo "  verify    - Verify demo users exist in database"
    echo "  help      - Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  DATABASE_URL - PostgreSQL connection string"
    echo "  STAGING_DATABASE_URL - Staging database connection string"
    echo "  BCRYPT_ROUNDS - Password hashing rounds (default: 12)"
    echo ""
    echo "Examples:"
    echo "  $0 local                    # Seed local environment"
    echo "  $0 docker                   # Seed Docker environment"
    echo "  DATABASE_URL=... $0 local   # Use custom database URL"
    echo ""
    echo "Demo User Credentials (for development/testing only):"
    echo "  demo@ectropy.com / demo123  (user role)"
    echo "  admin@ectropy.com / admin123 (admin role)"
    echo "  test@ectropy.com / test123  (user role)"
}

# Main script logic
main() {
    local command="${1:-help}"
    
    case "$command" in
        "local")
            check_node
            check_dependencies
            seed_local
            ;;
        "docker")
            seed_docker
            ;;
        "staging")
            check_node
            check_dependencies
            seed_staging
            ;;
        "verify")
            check_node
            check_dependencies
            verify_users
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"