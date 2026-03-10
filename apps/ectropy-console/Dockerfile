# syntax=docker/dockerfile:1
# Ectropy Console - Platform Administration Interface
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm and curl for health checks
RUN npm install -g pnpm@10.14.0 && apk add --no-cache curl
ENV NODE_ENV=production
RUN corepack enable

# Accept Vite environment variables as build arguments
ARG VITE_GRAFANA_BASE_URL
ARG VITE_API_BASE_URL
ARG VITE_BASE_PATH=/

# Convert ARGs to ENVs so they're available during build
ENV VITE_GRAFANA_BASE_URL=$VITE_GRAFANA_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH

# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/ectropy-console/package.json apps/ectropy-console/

# Copy shared libs that console depends on
COPY libs ./libs

# Copy prisma schema (required for postinstall)
COPY prisma ./prisma

COPY scripts ./scripts
COPY . .

# Install build dependencies for native modules
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++

# Prepare pnpm with retry logic
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

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Clean up build dependencies
RUN apk del .build-deps

# Debug: Print environment variables before build
RUN echo "=== BUILD-TIME ENVIRONMENT VARIABLES ===" && \
    env | grep VITE_ || echo "No VITE_ variables found!"

# Build the console app
RUN cd apps/ectropy-console && pnpm run build

# Production stage
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
      org.opencontainers.image.title="ectropy-console"

# Install curl for health checks and serve for static file serving
RUN apk add --no-cache curl \
 && npm install -g serve

# Copy built static files
COPY --from=builder /app/apps/ectropy-console/dist ./console

# Create serve.json for SPA routing
RUN echo '{"rewrites":[{"source":"**","destination":"/index.html"}],"headers":[{"source":"**","headers":[{"key":"X-Frame-Options","value":"DENY"},{"key":"X-Content-Type-Options","value":"nosniff"}]}]}' > ./serve.json

# Change ownership and switch to non-root user
RUN chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001 || exit 1

CMD ["serve", "-s", "console", "-l", "3001", "-c", "/app/serve.json"]
