# `@trpc12/upgrade`

Rewrites a tRPC v11 codebase to v12 where there's one v12 form (imports, `initTRPC`, `TRPCError`, the HTTP links and their `transformer`, `createTRPCContext`, …), keeps your formatting, and prints the rest as `file:line:column` steps. It also rewrites imports of `experimental_*` and `unstable_*` exports, and of `@trpc12/experimental-*` packages, that moved on a stage.

```sh
npx @trpc12/upgrade src          # dry run: what would change, what's left
npx @trpc12/upgrade src --write
```

## Docs

- [The codemod](https://v12.trpc.io/v12/docs/migrations/from-v11/codemod)
- [Migrating from v11](https://v12.trpc.io/v12/docs/migrations/from-v11)

Part of the tRPC v12 preview: until 12.0.0, releases follow semver on `0.x`, and each export's `@stability` says how it is planned to ship ([Stability](https://v12.trpc.io/v12/docs/packages#stability)).
