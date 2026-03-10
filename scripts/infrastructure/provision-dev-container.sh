#!/bin/bash
# ============================================================================
# Enterprise Development Container Provisioning Script
# ============================================================================
# Purpose: Create and configure DigitalOcean development droplet for testing
# Version: 1.0.0
# Last Updated: 2025-12-14
# ============================================================================
#
# ENTERPRISE REQUIREMENTS:
#   - Environment parity with staging/production (same OS, Docker, configs)
#   - Complete health check validation before staging deployment
#   - Terraform import testing in isolated environment
#   - Scalable development infrastructure (no local Docker Desktop dependency)
#   - Full 13-service stack testing (api-gateway, mcp-server, web-dashboard,
#     postgres, redis, minio, qdrant, speckle services, nginx)
#
# USAGE:
#   ./scripts/infrastructure/provision-dev-container.sh
#
# PREREQUISITES:
#   - doctl CLI authenticated
#   - SSH keys configured in DigitalOcean (will use ectropy-2025 key)
#   - GitHub access token (for cloning private repo)
#   - .env file with required secrets
#
# OUTPUT:
#   - ectropy-development droplet in sfo3 region
#   - Docker + Docker Compose installed
#   - Repository cloned and configured
#   - Ready for health check validation
#
# ============================================================================

set -euo pipefail

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------

DROPLET_NAME="ectropy-development"
DROPLET_REGION="sfo3"
DROPLET_SIZE="s-2vcpu-4gb"
DROPLET_IMAGE="ubuntu-24-04-x64"
SSH_KEY_NAME="ectropy-2025"
VPC_UUID="480ff884-7aa3-4855-ab58-95d64c2866b6"  # default-sfo3
GITHUB_REPO="https://github.com/luhtech/Ectropy.git"
GITHUB_BRANCH="development"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ----------------------------------------------------------------------------
# Logging Functions
# ----------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo ""
    echo "========================================================================"
    echo "$1"
    echo "========================================================================"
    echo ""
}

# ----------------------------------------------------------------------------
# Validation Functions
# ----------------------------------------------------------------------------

validate_prerequisites() {
    log_section "Validating Prerequisites"

    # Check doctl
    if ! command -v doctl &> /dev/null; then
        log_error "doctl CLI not found. Install from: https://docs.digitalocean.com/reference/doctl/"
        exit 1
    fi
    log_success "doctl CLI found"

    # Check authentication
    if ! doctl account get &> /dev/null; then
        log_error "doctl not authenticated. Run: doctl auth init"
        exit 1
    fi
    log_success "doctl authenticated"

    # Get SSH key ID
    SSH_KEY_ID=$(doctl compute ssh-key list --format ID,Name --no-header | grep "$SSH_KEY_NAME" | awk '{print $1}')
    if [ -z "$SSH_KEY_ID" ]; then
        log_error "SSH key '$SSH_KEY_NAME' not found"
        log_info "Available SSH keys:"
        doctl compute ssh-key list --format Name
        exit 1
    fi
    log_success "SSH key found: $SSH_KEY_NAME (ID: $SSH_KEY_ID)"

    # Check if droplet already exists
    EXISTING_DROPLET=$(doctl compute droplet list --format Name --no-header | grep "^$DROPLET_NAME$" || true)
    if [ -n "$EXISTING_DROPLET" ]; then
        log_warning "Droplet '$DROPLET_NAME' already exists"
        read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deleting existing droplet..."
            DROPLET_ID=$(doctl compute droplet list --format ID,Name --no-header | grep "$DROPLET_NAME" | awk '{print $1}')
            doctl compute droplet delete "$DROPLET_ID" --force
            log_success "Existing droplet deleted"
            sleep 5
        else
            log_error "Cannot proceed with existing droplet. Exiting."
            exit 1
        fi
    fi
}

# ----------------------------------------------------------------------------
# Droplet Creation
# ----------------------------------------------------------------------------

