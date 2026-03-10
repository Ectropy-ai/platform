#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

docker compose -f .devcontainer/docker-compose.yml up -d
