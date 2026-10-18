# Type-checking large routers in a monorepo

- **Date:** 2026-10-18
- **Question:** With 1000–5000 procedures, what does a client (and the server) cost to type-check, where does that cost come from, and does the API need to change? Do large apps need several smaller clients?
- **Feeds:** [`large-routers.md`](../decisions/large-routers.md), [`docs/server/large-routers.md`](../../docs/server/large-routers.md), [`examples/monorepo/`](../../examples/monorepo/)
- **Code:** [`next/spikes/big-routers/`](../../spikes/big-routers/)

## Method

`generate.ts` writes a pnpm-style monorepo with `domains` × `perDomain` procedures:

- `packages/base`: `initTrpc`, an `authed` middleware, and a fake ORM (`table<Row>()` with `findMany({ select })`, `findFirst`, `create`, `update`) so outputs are inferred the way they are against Drizzle or Prisma.
- `packages/dN`: files of 10 procedures in 5 rotating shapes (zod input + `findMany` with `select`, `findFirst` + returned `NOT_FOUND`, `authed` mutation, update with `.output()`, list without input). Every field name is unique, so no instantiation is shared.
- `packages/dN-contract`: the same domain as a contract (zod input and output, no resolvers).
- `packages/api`: mounts every domain; `packages/server`: a fetch handler over it.
- `apps/*`: the same calls (every procedure of the first `used` domains, results assigned to annotated variables), differing only in where the router's types come from:

| App            | Router type from                                                          |
| -------------- | ------------------------------------------------------------------------- |
| `source`       | the api package's source (one program, no references)                     |
| `dts`          | the api package's built `.d.ts` (project reference, `tsc -b`)             |
| `pick-dts`     | `Pick<AppRouter, 'd0' \| 'd1'>` from `.d.ts`                              |
| `slice-source` | `{ d0: D0Router; d1: D1Router }` from the domain packages' source         |
| `slice-dts`    | the same, from their `.d.ts`                                              |
| `contract`     | the used domains' contract packages (source)                              |
| `dts-split`    | `dts` with a `splitLink` on `op.path` (the link reads `RouterPaths`)      |
| `dts-tanstack` | `dts` through `@trpc12/tanstack-query` (`queryOptions`/`mutationOptions`) |

