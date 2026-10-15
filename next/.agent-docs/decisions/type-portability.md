# Builder types are exported so inferred types stay nameable (agent)

- `trpcdev/server` and `trpcdev/contract` export the generic aliases inferred procedures reference (`With`, `BuildProcedure`, `InputDef`, `Split*`, `ConcatCheck`, `ImplementerDef`, `ImplementedProcedure`, `ContractWith`, …).
- They are public experimental types, not `@internal`, so a future `stripInternal` build can't bring back TS2883 ("inferred type cannot be named").
- `test/portability` emits declarations to catch regressions: routers, contracts, `t.implement()`, `routerType` clients, OpenAPI and every TanStack adapter.
- Lives in: `packages/trpcdev/src/server/index.ts`, `src/contract/index.ts`, `test/portability/`.
