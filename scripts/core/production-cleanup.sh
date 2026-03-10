#!/bin/bash

echo "Production cleanup started"

cleanup_dir() {
  local target="$1"
  if [ -d "$target" ]; then
    if rm -rf "$target"; then
      echo "Removed $target"
    else
      echo "Warning: Could not remove $target" >&2
    fi
  else
    echo "Skipping $target (not present)"
  fi
}

cleanup_dir "database/init"
cleanup_dir "tmp/runtime"
cleanup_dir "dist"

echo "Production cleanup completed"
exit 0
