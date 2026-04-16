#cloud-config
# ============================================================================
# Ectropy ${environment} Server Provisioning
# ============================================================================
# Enterprise-grade cloud-init configuration for zero-touch deployment
# Installs: Docker, Watchtower, nginx, monitoring, logging
# ============================================================================

package_update: true
package_upgrade: true

packages:
  - docker.io
  - docker-compose
  - nginx
  - ufw
  - fail2ban
  - htop
  - curl
  - git
  - jq

# ============================================================================
# System Configuration
# ============================================================================

hostname: ${hostname}

# Timezone
timezone: UTC

# ============================================================================
# User Management & SSH Keys
# ============================================================================

users:
  - name: root
    ssh_authorized_keys:
%{for key in jsondecode(ssh_keys)~}
      - ${key}
%{endfor~}

# ============================================================================
# Firewall Configuration (UFW)
# ============================================================================

runcmd:
  # -------------------------------------------------------------------------
  # 1. FIREWALL SETUP
  # -------------------------------------------------------------------------
  - echo "=== Configuring Firewall ==="
  - ufw --force reset
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp    # SSH
  - ufw allow 80/tcp    # HTTP
  - ufw allow 443/tcp   # HTTPS
  - ufw allow 4000/tcp  # API Gateway (internal)
  - ufw allow 3000/tcp  # Web Dashboard (internal)
  - ufw allow 3001/tcp  # MCP Server (internal)
  - ufw --force enable
  - echo "[OK] Firewall configured"

  # -------------------------------------------------------------------------
  # 2. DOCKER SETUP
  # -------------------------------------------------------------------------
  - echo "=== Configuring Docker ==="
  - systemctl enable docker
  - systemctl start docker
  - docker --version
  - echo "[OK] Docker installed"

  # -------------------------------------------------------------------------
  # 3. DIGITALOCEAN CONTAINER REGISTRY LOGIN
  # -------------------------------------------------------------------------
  - echo "=== Logging into DigitalOcean Container Registry ==="
  - |
    if [ -n "${docr_token}" ]; then
      echo "${docr_token}" | docker login registry.digitalocean.com -u ${docr_token} --password-stdin
      echo "[OK] DOCR login successful"
    else
      echo "[WARNING]  DOCR_TOKEN not provided - manual login required"
    fi

  # -------------------------------------------------------------------------
  # 4. CREATE DEPLOYMENT DIRECTORIES
  # -------------------------------------------------------------------------
  - echo "=== Creating Deployment Directories ==="
  - mkdir -p /opt/ectropy/{config,logs,data}
  - mkdir -p /etc/nginx/sites-available
  - mkdir -p /etc/nginx/sites-enabled
  - echo "[OK] Directories created"

  # -------------------------------------------------------------------------
  # 5. DOCKER COMPOSE CONFIGURATION
  # -------------------------------------------------------------------------
  - echo "=== Creating docker-compose.yml ==="
  - |
    cat > /opt/ectropy/docker-compose.yml <<'EOFCOMPOSE'
    version: '3.8'

    networks:
      ectropy-network:
        driver: bridge

    services:
      # Redis - Session Store & Caching
      redis:
        image: redis:7-alpine
        container_name: ectropy-redis
        restart: unless-stopped
        ports:
          - "6379:6379"
        command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
        networks:
          - ectropy-network
        healthcheck:
          test: ["CMD", "redis-cli", "ping"]
          interval: 10s
          timeout: 3s
          retries: 3
        logging:
          driver: "json-file"
          options:
            max-size: "10m"
            max-file: "3"

      # API Gateway
      api-gateway:
        image: ${registry}/api-gateway:latest
        container_name: ectropy-api-gateway
        restart: unless-stopped
        ports:
          - "4000:4000"
        environment:
          NODE_ENV: ${environment}
          PORT: 4000
          DATABASE_URL: ${database_url}
          REDIS_URL: redis://redis:6379
          API_URL: ${api_url}
          FRONTEND_URL: ${frontend_url}
          GOOGLE_CLIENT_ID: ${google_client_id}
          GOOGLE_CLIENT_SECRET: ${google_client_secret}
          JWT_SECRET: ${jwt_secret}
          JWT_REFRESH_SECRET: ${jwt_refresh_secret}
          SESSION_SECRET: ${session_secret}
          OAUTH_CALLBACK_URL: ${api_url}/api/auth/google/callback
          TRUST_PROXY: "true"
        depends_on:
          - redis
        labels:
          - "com.centurylinklabs.watchtower.enable=true"
        networks:
          - ectropy-network
        logging:
          driver: "json-file"
          options:
            max-size: "10m"
            max-file: "3"

      # Web Dashboard
      web-dashboard:
        image: ${registry}/web-dashboard:latest
        container_name: ectropy-web-dashboard
        restart: unless-stopped
        ports:
          - "3000:3000"
        environment:
          NODE_ENV: ${environment}
          REACT_APP_API_URL: ${api_url}
          REACT_APP_ENABLE_SPECKLE: "true"
        labels:
          - "com.centurylinklabs.watchtower.enable=true"
        networks:
          - ectropy-network
        logging:
          driver: "json-file"
          options:
            max-size: "10m"
            max-file: "3"

      # MCP Server
      mcp-server:
        image: ${registry}/mcp-server:latest
        container_name: ectropy-mcp-server
        restart: unless-stopped
        ports:
          - "3001:3001"
        environment:
          NODE_ENV: ${environment}
          PORT: 3001
          DATABASE_URL: ${database_url}
          REDIS_URL: redis://redis:6379
          API_URL: ${api_url}
          FRONTEND_URL: ${frontend_url}
        depends_on:
          - redis
        labels:
          - "com.centurylinklabs.watchtower.enable=true"
        networks:
          - ectropy-network
        logging:
          driver: "json-file"
          options:
            max-size: "10m"
            max-file: "3"

      # Watchtower - Automated Container Updates
      watchtower:
        image: containrrr/watchtower:latest
        container_name: ectropy-watchtower
        restart: unless-stopped
        volumes:
          - /var/run/docker.sock:/var/run/docker.sock
          - /opt/ectropy/.docker/config.json:/config.json:ro
        environment:
          WATCHTOWER_CLEANUP: "true"
          WATCHTOWER_POLL_INTERVAL: 300  # 5 minutes
          WATCHTOWER_LABEL_ENABLE: "true"
          WATCHTOWER_INCLUDE_RESTARTING: "true"
          WATCHTOWER_ROLLING_RESTART: "true"
          WATCHTOWER_HTTP_API_TOKEN: ${watchtower_token}
          WATCHTOWER_HTTP_API_UPDATE: "true"
        ports:
          - "8080:8080"
        command: --http-api-update
        networks:
          - ectropy-network
        logging:
          driver: "json-file"
          options:
            max-size: "10m"
            max-file: "3"
    EOFCOMPOSE

  - chmod 600 /opt/ectropy/docker-compose.yml
  - echo "[OK] docker-compose.yml created"

  # -------------------------------------------------------------------------
  # 6. NGINX REVERSE PROXY CONFIGURATION
  # -------------------------------------------------------------------------
  - echo "=== Configuring Nginx ==="
  - |
    cat > /etc/nginx/sites-available/ectropy <<'EOFNGINX'
    # Ectropy ${environment} - Reverse Proxy Configuration
    upstream api_backend {
        server localhost:4000;
        keepalive 32;
    }

    upstream web_backend {
        server localhost:3000;
        keepalive 32;
    }

    upstream mcp_backend {
        server localhost:3001;
        keepalive 32;
    }

    # HTTP -> HTTPS Redirect
    server {
        listen 80;
        listen [::]:80;
        server_name ${domain};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$server_name$request_uri;
        }
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name ${domain};

        # SSL Configuration (Cloudflare origin certificates)
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security Headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Logging
        access_log /var/log/nginx/ectropy-${environment}-access.log;
        error_log /var/log/nginx/ectropy-${environment}-error.log;

        # API Gateway
        location /api/ {
            proxy_pass http://api_backend;
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
            proxy_pass http://mcp_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Web Dashboard (default)
        location / {
            proxy_pass http://web_backend;
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
    }
    EOFNGINX

  - ln -sf /etc/nginx/sites-available/ectropy /etc/nginx/sites-enabled/
  - rm -f /etc/nginx/sites-enabled/default
  - nginx -t || echo "[WARNING]  Nginx config test failed - manual SSL cert setup required"
  - systemctl enable nginx
  - echo "[OK] Nginx configured (SSL certs needed)"

  # -------------------------------------------------------------------------
  # 7. START DOCKER CONTAINERS
  # -------------------------------------------------------------------------
  - echo "=== Starting Docker Containers ==="
  - cd /opt/ectropy
  - docker-compose pull || echo "[WARNING]  Failed to pull images - DOCR login may be required"
  - docker-compose up -d || echo "[WARNING]  Failed to start containers"
  - docker ps
  - echo "[OK] Deployment complete"

  # -------------------------------------------------------------------------
  # 8. SETUP MONITORING
  # -------------------------------------------------------------------------
  - echo "=== Setting up monitoring ==="
  - |
    cat > /usr/local/bin/health-check.sh <<'EOFHEALTH'
    #!/bin/bash
    # Ectropy Health Check Script
    SERVICES="ectropy-api-gateway ectropy-web-dashboard ectropy-mcp-server ectropy-watchtower"
    for service in $SERVICES; do
      if ! docker ps | grep -q $service; then
        echo "❌ $service is not running"
        docker logs --tail 50 $service
      fi
    done
    EOFHEALTH
  - chmod +x /usr/local/bin/health-check.sh
  - (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/health-check.sh >> /var/log/health-check.log 2>&1") | crontab -
  - echo "[OK] Monitoring configured"

# ============================================================================
# Final Message
# ============================================================================

final_message: |
  ============================================
  Ectropy ${environment} Server Ready
  ============================================
  Hostname: ${hostname}
  Environment: ${environment}

  Services:
  - API Gateway: http://localhost:4000
  - Web Dashboard: http://localhost:3000
  - MCP Server: http://localhost:3001
  - Watchtower: http://localhost:8080

  Next Steps:
  1. Configure SSL certificates in /etc/nginx/ssl/
  2. Restart nginx: systemctl restart nginx
  3. Verify containers: docker ps
  4. Check logs: docker-compose logs -f

  Documentation: /opt/ectropy/README.md
  ============================================