create_droplet() {
    log_section "Creating Development Droplet"

    log_info "Creating droplet with configuration:"
    log_info "  Name:   $DROPLET_NAME"
    log_info "  Region: $DROPLET_REGION"
    log_info "  Size:   $DROPLET_SIZE (2 vCPU, 4GB RAM, 80GB SSD)"
    log_info "  Image:  $DROPLET_IMAGE"
    log_info "  VPC:    $VPC_UUID (default-sfo3)"

    # Create droplet with user data script for initial setup
    DROPLET_ID=$(doctl compute droplet create "$DROPLET_NAME" \
        --region "$DROPLET_REGION" \
        --size "$DROPLET_SIZE" \
        --image "$DROPLET_IMAGE" \
        --ssh-keys "$SSH_KEY_ID" \
        --vpc-uuid "$VPC_UUID" \
        --enable-monitoring \
        --tag-names "environment:development,purpose:health-check-testing,managed-by:terraform" \
        --format ID \
        --no-header \
        --wait)

    log_success "Droplet created: ID $DROPLET_ID"

    # Wait for droplet to be fully active
    log_info "Waiting for droplet to be fully active..."
    sleep 30

    # Get droplet IP
    DROPLET_IP=$(doctl compute droplet get "$DROPLET_ID" --format PublicIPv4 --no-header)
    log_success "Droplet IP: $DROPLET_IP"

    # Wait for SSH to be ready
    log_info "Waiting for SSH to be ready..."
    MAX_ATTEMPTS=30
    ATTEMPT=0
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@"$DROPLET_IP" "echo 'SSH ready'" &> /dev/null; then
            log_success "SSH connection established"
            break
        fi
        ATTEMPT=$((ATTEMPT + 1))
        echo -n "."
        sleep 10
    done
    echo ""

    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        log_error "SSH connection timeout"
        exit 1
    fi

    # Export for use in other functions
    export DROPLET_IP
    export DROPLET_ID
}

# ----------------------------------------------------------------------------
# Docker Installation
# ----------------------------------------------------------------------------

install_docker() {
    log_section "Installing Docker and Docker Compose"

    # Create bootstrap script
    cat > /tmp/docker-bootstrap.sh << 'BOOTSTRAP_EOF'
#!/bin/bash
set -euo pipefail

# Update system
apt-get update
apt-get upgrade -y

# Install prerequisites
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq \
    wget \
    unzip

# Add Docker GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker
systemctl enable docker
systemctl start docker

# Verify installation
docker --version
docker compose version

echo "✅ Docker installation complete"
BOOTSTRAP_EOF

    # Copy and execute bootstrap script
    scp -o StrictHostKeyChecking=no /tmp/docker-bootstrap.sh root@"$DROPLET_IP":/tmp/
    ssh -o StrictHostKeyChecking=no root@"$DROPLET_IP" "chmod +x /tmp/docker-bootstrap.sh && /tmp/docker-bootstrap.sh"

    log_success "Docker and Docker Compose installed"
}

# ----------------------------------------------------------------------------
# Repository Deployment
# ----------------------------------------------------------------------------

deploy_repository() {
    log_section "Deploying Ectropy Repository"

    # Create deployment script
    cat > /tmp/deploy-repo.sh << 'DEPLOY_EOF'
#!/bin/bash
set -euo pipefail

# Clone repository
cd /root
git clone -b development https://github.com/luhtech/Ectropy.git
cd Ectropy

# Show current commit
echo "Repository cloned successfully"
echo "Current commit: $(git rev-parse --short HEAD)"
echo "Branch: $(git branch --show-current)"

# Create directory structure
mkdir -p /root/Ectropy/terraform/state
mkdir -p /root/Ectropy/logs

echo "✅ Repository deployment complete"
DEPLOY_EOF

    # Copy and execute deployment script
    scp -o StrictHostKeyChecking=no /tmp/deploy-repo.sh root@"$DROPLET_IP":/tmp/
    ssh -o StrictHostKeyChecking=no root@"$DROPLET_IP" "chmod +x /tmp/deploy-repo.sh && /tmp/deploy-repo.sh"

    log_success "Repository deployed"
}