Plus `whole-server` (every server package in one `tsconfig`) and `packages/server` (the handler over the api's `.d.ts`). The fixture installs the built `@trpc12/trpc` and `@trpc12/tanstack-query` (`dist/`, with `publishConfig.exports`) so declaration emit names types the way a user's would.

`bench.ts` builds the server packages with `tsc -b --force`, then runs `tsc --extendedDiagnostics --singleThreaded` per project (median of `runs`). Build the packages first (`pnpm build` from `next/`), then:

```sh
cd next/spikes && node big-routers/bench.ts 20 50 2 3   # 1000 procedures
cd next/spikes && node big-routers/bench.ts 50 100 2 1  # 5000 procedures
```

Environment: TypeScript 7.0.2 (`tsc` = tsgo), Node 24.21, 4-vCPU VM.

## Results

### 1000 procedures (20 domains × 50; apps call 100), instantiations and check time

| Project             |            Before | Defs read by index | + flat terminals, lazy issues |
| ------------------- | ----------------: | -----------------: | ----------------------------: |
| `whole-server`      | 1,288,765 / 1.51s |    947,445 / 1.26s |               950,581 / 1.35s |
| `packages/server`   |   542,955 / 0.65s |    125,923 / 0.18s |                63,826 / 0.08s |
| `apps/source`       |   881,555 / 1.20s |    880,670 / 1.28s |               858,679 / 1.60s |
| `apps/dts`          |    74,136 / 0.07s |     73,197 / 0.08s |                22,262 / 0.05s |
| `apps/pick-dts`     |    74,167 / 0.11s |     73,228 / 0.11s |                22,278 / 0.05s |
| `apps/slice-source` |   152,015 / 0.22s |    151,130 / 0.22s |               130,620 / 0.23s |
| `apps/slice-dts`    |    74,136 / 0.11s |     73,197 / 0.11s |                22,303 / 0.05s |
| `apps/contract`     |   126,961 / 0.17s |    124,413 / 0.14s |               104,026 / 0.17s |
| `apps/dts-split`    |   106,996 / 0.12s |    106,057 / 0.12s |                40,338 / 0.07s |
| `apps/dts-tanstack` |   156,831 / 0.15s |    155,892 / 0.15s |                77,941 / 0.11s |

`tsc -b` of the server packages: 2.73s → 2.40s → 1.93s. Check times under 0.2s are noise-level; instantiations are exact.

With the closed client error union ([`closed-client-errors.md`](../decisions/closed-client-errors.md)), which landed after these runs, each call costs a little more: `apps/dts` 25,065, `apps/source` 861,482, `apps/dts-tanstack` 122,424; the server rows are unchanged.

### 5000 procedures (50 domains × 100; apps call 200), with both changes

| Project             |   Types | Instantiations | Memory | Check |
| ------------------- | ------: | -------------: | -----: | ----: |
| `whole-server`      | 856,694 |      4,723,931 | 972 MB | 7.24s |
| `packages/server`   |  33,843 |        315,176 | 267 MB | 0.24s |
| `apps/source`       | 842,026 |      4,136,629 | 952 MB | 6.51s |
| `apps/dts`          |   9,154 |         42,852 | 247 MB | 0.07s |
| `apps/pick-dts`     |   9,165 |         42,868 | 247 MB | 0.05s |
| `apps/slice-source` |  45,656 |        253,470 | 151 MB | 0.29s |
| `apps/slice-dts`    |   9,105 |         42,893 | 121 MB | 0.05s |
| `apps/contract`     |  35,022 |        205,566 | 144 MB | 0.22s |
| `apps/dts-split`    |  37,510 |        123,938 | 259 MB | 0.19s |
| `apps/dts-tanstack` |  27,016 |        152,931 | 266 MB | 0.16s |

`tsc -b` of the server packages: 6.5s. Before the flat terminals (defs already read by index), `packages/server` was 650,210 and `apps/dts` 142,616 instantiations.

### One program (`pnpm bench typecheck`)

The repo's 3,000-procedure benchmark checks server and client in one program, so it measures source mode: 1,266,138 → 1,249,661 instantiations with both changes (check 1.28s → 1.10s, same machine, medians of 3).

## Findings

1. **Reading the server from `.d.ts` is the lever.** `apps/source` re-infers every procedure (4.1M instantiations at 5000); `apps/dts` reads declarations (43k, about 100× fewer). Its cost doesn't grow with the router: the client's mapped type resolves only the keys a file touches.
2. **Smaller clients only help in source mode.** `pick-dts` and `slice-dts` match `dts` exactly. From source, a slice of two domains is 16× cheaper than the whole router, because the program loads only those domains' files.
3. **Contracts load no server code**, but read their zod schemas from source here; built to `.d.ts` they would cost what `slice-dts` does.
4. **Whole-router reads were the server's cost.** `inferRouterContext`, the error and services unions and the client's decoration read each procedure's def. Inferring it as `Procedure<infer D>` checks `D` against `ProcedureDef`, which resolves every field. Micro-measured on 1000 procedures from `.d.ts`: a field read through `infer` 456k instantiations, by index (`P['~trpc']['~types']`) 66k, through an inferred structural pattern 86k.
5. **Declarations printed aliases with their arguments.** `BuildProcedure<TDef, 'query', SplitReturn<$Ret>>` printed as the builder state plus the resolver's return type, so every reader worked each procedure out again. Spelled out at the terminals, declarations print the resolved input and output. That alone printed the expanded zod issue union per procedure (3.2× the `.d.ts` size on a 4 × 20 fixture); `SchemaValidationError<schema>` keeps the schema and resolves the issues when read.
6. **Name the root router's type.** An inferred `appRouter = { d0: d0Router, … }` inlines every domain into the api package's `.d.ts` (868 KB at 1000 procedures) and fails at 5000 with TS7056. `type AppRouter = { d0: D0Router; … }` with `const appRouter: AppRouter` prints references. An `interface` isn't an `AnyRouter` (no index signature).
7. **Declaration emit against the published package failed** for a base procedure exported from its own package (TS2883, `With`/`Unset` not nameable): the build dropped `import type {} from '@trpc12/trpc/internal'` from the entry `.d.ts`. Fixed in `tooling/pack`.
8. **Per-call extras:** `splitLink` over `op.path` adds `RouterPaths` (one walk of the router, ~80k at 5000); TanStack's options add ~0.5k per call.

## Not measured

- Editors (tsserver) resolve project references to source unless `disableSourceOfProjectReferenceRedirect` is set, so the editor's cost is the source cost.
- `lazy()` domains: they print their resolved router in the api's declarations.
