#!/usr/bin/env bash
set -euo pipefail

git fetch upstream --prune

read -r local_ahead upstream_ahead < <(
  git rev-list --left-right --count main...upstream/main
)

echo "Lingxi ahead:   $local_ahead"
echo "Upstream ahead: $upstream_ahead"

if [ "$upstream_ahead" -eq 0 ]; then
  echo "✓ Already up to date with upstream."
else
  echo "! Upstream has $upstream_ahead new commit(s)."
  echo "  Create a sync/* branch before merging."
fi
