# Vercel's Ignored Build Step, run from the project's root directory. Vercel
# runs it before installing, so it installs this package alone first, with the
# workspace's pinned pnpm. A failure exits 1, which builds.
here=$(dirname "$0")
pnpm=$(node -p "require('$here/../../package.json').packageManager") || exit 1
npx --yes "$pnpm" install --frozen-lockfile --prod --ignore-scripts --filter @tooling/vercel-ignore || exit 1
exec node "$here/src/bin/ignore.ts"
