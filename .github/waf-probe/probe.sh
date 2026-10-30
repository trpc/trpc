#!/usr/bin/env bash
set -u

body=$(mktemp)
blocked=0

probe() {
  local method=$1 path=$2
  local code ray
  code=$(curl -s -o "$body" -D "$body.h" -w '%{http_code}' -X "$method" \
    "https://registry.npmjs.org$path" \
    -H 'content-type: application/json' \
    -H 'npm-command: publish' \
    --data '{}')
  if grep -qi cloudflare "$body"; then
    ray=$(grep -i '^cf-ray:' "$body.h" | tr -d '\r' | cut -d' ' -f2)
    printf '%-5s %-60s %s CF-BLOCK (ray %s)\n' "$method" "https://registry.npmjs.org$path" "$code" "$ray"
    blocked=1
  else
    printf '%-5s %-60s %s npm: %s\n' "$method" "https://registry.npmjs.org$path" "$code" "$(head -c 60 "$body")"
  fi
}

# Our packages
echo "Probing our packages"
probe PUT /@trpc%2fclient
probe PUT /@trpc%2fserver
probe PUT /@trpc/client
probe PUT /@trpc%2fdoes-not-exist
echo "---"

# Near misses and controls
echo "Misspelled scopes and other cases"
probe PUT /@trpx%2fclient
probe PUT /@xtrpc%2fclient
probe PUT /trpc
probe PUT /trpc-foo
probe PUT /trpc/
probe PUT /@trpc
probe PUT /@trpc-foo
probe PUT /@trpc/
probe PUT /@tanstack%2freact-query
probe PUT /express
echo "---"

# OIDC token exchange used by trusted publishing
echo "OIDC token exchange probe"
probe POST /-/npm/v1/oidc/token/exchange/package/@trpc%2fclient
echo "---"

rm -f "$body" "$body.h"
exit $blocked