# ----------------------------------------------------------------------------
# Environment Configuration
# ----------------------------------------------------------------------------

configure_environment() {
    log_section "Configuring Environment"

    log_info "Creating .env file template"

    # Create .env template
    cat > /tmp/.env.development << 'ENV_EOF'
# ============================================================================
# Ectropy Development Environment Configuration
# ============================================================================
# Generated: 2025-12-14
# Environment: development
# Purpose: Health check testing and Terraform validation
# ============================================================================

# Node Environment
NODE_ENV=development

# Database Configuration
DATABASE_PASSWORD=dev_password_change_me
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=ectropy_development
DATABASE_USER=postgres

# Redis Configuration
REDIS_PASSWORD=dev_redis_password_change_me
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Secrets
JWT_SECRET=dev_jwt_secret_change_me_min_32_chars
JWT_REFRESH_SECRET=dev_jwt_refresh_secret_change_me_min_32_chars
SESSION_SECRET=dev_session_secret_change_me_min_32_chars
ENCRYPTION_KEY=dev_encryption_key_32_chars_min

# MCP Server
MCP_API_KEY=dev_mcp_api_key_change_me

# MinIO S3
MINIO_ACCESS_KEY=dev_minio_access_key
MINIO_SECRET_KEY=dev_minio_secret_key_min_8_chars

# Speckle
SPECKLE_SESSION_SECRET=dev_speckle_session_secret_change_me

# Email (optional for dev)
EMAIL_FROM=dev@localhost
EMAIL_HOST=localhost
EMAIL_PORT=1025

# ============================================================================
# IMPORTANT: Replace all 'change_me' values before starting services
# ============================================================================
ENV_EOF

    # Copy .env template to droplet
    scp -o StrictHostKeyChecking=no /tmp/.env.development root@"$DROPLET_IP":/root/Ectropy/.env

    log_warning "Environment file created with development defaults"
    log_warning "Update secrets in /root/Ectropy/.env before starting services"
}

# ----------------------------------------------------------------------------
# Firewall Configuration
# ----------------------------------------------------------------------------

configure_firewall() {
    log_section "Configuring Firewall Rules"

    log_info "Creating firewall for development environment"

    # Check if firewall exists
    FIREWALL_EXISTS=$(doctl compute firewall list --format Name --no-header | grep "^ectropy-development$" || true)

    if [ -n "$FIREWALL_EXISTS" ]; then
        log_warning "Firewall 'ectropy-development' already exists, skipping creation"
        return
    fi

    # Create firewall
    doctl compute firewall create \
        --name ectropy-development \
        --inbound-rules "protocol:tcp,ports:22,sources:addresses:0.0.0.0/0,addresses:::/0 protocol:tcp,ports:80,sources:addresses:0.0.0.0/0,addresses:::/0 protocol:tcp,ports:443,sources:addresses:0.0.0.0/0,addresses:::/0" \
        --outbound-rules "protocol:tcp,ports:all,destinations:addresses:0.0.0.0/0,addresses:::/0 protocol:udp,ports:all,destinations:addresses:0.0.0.0/0,addresses:::/0 protocol:icmp,destinations:addresses:0.0.0.0/0,addresses:::/0" \
        --droplet-ids "$DROPLET_ID"

    log_success "Firewall configured (SSH, HTTP, HTTPS)"
}

# ----------------------------------------------------------------------------
# Health Check Validation Script
# ----------------------------------------------------------------------------

