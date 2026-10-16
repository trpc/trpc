#!/usr/bin/env bash
set -euo pipefail

# Runs the CI bundle-size comparison locally (see the Bundle job in
# .github/workflows/check.yml): builds the current checkout, builds the base
# ref in a cached git worktree under tmp/, then compares fixture bundle sizes.
#
# Usage: scripts/bundle-compare.sh [base-ref]   (default: main)
#
# The base worktree is reused across runs while it points at the same commit.
# Remove it with: git worktree remove --force tmp/bundle-base

BASE_REF="${1:-main}"
ROOT="$(git rev-parse --show-toplevel)"
BASE_DIR="$ROOT/tmp/bundle-base"
OUTPUT_PATH="$ROOT/tmp/bundle-stats.txt"

cd "$ROOT"

echo "Building current checkout..."
pnpm build

BASE_COMMIT="$(git rev-parse "$BASE_REF")"

if [ -d "$BASE_DIR/packages/effect/dist" ] && [ "$(git -C "$BASE_DIR" rev-parse HEAD)" = "$BASE_COMMIT" ]; then
  echo "Reusing built base worktree at $BASE_DIR ($BASE_REF @ ${BASE_COMMIT:0:8})"
else
  if [ -d "$BASE_DIR" ]; then
    git worktree remove --force "$BASE_DIR"
  fi
  echo "Creating base worktree at $BASE_DIR ($BASE_REF @ ${BASE_COMMIT:0:8})"
  git worktree add --detach "$BASE_DIR" "$BASE_COMMIT"
  echo "Building base checkout..."
  (cd "$BASE_DIR" && pnpm install && pnpm build)
fi

node packages/tools/bundle/src/bin.ts compare \
  --base-dir "$BASE_DIR/packages/tools/bundle/fixtures" \
  --output-path "$OUTPUT_PATH"

echo
cat "$OUTPUT_PATH"
