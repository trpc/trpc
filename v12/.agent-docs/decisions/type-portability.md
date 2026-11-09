# Builder types are nameable through `@trpc12/trpc/internal` (human asked)

- The human asked for "No TS2742, ever" (the [brief](./brief.md)) and, on 2026-10-15, for `/internal` to hold only "things we don't want people to use to build integrations on but are needed for typescript" ([`entry-points.md`](./entry-points.md)).
- (agent) The generic aliases inferred procedures and clients reference (`With`, `InputDef`, `Split*`, `ConcatCheck`, `ImplementerDef`, `ImplementedProcedure`, `Step`, `DeclContext`, …) are exported from `@trpc12/trpc/internal`, not from `@trpc12/trpc/server` or `@trpc12/trpc/client`.
- (agent) So are the check-only aliases that `initTrpc` and `t.implement` signatures name, which no user writes: `RootConcatCheck`, `ImplementMetaCheck`, `EveryLeafDeclares` and `TypeError` (the message type, which also shadowed the global `TypeError` when imported). They were on `@trpc12/trpc/server` until 2026-10-19.
- (agent) TypeScript only names a type through an entry point already in the program, so `@trpc12/trpc/server` and `@trpc12/trpc/client` load it with `import type {} from '@trpc12/trpc/internal'`. Emitted declarations then read `import("@trpc12/trpc/internal").With<…>`.
- (agent) The bundler drops that import from the built `.d.ts` (it imports nothing), so `tooling/pack` puts it back after the build, and `pack.test.ts` checks every entry keeps it. Without it, a consumer that emits declarations against the published package (a base procedure like `authed` in its own package) got TS2883 for `With` and `Unset`.
- (agent) They are not tagged `@internal`, so a future `stripInternal` build can't bring back TS2883 ("inferred type cannot be named").
- (agent) `ContractWith` stays in `@trpc12/trpc/contract`, because it is declared in the entry file itself.
- `tooling/portability` emits declarations to catch regressions: routers, contracts, `t.implement()`, `routerType` clients, OpenAPI and every TanStack adapter.
- Lives in: `packages/trpc/src/internal/index.ts`, `src/server/index.ts`, `src/client/index.ts`, `tooling/portability/`, `tooling/pack/pack.ts`.
