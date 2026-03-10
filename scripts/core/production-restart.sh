#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

bash scripts/docker-prod-down.sh
bash scripts/docker-prod-up.sh
