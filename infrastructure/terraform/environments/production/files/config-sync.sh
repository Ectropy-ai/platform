#!/bin/bash
# ============================================================================
# Config Sync Script - DigitalOcean Spaces Pull Pattern
# ============================================================================
# Purpose: Pull docker-compose.yml and .env from S3, restart services if changed
# Pattern: Zero-SSH deployment via S3-compatible object storage
# Environment: Production
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SPACES_BUCKET="${SPACES_BUCKET:-ectropy-production-configs}"
SPACES_REGION="${SPACES_REGION:-sfo3}"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"
CONFIG_DIR="${CONFIG_DIR:-/opt/ectropy}"
LOG_FILE="${LOG_FILE:-/var/log/config-sync.log}"
BACKUP_DIR="${CONFIG_DIR}/backups"

# S3 object keys (matches config-upload module paths)
COMPOSE_KEY="${COMPOSE_KEY:-production/compose/docker-compose.deploy.yml}"
ENV_KEY="${ENV_KEY:-production.env}"

# Local file paths
COMPOSE_FILE="${CONFIG_DIR}/docker-compose.yml"
ENV_FILE="${CONFIG_DIR}/.env"

# Nginx config S3 keys (match config-upload module paths)
NGINX_MAIN_KEY="${NGINX_MAIN_KEY:-production/nginx/main.conf}"
NGINX_SITE_KEY="${NGINX_SITE_KEY:-production/nginx/ectropy-production.conf}"

# Nginx local paths (match docker-compose volume mounts: ./infrastructure/nginx/)
NGINX_DIR="${CONFIG_DIR}/infrastructure/nginx"
NGINX_MAIN_FILE="${NGINX_DIR}/main.conf"
NGINX_SITE_FILE="${NGINX_DIR}/ectropy-production.conf"

# AWS CLI configuration for DigitalOcean Spaces
export AWS_ENDPOINT_URL="${SPACES_ENDPOINT}"

# ============================================================================
# Logging Functions
# ============================================================================

log_info() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [INFO] $*" | tee -a "${LOG_FILE}" >&2
}

log_warn() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [WARN] $*" | tee -a "${LOG_FILE}" >&2
}

log_error() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [ERROR] $*" | tee -a "${LOG_FILE}" >&2
}

log_success() {
  echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] [SUCCESS] $*" | tee -a "${LOG_FILE}" >&2
}

# ============================================================================
# Validation Functions
# ============================================================================

check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check python3 + boto3 installed (replaces broken AWS CLI v1 on DO droplets)
  # INFRA-NOTE: AWS CLI v1 is broken on Ubuntu 22.04 DigitalOcean droplets.
  # boto3 is the only reliable DigitalOcean Spaces client in this environment.
  # See: LUHTECH-CREDENTIAL-HANDLING-GROUND-TRUTH-2026-04-03.md Part III
  if ! python3 -c "import boto3" &> /dev/null; then
    log_error "python3 with boto3 not installed. Install with: pip3 install boto3"
    exit 1
  fi

  # Check AWS credentials configured
  if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]] || [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
    log_error "AWS credentials not configured. Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    exit 1
  fi

  # Check config directory exists
  if [[ ! -d "${CONFIG_DIR}" ]]; then
    log_warn "Config directory ${CONFIG_DIR} does not exist. Creating..."
    mkdir -p "${CONFIG_DIR}"
  fi

  # Check backup directory exists
  if [[ ! -d "${BACKUP_DIR}" ]]; then
    log_info "Creating backup directory: ${BACKUP_DIR}"
    mkdir -p "${BACKUP_DIR}"
  fi

  log_success "Prerequisites validated"
}

# ============================================================================
# S3 Functions
# ============================================================================

download_from_s3() {
  local s3_key="$1"
  local local_path="$2"
  local temp_path="${local_path}.tmp"

  log_info "Downloading s3://${SPACES_BUCKET}/${s3_key} to ${temp_path}..."

  # INFRA-NOTE: boto3 replaces AWS CLI v1 (broken on Ubuntu 22.04 droplets).
  # Variables expand in bash scope before heredoc passes to Python.
  # Credentials sourced from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  # env vars set in /etc/default/config-sync (same as before).
  if python3 - << PYEOF >> "${LOG_FILE}" 2>&1
import os, boto3, sys
s3 = boto3.client('s3',
    region_name='${SPACES_REGION}',
    endpoint_url='${SPACES_ENDPOINT}',
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID',''),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY','')
)
try:
    s3.download_file('${SPACES_BUCKET}', '${s3_key}', '${temp_path}')
    print('[boto3] Downloaded ${s3_key}')
except Exception as e:
    print(f'[boto3] ERROR: {e}', file=sys.stderr)
    sys.exit(1)
