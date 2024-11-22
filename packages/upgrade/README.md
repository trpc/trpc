run locally with source files

```sh
DEV=1 pnpx tsx path/to/cli.ts
```

or compiled

```sh
cd packages/upgrade
pnpm build && pnpm link .

# in an app somewhere
pnpm link @trpc/upgrade && pnpm trpc-upgrade
```
