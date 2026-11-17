#!/usr/bin/env bash
# Runs the command given as arguments, unless main moves past HEAD before or
# while it runs (superseded.sh): then it doesn't start the command, or stops
# it and its children, and exits 0, since the run for the newer commit
# releases everything. Otherwise it exits with the command's status.
#
# A run only ever stops itself, so neither runs starting out of order nor
# re-running an old run can stop the run for main's tip.
set -euo pipefail

dir=$(dirname "$0")
interval=${SUPERSEDED_INTERVAL:-30}

stopped() {
  echo "::notice::main moved past ${GITHUB_SHA:-HEAD}; stopped. The run for the newer commit releases it."
  exit 0
}

if "$dir/superseded.sh"; then
  stopped
fi

# In its own process group, so stopping it stops what it started.
setsid "$@" &
pid=$!
elapsed=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 1
  elapsed=$((elapsed + 1))
  if ((elapsed % interval == 0)) && "$dir/superseded.sh"; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    wait "$pid" || true
    stopped
  fi
done
wait "$pid"
