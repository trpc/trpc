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

# Upgrade Testing 101

A test is a composite of up to 4 files:

- `myTest.tsx` defines a component to transform
- `myTest.snap.tsx` stores the output of the transform using standard vitest snapshot testing
- `myTest.trpc.tsx` (Optional) stores your trpc appRouter config and test server
- `myTest.spec.tsx` (Optional but recommended) a function which will test both the input and transformed components
-
