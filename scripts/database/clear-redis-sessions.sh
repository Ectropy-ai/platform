#!/bin/bash
# Clear Redis Sessions Script
# This script clears all sessions from Redis to force users to re-authenticate
# Use this after deploying role-related fixes to ensure stale session data is removed

set -e

# Configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

echo "🔴 Redis Session Clearing Tool"
echo "=============================="
echo ""

# Check if redis-cli is available
if ! command -v redis-cli &> /dev/null; then
    echo "❌ Error: redis-cli is not installed"
    echo "   Install with: apt-get install redis-tools (Ubuntu/Debian)"
    echo "             or: brew install redis (macOS)"
    exit 1
fi

# Build redis-cli command
REDIS_CMD="redis-cli -h ${REDIS_HOST} -p ${REDIS_PORT}"
if [ -n "${REDIS_PASSWORD}" ]; then
    REDIS_CMD="${REDIS_CMD} -a ${REDIS_PASSWORD}"
fi

# Test Redis connection
echo "📡 Testing Redis connection..."
if ! ${REDIS_CMD} ping > /dev/null 2>&1; then
    echo "❌ Error: Cannot connect to Redis at ${REDIS_HOST}:${REDIS_PORT}"
    echo "   Check REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD environment variables"
    exit 1
fi
echo "✅ Connected to Redis"
echo ""

# Count sessions before clearing
echo "📊 Checking current sessions..."
SESSION_COUNT=$(${REDIS_CMD} KEYS "sess:*" | wc -l)
echo "   Found ${SESSION_COUNT} sessions in Redis"
echo ""

# Ask for confirmation
read -p "⚠️  Are you sure you want to clear all sessions? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted - No sessions were cleared"
    exit 0
fi

# Clear sessions
echo "🧹 Clearing all sessions..."
${REDIS_CMD} KEYS "sess:*" | xargs -r ${REDIS_CMD} DEL > /dev/null 2>&1 || true

# Verify sessions were cleared
NEW_COUNT=$(${REDIS_CMD} KEYS "sess:*" | wc -l)
CLEARED=$((SESSION_COUNT - NEW_COUNT))

echo ""
echo "✅ Session clearing complete!"
echo "   Cleared: ${CLEARED} sessions"
echo "   Remaining: ${NEW_COUNT} sessions"
echo ""
echo "📝 Next steps:"
echo "   1. Users need to clear their browser cookies"
echo "   2. Users need to log in again with OAuth"
echo "   3. New sessions will have updated role data from database"
echo ""
