# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.14.0
ENV NODE_ENV=production
RUN corepack enable

# ENTERPRISE FIX (2025-12-17): Robust pnpm installation with retry logic
# Problem: Corepack download of pnpm from npm registry fails on transient network errors
# Solution: Pre-install pnpm with exponential backoff retry before dependency installation
# Pattern: Separates network-dependent download from critical install step
RUN set -e && \
    retry_with_backoff() { \
        local max_attempts=5; \
        local timeout=1; \
        local attempt=1; \
        local exitCode=0; \
        \
        while [ $attempt -le $max_attempts ]; do \
            if "$@"; then \
                return 0; \
            else \
                exitCode=$?; \
            fi; \
            \
            if [ $attempt -lt $max_attempts ]; then \
                echo "Attempt $attempt failed (exit $exitCode). Retrying in ${timeout}s..."; \
                sleep $timeout; \
                timeout=$((timeout * 2)); \
            fi; \
            attempt=$((attempt + 1)); \
        done; \
        \
        echo "Command failed after $max_attempts attempts (exit $exitCode)"; \
        return $exitCode; \
    }; \
    \
    echo "Preparing pnpm@10.14.0 with retry logic..."; \
    retry_with_backoff corepack prepare pnpm@10.14.0 --activate && \
    echo "pnpm prepared successfully, version: $(pnpm --version)"

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api-gateway/package.json apps/api-gateway/

# CRITICAL: Prisma schema must exist before pnpm install
# because package.json postinstall hook runs "prisma generate"
COPY prisma ./prisma

# CRITICAL: Copy packages/ package.json for Phase 3 database package
# Nx build requires workspace packages to exist for lockfile pruning
COPY packages/database/package.json packages/database/

COPY scripts ./scripts
COPY . .

# ENTERPRISE FIX P0: Install build dependencies for native modules (argon2, etc.)
# Alpine Linux requires python3, make, and g++ for node-gyp native compilation
# These tools are ONLY needed at build time, NOT in production runtime
# Security: Build tools removed in production stage (multi-stage build isolation)
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++

# Install dependencies (postinstall will generate Prisma client)
# Native modules (argon2) will compile from source if pre-built binaries unavailable
RUN pnpm install --frozen-lockfile

# Clean up build dependencies to minimize layer size
# Production stage will NOT include these tools
RUN apk del .build-deps

# DIAGNOSTIC: Verify nx.json and project discovery before build
RUN echo "=== DIAGNOSTIC: Verifying Nx Configuration ===" && \
    echo "--- nx.json projects section ---" && \
    cat nx.json | grep -A 30 '"projects"' && \
    echo "--- Nx project discovery ---" && \
    pnpm nx show projects && \
    echo "--- api-gateway project config ---" && \
    pnpm nx show project api-gateway --json | head -20 && \
    echo "=== END DIAGNOSTIC ==="

RUN pnpm nx build api-gateway
# Generate ALL Prisma clients for multi-schema setup (Phase 3 architecture)
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/schema.platform.prisma
RUN npx prisma generate --schema=prisma/schema.shared.prisma
RUN node scripts/ci/prepare-api-gateway-dist.mjs

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Build metadata: Git commit SHA for deployment verification
# Passed from CI via --build-arg BUILD_SHA=${{ github.sha }}
# Used by /health and /livez endpoints to confirm correct image is running
ARG BUILD_SHA=unknown
ARG BUILD_DATE=unknown
ENV BUILD_SHA=${BUILD_SHA}

# OCI Image Spec labels — infrastructure-level metadata queryable via `docker inspect`
# Standard: https://github.com/opencontainers/image-spec/blob/main/annotations.md
LABEL org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/luhtech/Ectropy" \
      org.opencontainers.image.title="ectropy-api-gateway"

# Install curl for health checks, netcat for dependency checks, bash for entrypoint, and pnpm
# ENTERPRISE FIX (2026-02-24): Added bash for app-specific docker-entrypoint.sh (uses bash syntax)
RUN apk add --no-cache curl netcat-openbsd bash && \
    npm install -g pnpm@10.14.0

RUN corepack enable

