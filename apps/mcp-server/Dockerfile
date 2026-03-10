# Multi-stage build for production artifacts
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files for workspace resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nx.json tsconfig.base.json ./
COPY scripts ./scripts

# Install pnpm using the node_modules approach (more reliable in containers)
RUN npm install -g pnpm@10.14.0

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

# CRITICAL: Prisma schema must exist before pnpm install
# because package.json postinstall hook runs "prisma generate"
COPY prisma ./prisma

# ENTERPRISE FIX: Copy workspace package.json files BEFORE pnpm install
# pnpm needs workspace structure for proper dependency resolution
# Copy app package.json
COPY apps/mcp-server/package.json ./apps/mcp-server/
# Copy all lib package.json files (including nested ones)
COPY libs/ai-agents/package.json ./libs/ai-agents/
COPY libs/ai-agents/shared/package.json ./libs/ai-agents/shared/
COPY libs/auth/package.json ./libs/auth/
COPY libs/blockchain/package.json ./libs/blockchain/
COPY libs/database/package.json ./libs/database/
COPY libs/embeddings/package.json ./libs/embeddings/
COPY libs/ifc-processing/package.json ./libs/ifc-processing/
COPY libs/iot-edge/package.json ./libs/iot-edge/
COPY libs/secrets-management/package.json ./libs/secrets-management/
COPY libs/shared/package.json ./libs/shared/
COPY libs/speckle-integration/package.json ./libs/speckle-integration/
# CRITICAL: Copy packages/ package.json files for Phase 3 database package
# Nx build requires workspace packages to exist for lockfile pruning
COPY packages/database/package.json ./packages/database/

# Install dependencies (postinstall will generate Prisma client)
RUN pnpm install --frozen-lockfile

# Copy source code (package.json already copied above)
COPY apps/mcp-server ./apps/mcp-server
COPY libs ./libs
# CRITICAL: Copy packages/ directory for Phase 3 database package
# Nx build requires workspace packages for dependency resolution and lockfile pruning
COPY packages ./packages
# ENTERPRISE UPDATE (2025-12-16): Copy .roadmap/ directory for V3 roadmap standard
COPY .roadmap ./.roadmap

# Build the application
# Note: data/ directory (decision-log.json, infrastructure-catalog.json, etc.)
# is automatically copied to dist via project.json assets configuration
RUN pnpm nx run mcp-server:build --configuration=production

# Generate ALL Prisma clients for multi-schema setup (Phase 3 architecture)
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/schema.platform.prisma
RUN npx prisma generate --schema=prisma/schema.shared.prisma

# Generate deployment package.json with all dependencies
RUN node scripts/mcp/prepare-mcp-dist.mjs

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for health checks, netcat for dependency checks, bash for scripts, and pnpm
RUN apk add --no-cache curl netcat-openbsd bash jq && \
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

# Copy built artifacts and generated package.json (includes data directory from build)
COPY --from=builder /app/dist/apps/mcp-server ./

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

# Copy scripts directory for truth-baseline and other operational scripts
COPY --from=builder /app/scripts ./scripts

# ENTERPRISE UPDATE (2025-12-16): Copy .roadmap/ directory for V3 roadmap standard
# V3 roadmap provides modular architecture (roadmap.json, boundaries.json, dependencies.json, tech-stack.json)
COPY --from=builder /app/.roadmap ./.roadmap

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

# Copy universal entrypoint script from scripts/core
# ENTERPRISE FIX (2026-02-24): Use app-specific entrypoint with inline migrations
# ROOT CAUSE: Commit 12151932 added inline migrations to app-specific scripts
# but Dockerfiles still referenced scripts/core/docker-entrypoint.sh
# See: FIVE_WHY_STAGING_502_BACKEND_DOWN_2026-02-24.json
COPY apps/mcp-server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Security: Run as non-root user
# Change ownership of app directory
RUN chown -R node:node /app
USER node

# Add health check endpoint test
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health/live || exit 1

# Set environment variables with safe defaults
ENV NODE_ENV=production
ENV MCP_PORT=3001

# Build metadata: Git commit SHA for deployment verification
# Passed from CI via --build-arg BUILD_SHA=${{ github.sha }}
# Used by /health endpoint to confirm correct image is running
ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}
ARG BUILD_DATE=unknown

# OCI Image Spec labels — infrastructure-level metadata queryable via `docker inspect`
# Standard: https://github.com/opencontainers/image-spec/blob/main/annotations.md
LABEL org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/luhtech/Ectropy" \
      org.opencontainers.image.title="ectropy-mcp-server"

ENV MCP_MODE=production

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# Use the main server file
CMD ["node", "main.js"]
