#!/usr/bin/env bash
# Checks whether registry.npmjs.org's Cloudflare edge lets publish-shaped
# requests for the @trpc scope through to npm.
#
# Every request is an unauthenticated PUT with an empty JSON body, so npm itself
# rejects anything that reaches it (401/404) and nothing can be published. A
# Cloudflare block returns its HTML "Sorry, you have been blocked" page instead.
#
# Exits non-zero while any @trpc probe is blocked.
set -uo pipefail

REGISTRY="https://registry.npmjs.org"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
blocked_scope=0
blocked_control=0

probe() {
  local kind="$1" path="$2"
  local headers body code ray verdict
  headers=$(mktemp)
  body=$(mktemp)
  code=$(curl -sS -D "$headers" -o "$body" -w '%{http_code}' \
    -X PUT -H 'content-type: application/json' --data '{}' \
    "$REGISTRY/$path")
  ray=$(grep -i '^cf-ray:' "$headers" | cut -d' ' -f2 | tr -d '\r')
  if grep -q 'Sorry, you have been blocked' "$body"; then
    verdict="BLOCKED by Cloudflare"
    if [ "$kind" = scope ]; then blocked_scope=$((blocked_scope + 1)); else blocked_control=$((blocked_control + 1)); fi
  else
    verdict="reached npm: $(head -c 80 "$body" | tr '\n|' '  ')"
  fi
  printf '%-8s PUT /%-46s %s  ray=%s  %s\n' "$kind" "$path" "$code" "$ray" "$verdict"
  printf '| %s | `PUT /%s` | %s | `%s` | %s |\n' "$kind" "$path" "$code" "$ray" "$verdict" >>"$SUMMARY"
  rm -f "$headers" "$body"
}

{
  echo "## npm registry WAF probe ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo
  echo "| kind | request | status | cf-ray | result |"
  echo "| --- | --- | --- | --- | --- |"
} >>"$SUMMARY"

echo "runner egress IP: $(curl -sS https://api.ipify.org || echo unknown)"

probe scope '@trpc%2fserver'
probe scope '@trpc%2fclient'
probe scope '@trpc%2fdoes-not-exist-waf-probe'
probe scope '%40trpc%2fserver'

probe control '@trpcx%2fserver'
probe control '@TRPC%2fserver'
probe control '@tanstack%2fquery-core'
probe control 'react'
probe control '-/package/@trpc%2fserver/dist-tags/canary'

{
  echo
  echo "@trpc probes blocked: **$blocked_scope / 4**, control probes blocked: **$blocked_control / 5**"
} >>"$SUMMARY"

echo
echo "@trpc probes blocked: $blocked_scope/4, control probes blocked: $blocked_control/5"
if [ "$blocked_scope" -gt 0 ]; then
  echo "::error::registry.npmjs.org is blocking PUT /@trpc/* at the Cloudflare edge; publishing cannot succeed until npm lifts it."
  exit 1
fi