PYEOF
  then
    log_success "Downloaded ${s3_key}"
    echo "${temp_path}"
  else
    log_error "Failed to download ${s3_key} from S3"
    return 1
  fi
}

get_file_hash() {
  local file_path="$1"

  if [[ ! -f "${file_path}" ]]; then
    echo "NONE"
    return 0
  fi

  sha256sum "${file_path}" | awk '{print $1}'
}

# ============================================================================
# Backup Functions
# ============================================================================

create_backup() {
  local file_path="$1"
  local backup_name="$(basename "${file_path}")"
  local timestamp="$(date -u +"%Y%m%d-%H%M%S")"
  local backup_path="${BACKUP_DIR}/${backup_name}.${timestamp}.backup"

  if [[ -f "${file_path}" ]]; then
    log_info "Creating backup: ${backup_path}"
    cp "${file_path}" "${backup_path}"
    log_success "Backup created: ${backup_path}"
  else
    log_warn "No existing file to backup: ${file_path}"
  fi
}

# ============================================================================
# Deployment Functions
# ============================================================================

deploy_config_file() {
  local s3_key="$1"
  local local_path="$2"
  local file_type="$3"

  log_info "Deploying ${file_type} from S3..."

  # Download from S3 to temp file
  local temp_path
  if ! temp_path=$(download_from_s3 "${s3_key}" "${local_path}"); then
    log_error "Failed to download ${file_type} from S3"
    return 1
  fi

  # DEBUG: Log temp_path value
  log_info "DEBUG: temp_path variable = '${temp_path}'"

  # Calculate hashes
  local old_hash=$(get_file_hash "${local_path}")
  local new_hash=$(get_file_hash "${temp_path}")

  log_info "${file_type} hash comparison:"
  log_info "  Current: ${old_hash}"
  log_info "  New:     ${new_hash}"

  # Check if file changed
  if [[ "${old_hash}" == "${new_hash}" ]]; then
    log_info "${file_type} unchanged, skipping deployment"
    rm -f "${temp_path}"
    return 2  # Special code: no changes
  fi

  # COMPOSE VALIDATION GATE (Five Why 2026-02-20):
  # For compose files, validate BEFORE replacing the active file on disk.
  # This prevents an invalid compose file from being written, which would
  # break ALL docker compose commands (ps, up, down) until manually fixed.
  if [[ "${file_type}" == "compose" ]]; then
    log_info "Pre-deploy validation: checking compose file syntax..."
    if ! validate_compose_file "${temp_path}"; then
      log_error "New compose file FAILED validation — keeping current version"
      rm -f "${temp_path}"
      return 1
    fi
    log_success "New compose file passed validation"
  fi

  # Create backup of existing file
  create_backup "${local_path}"

  # Replace file
  log_info "Replacing ${local_path} with new version..."
  mv "${temp_path}" "${local_path}"

  # Set permissions
  if [[ "${file_type}" == "env" ]]; then
    chmod 600 "${local_path}"
    log_info "Set ${local_path} permissions to 0600 (secrets protection)"
  else
    chmod 644 "${local_path}"
    log_info "Set ${local_path} permissions to 0644"
  fi

  log_success "${file_type} deployed successfully"
  return 0  # File changed
}

# ============================================================================
# DOCR Configuration Functions (ROOT CAUSE #2 Fix)
# ============================================================================

deploy_docker_config() {
  # Check if DOCR_CONFIG_JSON environment variable is set
  if [[ -z "${DOCR_CONFIG_JSON:-}" ]]; then
    log_info "DOCR_CONFIG_JSON not set, skipping Docker config deployment"
    return 0
  fi

  # Use /opt/ectropy/.docker instead of /root/.docker
  # CRITICAL: systemd ProtectHome=yes makes /root/ inaccessible
  local docker_config_dir="/opt/ectropy/.docker"
  local docker_config_file="${docker_config_dir}/config.json"

  log_info "Deploying Docker registry configuration..."

  # Create .docker directory if it doesn't exist
  if [[ ! -d "${docker_config_dir}" ]]; then
    log_info "Creating ${docker_config_dir} directory..."
    mkdir -p "${docker_config_dir}"
  fi

  # Write Docker config JSON
  echo "${DOCR_CONFIG_JSON}" > "${docker_config_file}"
  chmod 600 "${docker_config_file}"

  log_success "Docker config deployed to ${docker_config_file} (permissions: 0600)"
  log_info "Registry: registry.digitalocean.com authentication configured"

  return 0
}

# ============================================================================
# Compose Validation Functions (Five Why 2026-02-20: Integrity Chain)
# ============================================================================

