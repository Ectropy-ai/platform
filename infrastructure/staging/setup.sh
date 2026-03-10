#!/bin/bash
set -euo pipefail

# Enterprise-Grade Staging Server Provisioning Script
# Task 7: Infrastructure as Code Implementation
# 
# This script provides complete server provisioning for Ectropy staging deployment
# following enterprise standards for reproducibility and security.

echo "🏗️ Enterprise Staging Server Provisioning"
echo "=========================================="
echo "🎯 Target: Staging Environment Setup"
echo "📋 Standard: Enterprise Infrastructure as Code"
echo "🛡️ Security: Hardened configuration with secrets management"
echo ""

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/ectropy-provisioning.log"
readonly CONFIG_DIR="/var/config"
readonly DEPLOYMENT_BASE="/var/deployments"
readonly NGINX_CONFIG="/etc/nginx/sites-available/ectropy-staging"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    echo "[$(date -Iseconds)] [$level] $message" | tee -a "$LOG_FILE"
}

# Error handling
error_handler() {
    log "ERROR" "Provisioning failed at line $1. Exit code: $2"
    echo "❌ Server provisioning failed. Check logs: $LOG_FILE"
    exit 1
}

trap 'error_handler $LINENO $?' ERR

# Validate running as root
if [[ $EUID -ne 0 ]]; then
    echo "❌ This script must be run as root for system provisioning"
    exit 1
fi

log "INFO" "Starting enterprise staging server provisioning"

# Phase 1: System Updates and Base Packages
echo "📦 Phase 1: System Updates and Base Packages"
log "INFO" "Updating system packages"

apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    jq \
    unzip \
    htop \
    tree \
    vim \
    fail2ban \
    ufw \
    logrotate

echo "✅ Base packages installed"

# Phase 2: Security Hardening
echo "🛡️ Phase 2: Security Hardening"
log "INFO" "Implementing security hardening"

# Configure UFW firewall
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5000/tcp  # MCP server
ufw allow 3000/tcp  # API Gateway
ufw --force enable

# Configure fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Secure SSH configuration
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

echo "✅ Security hardening completed"

# Phase 3: Docker Installation
echo "🐳 Phase 3: Docker Installation"
log "INFO" "Installing Docker CE"

# Remove old Docker versions
apt-get remove -y docker docker-engine docker.io containerd runc || true

# Add Docker repository
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Install Docker
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Configure Docker
systemctl enable docker
systemctl start docker

# Add docker group for non-root access
groupadd -f docker

# Configure Docker logging
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "live-restore": true
}
EOF

systemctl reload docker

echo "✅ Docker installation completed"

# Phase 4: Node.js and pnpm Installation
echo "📦 Phase 4: Node.js and pnpm Installation"
log "INFO" "Installing Node.js 20 and pnpm"

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Enable corepack and install pnpm
corepack enable
corepack prepare pnpm@10.14.0 --activate

# Verify installations
node_version=$(node --version)
pnpm_version=$(pnpm --version)
log "INFO" "Node.js version: $node_version"
log "INFO" "pnpm version: $pnpm_version"

echo "✅ Node.js and pnpm installation completed"

# Phase 5: PostgreSQL Installation
echo "🗄️ Phase 5: PostgreSQL Installation"
log "INFO" "Installing PostgreSQL with PostGIS"

# Install PostgreSQL 14
apt-get install -y postgresql-14 postgresql-14-postgis-3 postgresql-contrib-14

# Configure PostgreSQL
systemctl enable postgresql
systemctl start postgresql

# Create database and user for Ectropy
sudo -u postgres psql << 'EOF'
CREATE DATABASE ectropy_staging;
CREATE USER ectropy_staging WITH ENCRYPTED PASSWORD 'change_this_password_in_production';
GRANT ALL PRIVILEGES ON DATABASE ectropy_staging TO ectropy_staging;
ALTER USER ectropy_staging CREATEDB;
\c ectropy_staging;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOF

echo "✅ PostgreSQL installation completed"

# Phase 6: Redis Installation
echo "⚡ Phase 6: Redis Installation"
log "INFO" "Installing Redis"