# ENTERPRISE FIX (2025-12-17): Robust pnpm installation with retry logic (runner stage)
# Problem: Corepack download of pnpm from npm registry fails on transient network errors
# Solution: Pre-install pnpm with exponential backoff retry before dependency installation
# Pattern: Separates network-dependent download from critical install step
RUN set -e && \
    retry_with_backoff() { \
        local max_attempts=5; \
        local timeout=1; \
        local attempt=1; \
        local exitCode=0; \
        \
        while [ $attempt -le $max_attempts ]; do \
            if "$@"; then \
                return 0; \
            else \
                exitCode=$?; \
            fi; \
            \
            if [ $attempt -lt $max_attempts ]; then \
                echo "Attempt $attempt failed (exit $exitCode). Retrying in ${timeout}s..."; \
                sleep $timeout; \
                timeout=$((timeout * 2)); \
            fi; \
            attempt=$((attempt + 1)); \
        done; \
        \
        echo "Command failed after $max_attempts attempts (exit $exitCode)"; \
        return $exitCode; \
    }; \
    \
    echo "Preparing pnpm@10.14.0 with retry logic (runner stage)..."; \
    retry_with_backoff corepack prepare pnpm@10.14.0 --activate && \
    echo "pnpm prepared successfully, version: $(pnpm --version)"

# Copy built application and generated package.json
COPY --from=builder /app/dist/apps/api-gateway ./dist
COPY --from=builder /app/dist/apps/api-gateway/package.json ./package.json

# CRITICAL: Copy pnpm-workspace.yaml for workspace protocol resolution
# pnpm needs workspace config to recognize packages/* as workspace packages
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# CRITICAL: Copy Prisma schema before install
# Prisma client generation requires schema.prisma to exist
COPY --from=builder /app/prisma ./prisma

# CRITICAL: Copy packages/ directory for workspace protocol resolution
# Phase 3 database package (@ectropy/database@workspace:*) requires source code
# pnpm workspace protocol cannot resolve without actual package directory
COPY --from=builder /app/packages ./packages

# Install dependencies from generated package.json
# Cannot use --frozen-lockfile because package.json was modified by prepare script
# and no longer matches the builder stage lockfile
# Cannot use --production because Prisma CLI is devDependency
# Prisma client generation requires the CLI at runtime in containerized environments
RUN pnpm install --no-frozen-lockfile

# Generate ALL Prisma clients for production runtime (Phase 3 multi-schema architecture)
# @prisma/client, @prisma/client-platform, @prisma/client-shared
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/schema.platform.prisma
RUN npx prisma generate --schema=prisma/schema.shared.prisma

# ENTERPRISE FIX (2026-02-24): Use app-specific entrypoint with inline migrations
# ROOT CAUSE: Commit 12151932 added inline migrations to app-specific scripts
# but Dockerfiles still referenced scripts/core/docker-entrypoint.sh
# See: FIVE_WHY_STAGING_502_BACKEND_DOWN_2026-02-24.json
COPY apps/api-gateway/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as non-root user
RUN chown -R node:node /app
USER node

EXPOSE 4000

# HEALTHCHECK: Uses /livez (liveness probe) — zero-dependency, no DB/Redis checks.
# Industry standard: Docker HEALTHCHECK must NOT depend on external services.
# If DB goes down, container stays "healthy" (process is alive) — prevents cascading restarts.
# Full readiness checks (DB, Redis) are done via /health and /api/health endpoints.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/livez', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Diagnostic verification before startup
RUN echo "=== Container Build Verification ===" && \
    node --version && \
    echo "=== Checking build artifacts ===" && \
    ls -la /app && \
    echo "=== Checking main.js ===" && \
    ls -la /app/dist/main.js && \
    echo "=== Checking package.json ===" && \
    cat /app/package.json && \
    echo "=== Checking critical dependencies ===" && \
    (ls /app/node_modules/prom-client 2>/dev/null && echo "✓ prom-client" || echo "✗ prom-client") && \
    (ls /app/node_modules/connect-redis 2>/dev/null && echo "✓ connect-redis" || echo "✗ connect-redis") && \
    (ls /app/node_modules/express 2>/dev/null && echo "✓ express" || echo "✗ express") && \
    (ls /app/node_modules/ioredis 2>/dev/null && echo "✓ ioredis" || echo "✗ ioredis") && \
    (ls /app/node_modules/pg 2>/dev/null && echo "✓ pg" || echo "✗ pg") && \
    echo "=== Node.js runtime test ===" && \
    node -e "console.log('✓ Node.js execution works')" && \
    echo "=== Build verification complete ==="

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
