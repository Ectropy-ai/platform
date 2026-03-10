#!/bin/bash
# Verifies safe removal utility across typical volume paths
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/../.. && pwd)"
source "$PROJECT_ROOT/scripts/security/utils/safe-cleanup.sh"

TMP_BASE="$PROJECT_ROOT/tests/tmp-volume"
volume_paths=("database/init" "logs" "test-results")

rm -rf "$TMP_BASE"
mkdir -p "$TMP_BASE"

for rel in "${volume_paths[@]}"; do
  path="$TMP_BASE/$rel"
  mkdir -p "$path"
  touch "$path/file.txt"
  if ! safe_remove "$path"; then
    echo "failed to remove $path" >&2
    exit 1
  fi
  if [[ -d "$path" ]]; then
    echo "$path still exists" >&2
    exit 1
  fi
  echo "removed $path"
done

echo "safe-cleanup test passed"
