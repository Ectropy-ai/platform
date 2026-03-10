#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

bash scripts/enterprise-docker-build.sh && docker compose -f docker-compose.production.yml up -d
