# ============================================================================
# Infrastructure Config Deployment Module
# ============================================================================
# Purpose: GitOps deployment of infrastructure configuration files
# Pattern: Hash-based deployment triggers (SHA256 of config content)
# Root Cause: #156 - Nginx config files missing from Terraform deployment
# Enterprise Benefits:
#   - Single source of truth for infrastructure configs
#   - Automatic deployment on config changes
#   - Validation and backup before deployment
#   - Multi-environment support (staging/production)
# ============================================================================

terraform {
  required_version = ">= 1.0"
}

# ============================================================================
# Local Variables - Configuration Management
# ============================================================================

locals {
  # Extract filenames from source paths (e.g., "ectropy-staging.conf")
  site_config_filename = basename(var.nginx_site_conf_path)

  # Infrastructure config files to deploy
  # ROOT CAUSE #180 FIX: Dynamic validation (not hardcoded staging values)
  nginx_config_files = {
    "main.conf" = {
      source_path      = var.nginx_main_conf_path
      dest_path        = "${var.deployment_path}/infrastructure/nginx/main.conf"
      validation_lines = length(split("\n", file(var.nginx_main_conf_path)))  # Dynamic: actual source file line count
    }
    "site.conf" = {
      source_path      = var.nginx_site_conf_path
      dest_path        = "${var.deployment_path}/infrastructure/nginx/${local.site_config_filename}"
      validation_lines = length(split("\n", file(var.nginx_site_conf_path)))  # Dynamic: actual source file line count (staging=623, production=474)
    }
  }

  # Calculate combined hash of all config files for change detection
  config_hash = sha256(join("", [
    filesha256(var.nginx_main_conf_path),
    filesha256(var.nginx_site_conf_path)
  ]))

  # ROOT CAUSE #181 FIX: Dynamic minimum thresholds (80% of expected)
  # Prevents false positives for environment-specific file sizes
  min_main_lines = floor(local.nginx_config_files["main.conf"].validation_lines * 0.8)
  min_site_lines = floor(local.nginx_config_files["site.conf"].validation_lines * 0.8)

  # Timestamp for deployment tracking
  deployment_timestamp = timestamp()
}

# ============================================================================
# Null Resource - Infrastructure Config Deployment
# ============================================================================
# Triggers: Hash-based (redeploys only when config content changes)
# Pattern: Similar to compose-deployment and env-deployment modules
# ============================================================================

