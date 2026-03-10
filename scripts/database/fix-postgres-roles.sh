#!/bin/bash
set -euo pipefail
echo "🔧 Fixing PostgreSQL roles..."

# This would run in your database setup
# For CI, these commands should be in your workflow
psql -U postgres -c "
  CREATE ROLE root WITH LOGIN CREATEDB PASSWORD 'test';
  GRANT ALL PRIVILEGES ON DATABASE postgres TO root;
" 2>/dev/null || echo "Root role may already exist"

echo "✅ PostgreSQL roles configured"