apt-get install -y redis-server

# Configure Redis
sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

systemctl enable redis-server
systemctl start redis-server

echo "✅ Redis installation completed"

# Phase 7: Nginx Installation and Configuration
echo "🌐 Phase 7: Nginx Installation and Configuration"
log "INFO" "Installing and configuring Nginx"

apt-get install -y nginx

# Create Nginx configuration for Ectropy staging
cat > "$NGINX_CONFIG" << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;
    
    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # MCP Server
    location /mcp/ {
        proxy_pass http://localhost:5000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # Block access to sensitive files
    location ~ /\. {
        deny all;
    }
    
    location ~ \.(env|log|conf)$ {
        deny all;
    }
}
EOF

# Enable the site
ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t
systemctl enable nginx
systemctl start nginx

echo "✅ Nginx installation and configuration completed"

# Phase 8: Directory Structure Creation
echo "📁 Phase 8: Directory Structure Creation"
log "INFO" "Creating application directory structure"

# Create deployment directories
mkdir -p "$DEPLOYMENT_BASE"
mkdir -p "$CONFIG_DIR"
mkdir -p /var/log/ectropy
mkdir -p /var/www

# Set proper permissions
chown -R www-data:www-data /var/www
chmod -R 755 "$DEPLOYMENT_BASE"
chmod -R 755 "$CONFIG_DIR"

echo "✅ Directory structure created"

# Phase 9: System Service Configuration
echo "⚙️ Phase 9: System Service Configuration"
log "INFO" "Configuring system services"

# Create systemd service for MCP server monitoring
cat > /etc/systemd/system/ectropy-monitor.service << 'EOF'
[Unit]
Description=Ectropy MCP Server Monitor
After=network.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/ectropy-health-check.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

# Create monitoring script
cat > /usr/local/bin/ectropy-health-check.sh << 'EOF'
#!/bin/bash
# Ectropy Health Check Script

LOG_FILE="/var/log/ectropy/health-check.log"

log() {
    echo "[$(date -Iseconds)] $*" | tee -a "$LOG_FILE"
}

# Check MCP container
if ! docker ps | grep -q ectropy-mcp-current; then
    log "WARNING: MCP container not running"
    exit 1
fi

# Check MCP health endpoint
if ! curl -f -s http://localhost:5000/health >/dev/null; then
    log "WARNING: MCP health check failed"
    exit 1
fi

log "INFO: All health checks passed"
EOF

chmod +x /usr/local/bin/ectropy-health-check.sh

# Create systemd timer for regular health checks
cat > /etc/systemd/system/ectropy-monitor.timer << 'EOF'
[Unit]
Description=Run Ectropy health check every 5 minutes
Requires=ectropy-monitor.service

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl enable ectropy-monitor.timer
systemctl start ectropy-monitor.timer

echo "✅ System services configured"

# Phase 10: Log Rotation Configuration
echo "📋 Phase 10: Log Rotation Configuration"
log "INFO" "Configuring log rotation"

cat > /etc/logrotate.d/ectropy << 'EOF'
/var/log/ectropy/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}

