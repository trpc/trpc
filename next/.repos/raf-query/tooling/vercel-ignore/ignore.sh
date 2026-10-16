#!/bin/sh
# Vercel's "Ignored Build Step", run from a project's root directory: exit 0
# skips the deployment, 1 builds it. It runs before Vercel's install, with
# Vercel's own pnpm, which can't read this repo's lockfile. So install the
# step's runtime dependencies with the pnpm in `packageManager`, then run it.
# Any failure builds.
here=$(dirname "$0")
pnpm=$(node -p "require('$here/../../package.json').packageManager") || exit 1
npx --yes "$pnpm" install --frozen-lockfile --prod --ignore-scripts --filter @tooling/vercel-ignore || exit 1
exec node "$here/src/bin/ignore.ts"
