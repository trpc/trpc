# Why

This is a dummy repository to ensure that we export the right internal types to make TypeScript inference works in a monorepo and avoid the error:

```sh
error TS2742: The inferred type of 't' cannot be named without a reference to '../../node_modules/@trpc/server/dist/core/internals/mergeRouters.js'. This is likely not portable. A type annotation is necessary.
```

# How

The file [internals.ts](packages/server/src/internals.ts) is used as a proxy to re-export the necessary internal types.

# Test

Run:

```sh
pnpm i
pnpm build
```