/var/log/ectropy-provisioning.log {
    weekly
    missingok
    rotate 12
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF

echo "✅ Log rotation configured"

# Phase 11: Final System Configuration
echo "🔧 Phase 11: Final System Configuration"
log "INFO" "Applying final system configuration"

# Update system limits
cat >> /etc/security/limits.conf << 'EOF'
# Ectropy application limits
www-data soft nofile 65536
www-data hard nofile 65536
root soft nofile 65536
root hard nofile 65536
EOF

# Configure sysctl for better performance
cat > /etc/sysctl.d/99-ectropy.conf << 'EOF'
# Network optimizations for Ectropy
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 60
net.ipv4.tcp_keepalive_probes = 3

# Memory optimizations
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
EOF

sysctl -p /etc/sysctl.d/99-ectropy.conf

# Enable necessary systemd services
systemctl daemon-reload

echo "✅ Final system configuration completed"

# Phase 12: Verification and Summary
echo "✅ Phase 12: Verification and Summary"
log "INFO" "Running final verification"

# System verification
echo "🔍 System Verification:"
echo "  • Docker: $(docker --version)"
echo "  • Node.js: $(node --version)"
echo "  • pnpm: $(pnpm --version)"
echo "  • PostgreSQL: $(sudo -u postgres psql -c 'SELECT version();' | head -3 | tail -1)"
echo "  • Redis: $(redis-cli --version)"
echo "  • Nginx: $(nginx -v 2>&1)"

# Service status
echo ""
echo "🚀 Service Status:"
systemctl is-active docker && echo "  • Docker: ✅ Active" || echo "  • Docker: ❌ Inactive"
systemctl is-active postgresql && echo "  • PostgreSQL: ✅ Active" || echo "  • PostgreSQL: ❌ Inactive"
systemctl is-active redis-server && echo "  • Redis: ✅ Active" || echo "  • Redis: ❌ Inactive"
systemctl is-active nginx && echo "  • Nginx: ✅ Active" || echo "  • Nginx: ❌ Inactive"
systemctl is-active ufw && echo "  • UFW Firewall: ✅ Active" || echo "  • UFW Firewall: ❌ Inactive"

# Network verification
echo ""
echo "🌐 Network Configuration:"
echo "  • HTTP Port 80: $(ss -tlnp | grep :80 && echo '✅ Open' || echo '❌ Closed')"
echo "  • HTTPS Port 443: $(ss -tlnp | grep :443 && echo '✅ Open' || echo '❌ Closed')"
echo "  • MCP Port 5000: Available for application"
echo "  • API Port 3000: Available for application"

# Create provisioning summary
cat > "$CONFIG_DIR/provisioning-summary.json" << EOF
{
  "provisioning_date": "$(date -Iseconds)",
  "script_version": "1.0.0",
  "components_installed": {
    "docker": "$(docker --version)",
    "nodejs": "$(node --version)",
    "pnpm": "$(pnpm --version)",
    "postgresql": "14",
    "redis": "$(redis-cli --version | cut -d' ' -f2)",
    "nginx": "$(nginx -v 2>&1 | cut -d' ' -f3)"
  },
  "security_features": [
    "UFW Firewall configured",
    "Fail2ban active",
    "SSH hardened",
    "File permissions secured",
    "System limits optimized"
  ],
  "directory_structure": {
    "deployments": "$DEPLOYMENT_BASE",
    "config": "$CONFIG_DIR",
    "logs": "/var/log/ectropy",
    "web_root": "/var/www"
  },
  "next_steps": [
    "Configure GitHub secrets with server credentials",
    "Run staging deployment workflow",
    "Verify all services respond correctly"
  ]
}
EOF

echo ""
echo "🎉 ENTERPRISE STAGING SERVER PROVISIONING COMPLETED"
echo "=================================================="
echo ""
echo "✅ All components installed and configured"
echo "✅ Security hardening applied"
echo "✅ Monitoring and health checks configured"
echo "✅ Infrastructure as Code implementation complete"
echo ""
echo "📋 Summary saved to: $CONFIG_DIR/provisioning-summary.json"
echo "📝 Detailed logs: $LOG_FILE"
echo ""
echo "🔧 Next Steps:"
echo "  1. Configure GitHub repository secrets:"
echo "     • DO_HOST: This server's IP address"
echo "     • DO_SSH_KEY: SSH private key for deployment"
echo "     • DATABASE_URL: postgresql://ectropy_staging:PASSWORD@localhost:5432/ectropy_staging"
echo "     • REDIS_URL: redis://localhost:6379"
echo "  2. Update database password in production"
echo "  3. Run staging deployment workflow from GitHub Actions"
echo "  4. Verify deployment at http://YOUR_SERVER_IP"
echo ""
echo "🛡️ Security Note: Remember to update the PostgreSQL password!"
echo "   sudo -u postgres psql -c \"ALTER USER ectropy_staging PASSWORD 'YOUR_SECURE_PASSWORD';\""

log "INFO" "Enterprise staging server provisioning completed successfully"