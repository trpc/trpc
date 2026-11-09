#!/usr/bin/env bash
set -euo pipefail

# Generate bundle composition artifacts for explicitly selected entry files.
#
# Usage:
#   scripts/bundle-analyze.sh [--output-dir <dir>] <file...>

usage() {
  echo "Usage: scripts/bundle-analyze.sh [--output-dir <dir>] <file...>"
}

OUTPUT_DIR="tmp/bundle-analysis"
FILES=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    -o | --output-dir)
      if [ "$#" -lt 2 ]; then
        usage
        exit 1
      fi
      OUTPUT_DIR="$2"
      shift 2
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

cd "$ROOT"

echo "Building current checkout..."
pnpm build

node packages/tools/bundle/src/bin.ts visualize-selected \
  --output-dir "$OUTPUT_DIR" \
  "${FILES[@]}"
