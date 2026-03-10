#!/bin/bash
# Universal deployment script for Ectropy platform
# Supports alpha, beta, staging, and production environments

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT="${1:-staging}"
DEPLOYMENT_ID="$(date +%Y%m%d_%H%M%S)_$(uuidgen | cut -d- -f1)"

echo -e "${BLUE}🚀 Ectropy Platform Deployment${NC}"
echo "================================="
echo "Environment: $ENVIRONMENT"
echo "Deployment ID: $DEPLOYMENT_ID"
echo ""

# Function to log results
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️ $1${NC}"; }

# Environment-specific configuration
configure_environment() {
    case "$ENVIRONMENT" in
        alpha)
            log_info "Configuring Alpha environment (experimental features enabled)..."
            export NODE_ENV=development
            export FF_MCP_SERVER=true
            export FF_SEMANTIC_SEARCH=true
            export FF_NEW_IFC=true
            export FF_ENHANCED_CACHING=true
            export FF_NEW_DASHBOARD=true
            export FF_REAL_TIME_COLLAB=true
            export BUILD_TARGET=development
            ;;
        beta)
            log_info "Configuring Beta environment (stable features enabled)..."
            export NODE_ENV=staging
            export FF_MCP_SERVER=true
            export FF_SEMANTIC_SEARCH=true
            export FF_NEW_IFC=true
            export FF_ENHANCED_CACHING=true
            export FF_NEW_DASHBOARD=true
            export FF_REAL_TIME_COLLAB=false
            export BUILD_TARGET=staging
            ;;
        staging)
            log_info "Configuring Staging environment (production-like)..."
            export NODE_ENV=staging
            export FF_MCP_SERVER=true
            export FF_SEMANTIC_SEARCH=true
            export FF_NEW_IFC=false
            export FF_ENHANCED_CACHING=true
            export FF_NEW_DASHBOARD=false
            export FF_REAL_TIME_COLLAB=false
            export BUILD_TARGET=production
            ;;
        production)
            log_info "Configuring Production environment (stable features only)..."
            export NODE_ENV=production
            export FF_MCP_SERVER=true
            export FF_SEMANTIC_SEARCH=false
            export FF_NEW_IFC=false
            export FF_ENHANCED_CACHING=true
            export FF_NEW_DASHBOARD=false
            export FF_REAL_TIME_COLLAB=false
            export BUILD_TARGET=production
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
}

# Build applications
build_applications() {
    log_info "Building applications for $ENVIRONMENT environment..."
    
    # Build web dashboard
    log_info "Building web dashboard..."
    if [ "$BUILD_TARGET" = "production" ]; then
        pnpm nx build web-dashboard --configuration=production
    else
        pnpm nx build web-dashboard
    fi
    
    # Build MCP server
    log_info "Building MCP server..."
    if [ "$BUILD_TARGET" = "production" ]; then
        pnpm nx build mcp-server --configuration=production
    else
        pnpm nx build mcp-server
    fi
    
    # Build additional components for staging/production
    if [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "production" ]; then
        log_info "Building additional components..."
        pnpm nx run-many --target=build --configuration=$BUILD_TARGET --parallel=3 || {
            log_warning "Some additional builds failed, continuing with core components"
        }
    fi
    
    log_success "Build completed successfully"
}

# Deploy to environment
deploy_to_environment() {
    log_info "Deploying to $ENVIRONMENT environment..."
    
    case "$ENVIRONMENT" in
        alpha|beta)
            log_info "Development deployment - using local containers..."
            # Use docker compose for development environments
            if [ -f "docker-compose.${ENVIRONMENT}.yml" ]; then
                docker compose -f "docker-compose.${ENVIRONMENT}.yml" up -d
            elif [ -f "docker-compose.dev.yml" ]; then
                docker compose -f docker-compose.dev.yml up -d
            else
                log_warning "No docker-compose file found for $ENVIRONMENT, using development setup"
                docker compose -f docker-compose.dev.yml up -d
            fi
            ;;
        staging)
            log_info "Staging deployment - using staging configuration..."
            if [ -f "docker-compose.staging.yml" ]; then
                docker compose -f docker-compose.staging.yml up -d
            else
                log_error "Staging docker-compose file not found"
                return 1
            fi
            ;;
        production)
            log_info "Production deployment - using production configuration..."
            if [ -f "docker-compose.production.yml" ]; then
                docker compose -f docker-compose.production.yml up -d
            else
                log_error "Production docker-compose file not found"
                return 1
            fi
            ;;
    esac
    
    log_success "Deployment to $ENVIRONMENT completed"
}

