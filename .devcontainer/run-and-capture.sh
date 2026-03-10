#!/usr/bin/env bash
set -euo pipefail

# .devcontainer/run-and-capture.sh
# Run docker-compose (with sudo fallback), capture config, service status, combined logs,
# per-container logs and health, and save them under .devcontainer/logs/

LOG_DIR=".devcontainer/logs"
mkdir -p "$LOG_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT_PREFIX="$LOG_DIR/ectropy-$TS"

echo "Writing logs to directory: $LOG_DIR"

detect_docker() {
  if command -v docker >/dev/null 2>&1; then
    echo docker
  elif command -v sudo >/dev/null 2>&1 && sudo docker --version >/dev/null 2>&1; then
    echo "sudo docker"
  else
    echo ""
  fi
}

DOCKER_CMD=$(detect_docker)
if [ -z "$DOCKER_CMD" ]; then
  echo "ERROR: Docker client/daemon not available (tried plain docker and sudo docker)." >&2
  echo "If you're in Codespaces, run this script inside an environment with Docker or collect the creation.log." >&2
  exit 2
fi

# Save docker version and info
$DOCKER_CMD --version > "$OUT_PREFIX-docker-version.txt" 2>&1 || true
$DOCKER_CMD info > "$OUT_PREFIX-docker-info.txt" 2>&1 || true

COMPOSE_FILE=".devcontainer/docker-compose.yml"
ENV_FILE=".devcontainer/.env"

# Save parsed compose config
echo "--- docker compose config ---" > "$OUT_PREFIX-compose-config.txt"
$DOCKER_CMD compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config >> "$OUT_PREFIX-compose-config.txt" 2>&1 || true

# Attempt to bring services up (detached)
echo "--- docker compose up (detached) ---" > "$OUT_PREFIX-compose-up.txt"
$DOCKER_CMD compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up --build -d >> "$OUT_PREFIX-compose-up.txt" 2>&1 || true

# Save ps
$DOCKER_CMD compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -a > "$OUT_PREFIX-compose-ps.txt" 2>&1 || true

# Save combined logs
$DOCKER_CMD compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --no-color --timestamps --tail=2000 > "$OUT_PREFIX-compose-logs.txt" 2>&1 || true

# Inspect known container names (best-effort):
containers=("ectropy-postgres-dev" "ectropy-redis-dev" "ectropy-codespaces-dev")
for c in "${containers[@]}"; do
  echo "--- inspect $c health ---" > "$OUT_PREFIX-${c}-inspect.json"
  $DOCKER_CMD inspect --format '{{json .State.Health}}' "$c" > "$OUT_PREFIX-${c}-inspect.json" 2>&1 || true
  echo "--- logs $c (last 500 lines) ---" > "$OUT_PREFIX-${c}-logs.txt"
  $DOCKER_CMD logs --since "10m" "$c" 2>&1 | tail -n 500 > "$OUT_PREFIX-${c}-logs.txt" || true
done

# If Codespaces creation log exists, save a tail
CODESPACES_LOG="/workspaces/.codespaces/.persistedshare/creation.log"
if [ -f "$CODESPACES_LOG" ]; then
  tail -n 1000 "$CODESPACES_LOG" > "$OUT_PREFIX-creation.log.tail" 2>&1 || true
fi

# Final note file
cat > "$LOG_DIR/LAST_RUN" <<EOF
log_prefix: $OUT_PREFIX
files:
  - $OUT_PREFIX-docker-version.txt
  - $OUT_PREFIX-docker-info.txt
  - $OUT_PREFIX-compose-config.txt
  - $OUT_PREFIX-compose-up.txt
  - $OUT_PREFIX-compose-ps.txt
  - $OUT_PREFIX-compose-logs.txt
  - $OUT_PREFIX-ectropy-postgres-dev-inspect.json
  - $OUT_PREFIX-ectropy-postgres-dev-logs.txt
  - $OUT_PREFIX-ectropy-redis-dev-inspect.json
  - $OUT_PREFIX-ectropy-redis-dev-logs.txt
  - $OUT_PREFIX-ectropy-codespaces-dev-inspect.json
  - $OUT_PREFIX-ectropy-codespaces-dev-logs.txt
  - $OUT_PREFIX-creation.log.tail (if exists)
EOF

echo "Wrote logs. Preview the most important combined logs file:"
echo "  $OUT_PREFIX-compose-logs.txt"

echo "Done. You can attach the files in $LOG_DIR or cat them and paste the interesting parts here."
