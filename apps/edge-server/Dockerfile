# syntax=docker/dockerfile:1
# ============================================================================
# Ectropy Edge Server - Dockerfile
# Target Hardware: OnLogic Karbon 521 (Intel Core Ultra, 16+ cores, 16-96GB DDR5)
# Deployment: Construction jobsite edge computing node
# ============================================================================

FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.14.0
ENV NODE_ENV=production
RUN corepack enable

# Robust pnpm installation with retry logic (enterprise pattern)
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
COPY apps/edge-server/package.json apps/edge-server/
COPY libs/iot-edge/package.json libs/iot-edge/

COPY . .

# GitHub Packages auth for @luh-tech scoped packages
ARG LUHTECH_PKG_READ=""

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build edge server
RUN pnpm nx build edge-server

# ============================================================================
# Production stage - minimal runtime
# ============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# curl for health checks, netcat for dependency checks
RUN apk add --no-cache curl netcat-openbsd

# Copy built application
COPY --from=builder /app/dist/apps/edge-server ./dist

# Copy package.json for runtime deps
COPY --from=builder /app/apps/edge-server/package.json ./package.json

# Install only production runtime dependencies (mqtt, ws)
RUN npm install --omit=dev

# Run as non-root user
RUN chown -R node:node /app
USER node

EXPOSE 3004

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3004/health || exit 1

CMD ["node", "dist/main.js"]