# Health check after deployment
post_deployment_health_check() {
    log_info "Running post-deployment health checks..."
    
    # Wait for services to start
    log_info "Waiting for services to start..."
    sleep 30
    
    # Check if services are responding
    local health_check_passed=true
    
    # Check web dashboard (if deployed)
    if [ -d "dist/apps/web-dashboard" ]; then
        log_info "Checking web dashboard health..."
        if curl -f http://localhost:4200 > /dev/null 2>&1; then
            log_success "Web dashboard is responding"
        else
            log_warning "Web dashboard not responding"
            health_check_passed=false
        fi
    fi
    
    # Check MCP server (if deployed)
    if [ -d "dist/apps/mcp-server" ]; then
        log_info "Checking MCP server health..."
        if curl -f http://localhost:3001/health > /dev/null 2>&1; then
            log_success "MCP server is responding"
        else
            log_warning "MCP server not responding"
            health_check_passed=false
        fi
    fi
    
    # Check API gateway (if available)
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_success "API gateway is responding"
    else
        log_warning "API gateway not responding (may not be deployed)"
    fi
    
    if [ "$health_check_passed" = true ]; then
        log_success "All critical services are healthy"
        return 0
    else
        log_error "Some services failed health checks"
        return 1
    fi
}

# Create deployment record
create_deployment_record() {
    log_info "Creating deployment record..."
    
    mkdir -p logs/deployments
    
    cat > "logs/deployments/${DEPLOYMENT_ID}.json" << EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "environment": "$ENVIRONMENT",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "feature_flags": {
    "MCP_SERVER_ENABLED": "${FF_MCP_SERVER:-false}",
    "SEMANTIC_SEARCH": "${FF_SEMANTIC_SEARCH:-false}",
    "NEW_IFC_PROCESSING": "${FF_NEW_IFC:-false}",
    "ENHANCED_CACHING": "${FF_ENHANCED_CACHING:-false}",
    "NEW_DASHBOARD_UI": "${FF_NEW_DASHBOARD:-false}",
    "REAL_TIME_COLLABORATION": "${FF_REAL_TIME_COLLAB:-false}"
  },
  "status": "deployed"
}
EOF
    
    log_success "Deployment record created: logs/deployments/${DEPLOYMENT_ID}.json"
}

# Create pre-deployment snapshot to ensure rollback is possible
create_pre_deployment_snapshot() {
    log_info "Creating pre-deployment snapshot for rollback safety..."
    
    # Only create snapshot for non-development environments
    if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "dev" ]]; then
        local snapshot_name="pre-deploy-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
        
        if command -v ./scripts/enterprise-rollback.sh >/dev/null 2>&1; then
            if ./scripts/enterprise-rollback.sh snapshot "$snapshot_name" >/dev/null 2>&1; then
                log_success "Pre-deployment snapshot created: $snapshot_name"
            else
                log_warning "Failed to create pre-deployment snapshot, but continuing deployment..."
            fi
        else
            log_warning "Enterprise rollback script not found, skipping snapshot creation"
        fi
    else
        log_info "Skipping snapshot creation for development environment"
    fi
}

# Main deployment function
main() {
    log_info "Starting deployment process..."
    
    # Pre-deployment validation
    if [ ! -f "package.json" ]; then
        log_error "Not in a valid Ectropy project directory"
        exit 1
    fi
    
    # Configure environment
    configure_environment
    
    # Create pre-deployment snapshot to ensure rollback is possible
    create_pre_deployment_snapshot
    
    # Build applications
    build_applications
    
    # Deploy to environment
    deploy_to_environment
    
    # Health check
    if post_deployment_health_check; then
        log_success "🎉 Deployment to $ENVIRONMENT successful!"
        
        # Create deployment record
        create_deployment_record
        
        echo ""
        log_info "Deployment Summary:"
        log_info "  Environment: $ENVIRONMENT"
        log_info "  Deployment ID: $DEPLOYMENT_ID"
        log_info "  Build Target: $BUILD_TARGET"
        log_info "  Status: SUCCESS"
        
        exit 0
    else
        log_error "❌ Deployment to $ENVIRONMENT failed health checks"
        
        # Update deployment record with failure
        if [ -f "logs/deployments/${DEPLOYMENT_ID}.json" ]; then
            sed -i 's/"status": "deployed"/"status": "failed"/' "logs/deployments/${DEPLOYMENT_ID}.json"
        fi
        
        log_info "Consider rolling back or checking service logs"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Ectropy Platform Deployment Script"
        echo ""
        echo "Usage: $0 <environment> [options]"
        echo ""
        echo "Environments:"
        echo "  alpha      Alpha environment (all experimental features)"
        echo "  beta       Beta environment (stable features)"
        echo "  staging    Staging environment (production-like)"
        echo "  production Production environment (stable only)"
        echo ""
        echo "Options:"
        echo "  --help, -h Show this help message"
        echo ""
        exit 0
        ;;
    alpha|beta|staging|production)
        main
        ;;
    *)
        if [ -z "${1:-}" ]; then
            log_warning "No environment specified, defaulting to staging"
            main
        else
            log_error "Invalid environment: ${1:-}"
            log_info "Valid environments: alpha, beta, staging, production"
            exit 1
        fi
        ;;
esac