resource "null_resource" "infrastructure_deployment" {
  # Trigger deployment when:
  #   1. Config file content changes (config_hash)
  #   2. Droplet is recreated (droplet_id)
  #   3. Deployment path changes (deployment_path)
  triggers = {
    config_hash      = local.config_hash
    droplet_id       = var.droplet_id
    deployment_path  = var.deployment_path
  }

  # =========================================================================
  # Provisioner 1: Deployment Banner
  # =========================================================================
  provisioner "local-exec" {
    command = <<-EOT
      echo "========================================="
      echo "TERRAFORM INFRASTRUCTURE DEPLOYMENT"
      echo "ROOT CAUSE #156: Nginx Config GitOps"
      echo "========================================="
      echo ""
      echo "📦 Deploying infrastructure configs..."
      echo "   Environment: ${var.environment}"
      echo "   Deployment path: ${var.deployment_path}"
      echo "   Config hash: ${local.config_hash}"
      echo ""
    EOT
  }

  # =========================================================================
  # Provisioner 2: Create Directory Structure
  # =========================================================================
  connection {
    type        = "ssh"
    user        = "root"
    host        = var.droplet_ip
    private_key = var.ssh_private_key
  }

  provisioner "remote-exec" {
    inline = [
      "echo '🗂️  Creating directory structure...'",
      "mkdir -p ${var.deployment_path}/infrastructure/nginx",
      "mkdir -p ${var.deployment_path}/backups",
      "echo '✅ Directories created'"
    ]
  }

  # =========================================================================
  # Provisioner 3: Backup Existing Configs (if present)
  # =========================================================================
  provisioner "remote-exec" {
    inline = [
      "echo '💾 Backing up existing configs...'",
      "BACKUP_DIR=${var.deployment_path}/backups/infrastructure-$(date +%Y%m%d-%H%M%S)",
      "if [ -d ${var.deployment_path}/infrastructure/nginx ]; then",
      "  mkdir -p $BACKUP_DIR",
      "  cp -r ${var.deployment_path}/infrastructure/nginx $BACKUP_DIR/ 2>/dev/null || true",
      "  echo \"✅ Backup created: $BACKUP_DIR\"",
      "else",
      "  echo 'ℹ️  No existing configs to backup'",
      "fi"
    ]
  }

  # =========================================================================
  # Provisioner 3.5: Clean Up Directories (ROOT CAUSE #156 fix)
  # =========================================================================
  # Remove any directories with same names as config files
  # This fixes the issue where directories were created instead of files
  provisioner "remote-exec" {
    inline = [
      "echo '🧹 Removing incorrect directory structures...'",
      "if [ -d ${var.deployment_path}/infrastructure/nginx/main.conf ]; then",
      "  rm -rf ${var.deployment_path}/infrastructure/nginx/main.conf",
      "  echo '   Removed directory: main.conf/'",
      "fi",
      "if [ -d ${var.deployment_path}/infrastructure/nginx/${local.site_config_filename} ]; then",
      "  rm -rf ${var.deployment_path}/infrastructure/nginx/${local.site_config_filename}",
      "  echo '   Removed directory: ${local.site_config_filename}/'",
      "fi",
      "echo '✅ Cleanup complete'"
    ]
  }

  # =========================================================================
  # Provisioner 4: Deploy main.conf
  # =========================================================================
  provisioner "file" {
    source      = var.nginx_main_conf_path
    destination = "${var.deployment_path}/infrastructure/nginx/main.conf"
  }

  # =========================================================================
  # Provisioner 5: Deploy site-specific config
  # =========================================================================
  # Deploy with source filename (e.g., ectropy-staging.conf)
  provisioner "file" {
    source      = var.nginx_site_conf_path
    destination = "${var.deployment_path}/infrastructure/nginx/${local.site_config_filename}"
  }

  # =========================================================================
  # Provisioner 6: Validation
  # =========================================================================
  # Note: sites-enabled directory not needed - docker-compose mounts files directly
  # =========================================================================
  provisioner "remote-exec" {
    inline = [
      "echo '🔍 Verifying deployment...'",

      # Validate main.conf (ROOT CAUSE #181: Dynamic minimum = 80% of expected)
      "MAIN_LINES=$(wc -l < ${var.deployment_path}/infrastructure/nginx/main.conf)",
      "echo \"   main.conf lines: $MAIN_LINES (expected: ${local.nginx_config_files["main.conf"].validation_lines}, minimum: ${local.min_main_lines})\"",
      "if [ $MAIN_LINES -lt ${local.min_main_lines} ]; then",
      "  echo '❌ ERROR: main.conf too short (possible corruption)'",
      "  exit 1",
      "fi",

      # Validate site config (ROOT CAUSE #181: Dynamic minimum = 80% of expected)
      "SITE_LINES=$(wc -l < ${var.deployment_path}/infrastructure/nginx/${local.site_config_filename})",
      "echo \"   ${local.site_config_filename} lines: $SITE_LINES (expected: ${local.nginx_config_files["site.conf"].validation_lines}, minimum: ${local.min_site_lines})\"",
      "if [ $SITE_LINES -lt ${local.min_site_lines} ]; then",
      "  echo '❌ ERROR: ${local.site_config_filename} too short (possible corruption)'",
      "  exit 1",
      "fi",

      # Check file permissions
      "chmod 644 ${var.deployment_path}/infrastructure/nginx/*.conf",

      "echo '✅ Infrastructure configs validated successfully'"
    ]
  }

  # =========================================================================
  # Provisioner 7: Nginx Reload (ROOT CAUSE #162)
  # =========================================================================
  # Zero-downtime nginx reload following industry best practices
  # Pattern: Same as compose-deployment (auto_start_services) and
  #          env-deployment (auto_restart_services) modules
  # Solution: Conditional reload - checks if container exists before reload
  #           (works for both initial deployment and config updates)
  # =========================================================================
  provisioner "remote-exec" {
    inline = concat(
      [
        "echo ''",
        "echo '🔄 Nginx Reload Phase...'",
      ],
      var.auto_reload_nginx ? [
        "# Check if nginx container exists and is running",
        "if docker ps --filter name=${var.nginx_container_name} --filter status=running -q | grep -q .; then",
        "  echo '✅ Nginx container found (${var.nginx_container_name}), performing reload...'",
        "  echo ''",
        "  # Phase 1: Pre-Reload Validation",
        "  echo '📋 Step 1/3: Testing nginx configuration inside container...'",
        "  if docker exec ${var.nginx_container_name} nginx -t 2>&1; then",
        "    echo '✅ Nginx configuration test passed'",
        "  else",
        "    echo '❌ ERROR: Nginx configuration test failed'",
        "    echo 'Config files deployed but not valid (nginx will use previous config)'",
        "    exit 1",
        "  fi",
        "  echo ''",
        "  # Phase 2: Zero-Downtime Reload",
        "  echo '🔄 Step 2/3: Reloading nginx (zero-downtime graceful reload)...'",
        "  if docker exec ${var.nginx_container_name} nginx -s reload 2>&1; then",
        "    echo '✅ Nginx reloaded successfully'",
        "  else",
        "    echo '❌ ERROR: Nginx reload failed'",
        "    echo 'Nginx still running with previous configuration'",
        "    exit 1",
        "  fi",
        "  echo ''",
        "  # Phase 3: Post-Reload Validation",
        "  echo '🔍 Step 3/3: Validating nginx container health...'",
        "  sleep 2  # Brief pause for reload to complete",
        "  if docker ps --filter name=${var.nginx_container_name} --filter status=running --format '{{.Names}}' | grep -q ${var.nginx_container_name}; then",
        "    echo '✅ Nginx container healthy after reload'",
        "    echo '📊 Container status:'",
        "    docker ps --filter name=${var.nginx_container_name} --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'",
        "    echo ''",
        "    echo '✅ Nginx configuration applied successfully'",
        "  else",
        "    echo '❌ ERROR: Nginx container not running after reload'",
        "    exit 1",
        "  fi",
        "else",
        "  echo 'ℹ️  Nginx container not running (${var.nginx_container_name}), skipping reload'",
        "  echo 'Config files deployed → will be applied when container starts'",
        "fi",
      ] : [
        "echo '⚠️  Auto-reload disabled (auto_reload_nginx=false)'",
        "echo 'Manual reload required: docker exec ${var.nginx_container_name} nginx -s reload'",
      ],
      [
        "echo ''",
      ]
    )
  }

  # =========================================================================
  # Provisioner 8: Completion Banner
  # =========================================================================
  provisioner "local-exec" {
    command = <<-EOT
      echo ""
      echo "========================================="
      echo "✅ INFRASTRUCTURE DEPLOYMENT COMPLETE"
      echo "========================================="
      echo ""
      echo "Deployed: ${var.nginx_main_conf_path}"
      echo "Deployed: ${var.nginx_site_conf_path}"
      echo "Hash: ${local.config_hash}"
      echo "Timestamp: ${local.deployment_timestamp}"
      echo ""
    EOT
  }
}