validate_compose_file() {
  # Validate compose file syntax and structure BEFORE running docker compose up.
  # This prevents invalid compose files from breaking running services.
  # Reference: .roadmap/FIVE_WHY_DEPLOY_HTTP_000_COMPOSE_INTEGRITY_2026-02-20.json

  local compose_file="$1"

  if [[ ! -f "${compose_file}" ]]; then
    log_error "Compose file not found: ${compose_file}"
    return 1
  fi

  log_info "Validating compose file syntax: ${compose_file}"

  # docker compose config validates YAML syntax, service definitions,
  # dependency chains, resource limits, and volume mounts.
  # Errors on missing .env are expected in validation-only mode but
  # the .env file should exist if deploy_config_file succeeded.
  local validation_output
  if validation_output=$(docker compose -f "${compose_file}" config --quiet 2>&1); then
    log_success "Compose file validation PASSED"
    return 0
  else
    # Check if the only error is missing .env (acceptable if .env hasn't been downloaded yet)
    if echo "${validation_output}" | grep -q "env file.*not found" && \
       ! echo "${validation_output}" | grep -qv -E "level=warning|env file.*not found"; then
      log_warn "Compose validation: .env file not found (expected on first run)"
      return 0
    fi

    log_error "Compose file validation FAILED:"
    echo "${validation_output}" | grep -v "level=warning" >> "${LOG_FILE}" 2>&1
    log_error "Refusing to deploy invalid compose file. Previous version preserved."
    return 1
  fi
}

rollback_config_file() {
  # Restore the most recent backup of a config file.
  # Called when docker compose up fails after deploying a new file.
  # Reference: Five Why Solution 1 — rollback on failure

  local file_path="$1"
  local file_type="$2"
  local backup_name="$(basename "${file_path}")"

  # Find most recent backup
  local latest_backup
  latest_backup=$(ls -t "${BACKUP_DIR}/${backup_name}."*.backup 2>/dev/null | head -1)

  if [[ -z "${latest_backup}" ]]; then
    log_error "No backup found for ${file_type} — cannot rollback"
    return 1
  fi

  log_warn "Rolling back ${file_type} to: ${latest_backup}"
  cp "${latest_backup}" "${file_path}"
  log_success "Rollback complete: ${file_type} restored from backup"
  return 0
}

# ============================================================================
# Service Restart Functions
# ============================================================================

restart_services() {
  log_info "Restarting Docker Compose services..."

  # Ensure docker compose uses DOCR auth from non-home directory
  # (required because ProtectHome=yes blocks /root/.docker/)
  export DOCKER_CONFIG="/opt/ectropy/.docker"

  # VALIDATION GATE (Five Why 2026-02-20): Validate compose file BEFORE restart.
  # This prevents invalid compose files from breaking running services.
  if ! validate_compose_file "${COMPOSE_FILE}"; then
    log_error "Compose validation failed — aborting restart to protect running services"
    rollback_config_file "${COMPOSE_FILE}" "compose"
    return 1
  fi

  # INIT CONTAINER CLEANUP (Five Why 2026-02-23 — Speckle Token Fix):
  # Docker Compose does NOT re-run init containers that exited 0, even when .env changes.
  # Solution: Remove completed init containers before `docker compose up -d` so they
  # always re-run with the latest .env values. These containers are idempotent so
  # re-running is safe.
  # Pattern: Kubernetes always re-runs init containers on pod restart.
  log_info "Removing completed init containers to force re-execution..."
  docker rm -f ectropy-speckle-admin-bootstrap 2>/dev/null || true
  docker rm -f ectropy-speckle-db-init 2>/dev/null || true

  # SURGICAL RESTART (Five Why 2026-02-20): Use --remove-orphans instead of --force-recreate.
  # --force-recreate stops ALL 18 containers for ANY compose change (nuclear option).
  # Without it, docker compose up -d only recreates containers whose config changed.
  # Watchtower handles image updates independently — no need for force-recreate here.
  log_info "Running docker compose up -d --remove-orphans..."
  if docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans 2>> "${LOG_FILE}"; then
    log_success "Services updated successfully"
  else
    log_error "docker compose up failed — rolling back compose file"
    rollback_config_file "${COMPOSE_FILE}" "compose"

    # Attempt recovery with the rolled-back compose file
    log_info "Attempting recovery with previous compose file..."
    if docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans 2>> "${LOG_FILE}"; then
      log_success "Recovery successful — services running with previous config"
    else
      log_error "Recovery also failed — services may be in a degraded state"
    fi
    return 1
  fi

  # Wait for services to stabilize
  log_info "Waiting 10 seconds for services to stabilize..."
  sleep 10

  # Verify services running
  local running_count=$(docker compose -f "${COMPOSE_FILE}" ps --services --filter "status=running" 2>/dev/null | wc -l)
  local total_count=$(docker compose -f "${COMPOSE_FILE}" ps --services 2>/dev/null | wc -l)

  log_info "Services status: ${running_count}/${total_count} running"

  if [[ ${running_count} -ge ${total_count} ]] && [[ ${total_count} -gt 0 ]]; then
    log_success "All services running successfully"
    return 0
  else
    log_warn "Some services not running (${running_count}/${total_count})"
    # Don't rollback here — partial startup may be normal (init containers exit after completion)
    return 0
  fi
}

