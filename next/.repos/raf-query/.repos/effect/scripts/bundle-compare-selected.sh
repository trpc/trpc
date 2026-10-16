#!/usr/bin/env bash
set -euo pipefail

# Compare bundle size for explicitly selected entry files against a base ref.
#
# Usage:
#   scripts/bundle-compare-selected.sh [--base <ref>] [--keep-base] <file...>
#
# The selected files are copied into the base worktree before measurement so the
# report isolates source changes instead of fixture content changes.

usage() {
  echo "Usage: scripts/bundle-compare-selected.sh [--base <ref>] [--keep-base] <file...>"
}

BASE_REF="main"
KEEP_BASE_WORKTREE=false
FILES=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -b | --base)
      if [ "$#" -lt 2 ]; then
        usage
        exit 1
      fi
      BASE_REF="$2"
      shift 2
      ;;
    --keep-base)
      KEEP_BASE_WORKTREE=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --)
      shift
      FILES+=("$@")
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      FILES+=("$1")
      shift
      ;;
  esac
done

if [ "${#FILES[@]}" -eq 0 ]; then
  usage
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
BASE_DIR="$ROOT/tmp/bundle-base"
BASE_STAMP="$BASE_DIR/.bundle-build-stamp"

cleanup() {
  if [ "$KEEP_BASE_WORKTREE" = "false" ] && [ -d "$BASE_DIR" ]; then
    git worktree remove --force "$BASE_DIR"
  fi
}

trap cleanup EXIT

cd "$ROOT"

echo "Building current checkout..."
pnpm build

BASE_COMMIT="$(git rev-parse "$BASE_REF")"

if [ -d "$BASE_DIR/packages/effect/dist" ] &&
  [ -f "$BASE_STAMP" ] &&
  [ "$(git -C "$BASE_DIR" rev-parse HEAD)" = "$BASE_COMMIT" ] &&
  [ "$(cat "$BASE_STAMP")" = "$BASE_COMMIT" ]; then
  echo "Reusing built base worktree at $BASE_DIR ($BASE_REF @ ${BASE_COMMIT:0:8})"
else
  if [ -d "$BASE_DIR" ]; then
    git worktree remove --force "$BASE_DIR"
  fi
  echo "Creating base worktree at $BASE_DIR ($BASE_REF @ ${BASE_COMMIT:0:8})"
  git worktree add --detach "$BASE_DIR" "$BASE_COMMIT"
  echo "Building base checkout..."
  (cd "$BASE_DIR" && pnpm install && pnpm build)
  printf "%s\n" "$BASE_COMMIT" > "$BASE_STAMP"
fi

node packages/tools/bundle/src/bin.ts compare-selected \
  --base-dir "$BASE_DIR" \
  "${FILES[@]}"
