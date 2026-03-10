# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app
# Install pnpm and curl for health checks (curl provides IPv4/IPv6 control via -4 flag)
RUN npm install -g pnpm@10.14.0 && apk add --no-cache curl
ENV NODE_ENV=production
RUN corepack enable

# Accept React app environment variables as build arguments
ARG REACT_APP_SPECKLE_FRONTEND_PORT
ARG REACT_APP_DEMO_SPECKLE_STREAM_ID
ARG REACT_APP_DEMO_SPECKLE_OBJECT_ID
ARG REACT_APP_API_URL
ARG REACT_APP_LOG_LEVEL
# SPRINT 7 (2026-01-23): REACT_APP_SPECKLE_TOKEN REMOVED
# Token is now managed server-side via BFF proxy pattern (IETF recommendation)
# See: apps/mcp-server/data/documentation/apps/web-dashboard-speckle-token-architecture.json
# ENTERPRISE FIX (2026-01-12): Enable Speckle BIM viewer feature
ARG REACT_APP_ENABLE_SPECKLE

# Convert ARGs to ENVs so they're available during build
ENV REACT_APP_SPECKLE_FRONTEND_PORT=$REACT_APP_SPECKLE_FRONTEND_PORT
ENV REACT_APP_DEMO_SPECKLE_STREAM_ID=$REACT_APP_DEMO_SPECKLE_STREAM_ID
ENV REACT_APP_DEMO_SPECKLE_OBJECT_ID=$REACT_APP_DEMO_SPECKLE_OBJECT_ID
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_LOG_LEVEL=$REACT_APP_LOG_LEVEL
# SPRINT 7: REACT_APP_SPECKLE_TOKEN removed - token managed via BFF proxy
ENV REACT_APP_ENABLE_SPECKLE=$REACT_APP_ENABLE_SPECKLE
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web-dashboard/package.json apps/web-dashboard/

# CRITICAL: Prisma schema must exist before pnpm install
# because package.json postinstall hook runs "prisma generate"
COPY prisma ./prisma

COPY scripts ./scripts
COPY . .

# ENTERPRISE FIX P0: Install build dependencies for native modules (argon2, sharp, msgpackr-extract)
# Alpine Linux requires python3, make, and g++ for node-gyp native compilation
# These tools are ONLY needed at build time, NOT in production runtime
# Security: Build tools removed after compilation (production stage has ZERO build dependencies)
# Why needed:
#   - argon2@0.31.2: OWASP-recommended password hashing (superior to bcrypt)
#   - When pre-built binaries unavailable (HTTP 503), node-pre-gyp falls back to source compilation
#   - node-gyp requires Python3 + C++ compiler toolchain for native addon builds
#   - Alpine minimal base image does NOT include these tools by default
# Impact: ~10MB temporary layer size, 0MB in final image (multi-stage build isolation)
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++

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

# Install dependencies (postinstall will generate Prisma client)
# Native modules (argon2, sharp, msgpackr-extract) will compile from source using build tools above
# pnpm already prepared above, this install will use cached version (no network download)
RUN pnpm install --no-frozen-lockfile

# Clean up build dependencies to minimize layer size
# Virtual package (.build-deps) enables complete removal with single command
# Production stage will NOT include these tools (multi-stage build isolation)
RUN apk del .build-deps

# Debug: Print environment variables before build
RUN echo "=== BUILD-TIME ENVIRONMENT VARIABLES ===" && \
    env | grep REACT_APP || echo "No REACT_APP variables found!"

RUN pnpm nx build web-dashboard

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Build metadata: Git commit SHA for deployment verification
# Passed from CI via --build-arg BUILD_SHA=${{ github.sha }}
ARG BUILD_SHA=unknown
ENV BUILD_SHA=${BUILD_SHA}
ARG BUILD_DATE=unknown

# OCI Image Spec labels — infrastructure-level metadata queryable via `docker inspect`
# Standard: https://github.com/opencontainers/image-spec/blob/main/annotations.md
LABEL org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/luhtech/Ectropy" \
      org.opencontainers.image.title="ectropy-web-dashboard"

# Install curl for health checks and serve for static file serving
RUN apk add --no-cache curl \
 && npm install -g serve

# Copy built static files
COPY --from=builder /app/dist/apps/web-dashboard ./web

# Copy serve.json configuration to override default CSP headers
COPY --from=builder /app/apps/web-dashboard/serve.json ./serve.json

# Deploy verification: Static version.json for BUILD_SHA verification (Five Why 2026-02-28)
# Enables pipeline to verify correct frontend build via GET /version.json
# ROOT CAUSE: Deploy gate only checked API gateway /api/health — web-dashboard was blind spot
RUN echo "{\"buildSha\":\"${BUILD_SHA}\",\"service\":\"web-dashboard\",\"builtAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > ./web/version.json

# Change ownership and switch to non-root user
RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/ && curl -f http://localhost:3000/version.json || exit 1

CMD ["serve", "-s", "web", "-c", "/app/serve.json"]