create_validation_script() {
    log_section "Creating Health Check Validation Script"

    cat > /tmp/validate-health.sh << 'VALIDATE_EOF'
#!/bin/bash
# ============================================================================
# Health Check Validation Script
# ============================================================================

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================================================"
echo "Enterprise Health Check Validation"
echo "========================================================================"
echo ""

# Check Docker containers
echo "Docker Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Test health endpoints
echo "Health Endpoint Tests:"
echo ""

test_endpoint() {
    local name=$1
    local url=$2
    local expected=$3

    echo -n "Testing $name ($url)... "
    if response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>&1); then
        if [ "$response" = "$expected" ]; then
            echo -e "${GREEN}✓ $response${NC}"
        else
            echo -e "${RED}✗ Got $response, expected $expected${NC}"
        fi
    else
        echo -e "${RED}✗ Connection failed${NC}"
    fi
}

# Wait for services to start
echo "Waiting for services to initialize (60 seconds)..."
sleep 60

# Test all health endpoints
test_endpoint "Nginx LB Health" "http://localhost/lb-health" "200"
test_endpoint "Nginx App Health" "http://localhost/health" "200"
test_endpoint "API Gateway Health" "http://localhost/api/health" "200"
test_endpoint "MCP Server Health (3001)" "http://localhost:3001/health" "200"
test_endpoint "MCP LB Health (3001)" "http://localhost:3001/lb-health" "200"
test_endpoint "MCP Ping (3001)" "http://localhost:3001/ping" "200"
test_endpoint "MCP Liveness (3001)" "http://localhost:3001/health/live" "200"
test_endpoint "MCP Readiness (3001)" "http://localhost:3001/health/ready" "200"
test_endpoint "MCP Startup (3001)" "http://localhost:3001/health/startup" "200"

echo ""
echo "========================================================================"
echo "Validation Complete"
echo "========================================================================"
VALIDATE_EOF

    # Copy validation script to droplet
    scp -o StrictHostKeyChecking=no /tmp/validate-health.sh root@"$DROPLET_IP":/root/Ectropy/
    ssh -o StrictHostKeyChecking=no root@"$DROPLET_IP" "chmod +x /root/Ectropy/validate-health.sh"

    log_success "Health check validation script created"
}

# ----------------------------------------------------------------------------
# Main Execution
# ----------------------------------------------------------------------------

main() {
    log_section "Enterprise Development Container Provisioning"

    validate_prerequisites
    create_droplet
    install_docker
    deploy_repository
    configure_environment
    configure_firewall
    create_validation_script

    log_section "Provisioning Complete!"

    echo ""
    echo "📋 Development Container Details:"
    echo "  • Droplet Name: $DROPLET_NAME"
    echo "  • Droplet ID:   $DROPLET_ID"
    echo "  • IP Address:   $DROPLET_IP"
    echo "  • Region:       $DROPLET_REGION"
    echo "  • Size:         $DROPLET_SIZE (2 vCPU, 4GB RAM)"
    echo ""
    echo "🔐 SSH Access:"
    echo "  ssh root@$DROPLET_IP"
    echo ""
    echo "📦 Next Steps:"
    echo "  1. SSH into the droplet: ssh root@$DROPLET_IP"
    echo "  2. Update secrets in: /root/Ectropy/.env"
    echo "  3. Start services: cd /root/Ectropy && docker compose -f docker-compose.development.yml up -d"
    echo "  4. Validate health: /root/Ectropy/validate-health.sh"
    echo "  5. Test Terraform: cd /root/Ectropy/terraform && ./scripts/import-existing.sh"
    echo ""
    echo "📊 Monitoring:"
    echo "  • Container logs: docker compose -f docker-compose.development.yml logs -f"
    echo "  • Container status: docker ps"
    echo "  • Health checks: /root/Ectropy/validate-health.sh"
    echo ""
    echo "🗑️  Cleanup (when done):"
    echo "  doctl compute droplet delete $DROPLET_ID --force"
    echo ""

    log_success "Development container ready for testing!"
}

# Execute main function
main "$@"
