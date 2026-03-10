#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

curl -f http://localhost:3000/health || echo 'Health check failed'
