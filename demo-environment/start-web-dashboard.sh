#!/bin/bash
# Start Web Dashboard for Demo

set -euo pipefail

cd "$(dirname "$0")/.."

echo "📱 Starting Web Dashboard for Demo..."
echo "Dashboard will be available at: http://localhost:4200"

# Check if we should serve built files or dev server
if [ -f "dist/apps/web-dashboard/index.html" ] && [ "${SERVE_BUILT:-false}" = "true" ]; then
  echo "✅ Serving built dashboard..."
  npx http-server dist/apps/web-dashboard -p 4200 -c-1 --cors
else
  echo "✅ Starting development server..."
  exec pnpm nx serve web-dashboard
fi
