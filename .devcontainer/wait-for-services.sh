#!/usr/bin/env bash
set -euo pipefail

# wait-for-services.sh - wait for Postgres and Redis to become ready
# Exit code: 0 when both are ready, 1 otherwise

REDIS_WAIT_RETRIES=45
PG_WAIT_RETRIES=45
SLEEP_INTERVAL=4

POSTGRES_HOST=${POSTGRES_HOST:-postgres}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_DB=${POSTGRES_DB:-construction_platform}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-}

REDIS_HOST=${REDIS_HOST:-redis}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_PASSWORD=${REDIS_PASSWORD:-}

log() { echo "[wait-for-services] $*"; }

wait_for_postgres() {
  local attempt=1
  while [ $attempt -le $PG_WAIT_RETRIES ]; do
    if command -v pg_isready >/dev/null 2>&1; then
      if PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
        log "Postgres is ready (host=$POSTGRES_HOST port=$POSTGRES_PORT db=$POSTGRES_DB)"
        return 0
      fi
    else
      # pg_isready not available in PATH yet; try a TCP probe
      if timeout 1 bash -c "</dev/tcp/$POSTGRES_HOST/$POSTGRES_PORT" 2>/dev/null; then
        log "Postgres TCP port open (host=$POSTGRES_HOST port=$POSTGRES_PORT)"
        return 0
      fi
    fi

    log "Postgres not ready yet (attempt $attempt/$PG_WAIT_RETRIES). Sleeping ${SLEEP_INTERVAL}s..."
    attempt=$((attempt + 1))
    sleep $SLEEP_INTERVAL
  done
  log "Postgres did not become ready within the allotted retries."
  return 1
}

wait_for_redis() {
  local attempt=1
  while [ $attempt -le $REDIS_WAIT_RETRIES ]; do
    if command -v redis-cli >/dev/null 2>&1; then
      if [ -n "$REDIS_PASSWORD" ]; then
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; then
          log "Redis is ready (host=$REDIS_HOST port=$REDIS_PORT)"
          return 0
        fi
      else
        if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
          log "Redis is ready (no password configured)"
          return 0
        fi
      fi
    else
      # redis-cli not available; try a TCP probe
      if timeout 1 bash -c "</dev/tcp/$REDIS_HOST/$REDIS_PORT" 2>/dev/null; then
        log "Redis TCP port open (host=$REDIS_HOST port=$REDIS_PORT)"
        return 0
      fi
    fi

    log "Redis not ready yet (attempt $attempt/$REDIS_WAIT_RETRIES). Sleeping ${SLEEP_INTERVAL}s..."
    attempt=$((attempt + 1))
    sleep $SLEEP_INTERVAL
  done
  log "Redis did not become ready within the allotted retries."
  return 1
}

main() {
  log "Waiting for Postgres and Redis to become ready"

  local ok=0

  if ! wait_for_postgres; then
    log "Postgres readiness failed"
    ok=1
  fi

  if ! wait_for_redis; then
    log "Redis readiness failed"
    ok=1
  fi

  if [ $ok -ne 0 ]; then
    log "One or more services failed to become ready"
    return 1
  fi

  log "All services are ready"
  return 0
}

main "$@"
