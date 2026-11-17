#!/usr/bin/env bash
# Exits 0 if main has a commit after HEAD other than a release commit, so the
# release workflow's run for that commit releases everything this one would.
# Release commits don't count: their runs release nothing.
#
# Fetches main anonymously into its own ref, without FETCH_HEAD, gc or
# maintenance, so it can run while `pnpm release` uses the same checkout.
# If the fetch fails, main counts as not having moved.
set -euo pipefail

ref=refs/remotes/origin/superseded-check
git -c gc.auto=0 -c maintenance.auto=false fetch --quiet --no-tags \
  --no-write-fetch-head origin "+refs/heads/main:$ref" || exit 1
newer=$(git log --format='%ae %s' "HEAD..$ref")
[ -n "$newer" ] &&
  grep -qv '^github-actions\[bot\]@users\.noreply\.github\.com chore: release v' <<<"$newer"
