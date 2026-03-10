#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

npx serve dist/web-dashboard
