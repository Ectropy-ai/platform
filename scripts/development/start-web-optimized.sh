#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting Ectropy Web Dashboard with enhanced CI optimization..."

# Change to project root
cd "$(dirname "$0")/.."

# Function for logging with timestamps
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if server is responding
wait_for_server() {
    local port=$1
    local timeout=${2:-240}  # Increase default timeout to 4 minutes for CI
    local start_time=$(date +%s)
    
    log "⏳ Waiting for server on port $port (timeout: ${timeout}s)..."
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -ge $timeout ]; then
            log "❌ Timeout waiting for server after ${elapsed}s"
            return 1
        fi
        
        # Try multiple health check methods
        local server_ready=false
        
        # Method 1: Basic connectivity check
        if curl -f -s "http://localhost:$port" > /dev/null 2>&1; then
            server_ready=true
        # Method 2: Check for specific health endpoint if available
        elif curl -f -s "http://localhost:$port/health" > /dev/null 2>&1; then
            server_ready=true
        # Method 3: Check if port is accepting connections
        elif timeout 5 bash -c "</dev/tcp/localhost/$port" 2>/dev/null; then
            # Port is open, give it a few more seconds for app to be ready
            sleep 5
            if curl -f -s "http://localhost:$port" > /dev/null 2>&1; then
                server_ready=true
            fi
        fi
        
        if [ "$server_ready" = true ]; then
            log "✅ Server is responding on port $port after ${elapsed}s"
            
            # Additional verification for CI environments
            if [ "${CI:-false}" = "true" ]; then
                log "🔍 Performing additional CI health checks..."
                sleep 3
                if curl -f -s "http://localhost:$port" > /dev/null 2>&1; then
                    log "✅ CI health verification passed"
                    return 0
                else
                    log "⚠️  CI health verification failed, retrying..."
                fi
            else
                return 0
            fi
        fi
        
        # Progress indicator every 15 seconds
        if [ $((elapsed % 15)) -eq 0 ] && [ $elapsed -gt 0 ]; then
            log "🕐 Still waiting... ${elapsed}s elapsed (max: ${timeout}s)"
            
            # In CI, provide more detailed progress
            if [ "${CI:-false}" = "true" ]; then
                if ps -p $SERVER_PID > /dev/null 2>&1; then
                    log "📋 Server process is still running (PID: $SERVER_PID)"
                else
                    log "❌ Server process appears to have died"
                    return 1
                fi
            fi
        fi
        
        sleep 2
    done
}

# Pre-flight checks
log "🔍 Running pre-flight checks..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    log "⚠️  node_modules not found, this may cause startup delays"
fi

# Check if dist directory has existing builds
if [ -d "dist/apps/web-dashboard" ]; then
    log "✅ Previous build artifacts found"
else
    log "⚠️  No previous build artifacts found"
fi

# Check available memory and disk space for CI optimization
log "📊 System resources:"
if command -v free >/dev/null 2>&1; then
    free -h | head -2
fi
if command -v df >/dev/null 2>&1; then
    df -h . | tail -1
fi

# Set optimal environment variables for CI
export NODE_ENV=${NODE_ENV:-development}
export NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=1024"
export DISABLE_CHUNK_SPLITTING=${CI:+true}

# CI-specific optimizations
if [ "${CI:-false}" = "true" ]; then
    log "🤖 Detected CI environment, applying optimizations..."
    export DISABLE_ESLINT_PLUGIN=true
    export GENERATE_SOURCEMAP=false
    export FAST_REFRESH=false
    export TSC_COMPILE_ON_ERROR=true
fi

# Start the development server
log "🔧 Starting Nx development server..."

# Create log file for server output
SERVER_LOG="web-server.log"
touch "$SERVER_LOG"

# Use a background process so we can monitor it
if command -v npx >/dev/null 2>&1; then
    log "📋 Server output will be logged to: $SERVER_LOG"
    
    # Start server with comprehensive logging
    npx nx run web-dashboard:serve \
        --host=0.0.0.0 \
        --disable-host-check \
        --poll=2000 \
        ${CI:+--optimization=false} \
        > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
else
    log "❌ npx not available, cannot start server"
    exit 1
fi

log "📋 Server started with PID: $SERVER_PID"

# In CI, monitor server startup more closely
if [ "${CI:-false}" = "true" ]; then
    log "🤖 Monitoring server startup in CI environment..."
    
    # Give the server some time to initialize
    sleep 10
    
    # Check if the process is still running
    if ! ps -p $SERVER_PID > /dev/null 2>&1; then
        log "❌ Server process died during startup"
        log "📋 Last 50 lines of server log:"
        tail -50 "$SERVER_LOG" 2>/dev/null || echo "No log content available"
        exit 1
    fi
    
    log "✅ Server process is healthy during initial startup phase"
fi

# Wait for the server to be ready
if wait_for_server 4200 240; then  # Increased timeout to 4 minutes
    log "🎉 Web dashboard is ready at http://localhost:4200"
    
    # Final health check in CI
    if [ "${CI:-false}" = "true" ]; then
        log "🔍 Performing final CI readiness check..."
        sleep 5
        if curl -f -s "http://localhost:4200" > /dev/null 2>&1; then
            log "✅ Final CI health check passed - server is ready for testing"
        else
            log "❌ Final CI health check failed"
            log "📋 Server log output:"
            tail -100 "$SERVER_LOG" 2>/dev/null || echo "No log content available"
            exit 1
        fi
    fi
    
    # Keep the server running if this script is the main process
    if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
        log "🔄 Keeping server alive (Ctrl+C to stop)..."
        
        # In CI, provide periodic health checks
        if [ "${CI:-false}" = "true" ]; then
            log "🤖 Starting CI health monitoring..."
            while ps -p $SERVER_PID > /dev/null 2>&1; do
                sleep 30
                if ! curl -f -s "http://localhost:4200" > /dev/null 2>&1; then
                    log "⚠️  Health check failed during CI monitoring"
                fi
            done
        else
            wait $SERVER_PID
        fi
    fi
else
    log "❌ Server failed to start within timeout"
    
    # Capture server logs for debugging
    if [ -f "$SERVER_LOG" ]; then
        log "📋 Server startup logs (last 100 lines):"
        tail -100 "$SERVER_LOG"
    fi
    
    if kill -0 $SERVER_PID 2>/dev/null; then
        log "🛑 Terminating server process..."
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    exit 1
fi