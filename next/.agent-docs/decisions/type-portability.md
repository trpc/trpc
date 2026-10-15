# Builder types are nameable through `trpcdev/internal` (human asked)

- Alex asked for "No TS2742, ever" (`ideas.md`) and, on 2026-10-15, for `/internal` to hold only "things we don't want people to use to build integrations on but are needed for typescript" ([`entry-points.md`](./entry-points.md)).
- (agent) The generic aliases inferred procedures and clients reference (`With`, `BuildProcedure`, `InputDef`, `Split*`, `ConcatCheck`, `ImplementerDef`, `ImplementedProcedure`, `Step`, `DeclContext`, …) are exported from `trpcdev/internal`, not from `trpcdev/server` or `trpcdev/client`.
- (agent) TypeScript only names a type through an entry point already in the program, so `trpcdev/server` and `trpcdev/client` load it with `import type {} from 'trpcdev/internal'`. Emitted declarations then read `import("trpcdev/internal").With<…>`.
- (agent) They are not tagged `@internal`, so a future `stripInternal` build can't bring back TS2883 ("inferred type cannot be named").
- (agent) `ContractWith` stays in `trpcdev/contract`, because it is declared in the entry file itself.
- `test/portability` emits declarations to catch regressions: routers, contracts, `t.implement()`, `routerType` clients, OpenAPI and every TanStack adapter.
- Lives in: `packages/trpcdev/src/internal/index.ts`, `src/server/index.ts`, `src/client/index.ts`, `test/portability/`.