# ============================================================================
# Health Check Functions
# ============================================================================

check_deployment_lock() {
  local lock_file="${CONFIG_DIR}/.deployment.lock"

  if [[ -f "${lock_file}" ]]; then
    local lock_age=$(($(date +%s) - $(stat -c %Y "${lock_file}")))
    log_warn "Deployment lock exists (age: ${lock_age}s). Skipping sync to avoid conflict with CI/CD deployment."

    # Remove stale locks (>10 minutes old)
    if [[ ${lock_age} -gt 600 ]]; then
      log_warn "Lock is stale (>10 minutes), removing..."
      rm -f "${lock_file}"
      return 0
    fi

    return 1
  fi

  return 0
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
  log_info "=========================================="
  log_info "Config Sync Started (Zero-SSH Pattern)"
  log_info "=========================================="
  log_info "Spaces Bucket: ${SPACES_BUCKET}"
  log_info "Spaces Region: ${SPACES_REGION}"
  log_info "Config Directory: ${CONFIG_DIR}"
  log_info "=========================================="

  # Check prerequisites
  check_prerequisites

  # Deploy Docker registry configuration (ROOT CAUSE #2 Fix)
  # CRITICAL: Must run BEFORE config file deployment to ensure Docker can pull images
  deploy_docker_config

  # Check for deployment lock (CI/CD in progress)
  if ! check_deployment_lock; then
    log_info "Skipping sync due to deployment lock"
    exit 0
  fi

  # Ensure nginx config directory exists (docker-compose mounts ./infrastructure/nginx/)
  mkdir -p "${NGINX_DIR}"

  # Track if any files changed
  local compose_changed=false
  local env_changed=false
  local nginx_changed=false

  # Deploy nginx configs (must exist BEFORE docker compose up starts nginx container)
  if deploy_config_file "${NGINX_MAIN_KEY}" "${NGINX_MAIN_FILE}" "nginx-main"; then
    nginx_changed=true
  elif [[ $? -eq 1 ]]; then
    # INFRA-NOTE: nginx sync failures are non-fatal (Fortune 500 resilience pattern).
    # nginx configs change rarely. .env sync must never be blocked by nginx failures.
    # Independent failure domains: nginx failure → warn only, .env always syncs.
    log_warn "nginx main.conf sync failed — continuing (non-fatal, .env sync will proceed)"
  fi

  if deploy_config_file "${NGINX_SITE_KEY}" "${NGINX_SITE_FILE}" "nginx-site"; then
    nginx_changed=true
  elif [[ $? -eq 1 ]]; then
    # INFRA-NOTE: Same non-fatal pattern as nginx-main above.
    log_warn "nginx site config sync failed — continuing (non-fatal, .env sync will proceed)"
  fi

  # Deploy docker-compose.yml
  if deploy_config_file "${COMPOSE_KEY}" "${COMPOSE_FILE}" "compose"; then
    compose_changed=true
  elif [[ $? -eq 1 ]]; then
    log_error "Failed to deploy docker-compose.yml"
    exit 1
  fi

  # Deploy .env file
  if deploy_config_file "${ENV_KEY}" "${ENV_FILE}" "env"; then
    env_changed=true
  elif [[ $? -eq 1 ]]; then
    log_error "Failed to deploy .env file"
    exit 1
  fi

  # Restart services if any config changed
  if [[ "${compose_changed}" == true ]] || [[ "${env_changed}" == true ]] || [[ "${nginx_changed}" == true ]]; then
    log_info "Configuration changed, restarting services..."

    if restart_services; then
      log_success "Deployment complete - services restarted successfully"
    else
      log_error "Deployment complete - service restart failed"
      exit 1
    fi
  else
    log_info "No configuration changes detected, skipping service restart"
  fi

  # CRITICAL: Even if no configs changed, check if services are actually running.
  # The first run may have downloaded files but failed to start Docker.
  # Without this check, config-sync never retries starting services.
  local running_containers=$(docker compose -f "${COMPOSE_FILE}" ps -q 2>/dev/null | wc -l)
  if [[ ${running_containers} -eq 0 ]] && [[ -f "${COMPOSE_FILE}" ]] && [[ -f "${ENV_FILE}" ]]; then
    log_warn "No Docker containers running but config files exist. Force-starting services..."
    if restart_services; then
      log_success "Services force-started successfully"
    else
      log_error "Failed to force-start services"
      exit 1
    fi
  fi

  log_info "=========================================="
  log_success "Config Sync Complete"
  log_info "=========================================="
}

# Execute main function
main "$@"
