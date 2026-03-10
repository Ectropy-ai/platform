#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

ts-node apps/api-gateway/src/simple-gateway.ts
