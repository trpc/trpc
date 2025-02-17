run locally with source files

```sh
DEV=1 pnpx tsx path/to/cli.ts

# example
cd examples/minimal-react/client && DEV=1 pnpx tsx ../../../packages/upgrade/src/bin/cli.ts --force --skipTanstackQuery --verbose
```

or compiled

```sh
cd packages/upgrade
pnpm build && pnpm link .

# in an app somewhere
pnpm link @trpc/upgrade && pnpm trpc-upgrade
```
