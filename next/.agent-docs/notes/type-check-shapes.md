# Type-check cost by procedure shape

2026-10-19. What does each way of writing a procedure cost to type-check in a large router, and what can be cut without loosening the types? Asked by the oRPC-parity answer on type-check speed ("C", [`../decisions/byte-stream-inputs.md`](../decisions/byte-stream-inputs.md)), starting from the thrown-errors work's +22% with `.errors()` ([`../decisions/thrown-errors-and-exhaustive-declarations.md`](../decisions/thrown-errors-and-exhaustive-declarations.md)).

## Method

`pnpm bench shapes [--procedures 1500] [--runs 3] [--only plain,errors]` (`next/tooling/bench/shapes.ts`; `pnpm build` first). For each shape it generates 1,500 procedures in files of 10 (half queries, half mutations, every field name unique so nothing is shared), a fetch handler over the router, and a client file per router file calling each procedure with its result annotated. Each project is checked with `tsc --extendedDiagnostics --singleThreaded` (TypeScript 7.0.2, v12 from its `.d.ts`, `skipLibCheck`), first the server half (routers and handler) and then everything. "Per procedure" subtracts an empty router.

| shape           | each procedure                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `plain`         | `t.procedure.input(S).query((opts) => cond ? error({ code: 'NOT_FOUND' }) : { v })`                                                 |
| `output`        | the same with `.output(S)`                                                                                                          |
| `errors`        | `.input(S).errors({ NOT_FOUND: {}, CONFLICT: { data: S } })`, returning `opts.errors.NOT_FOUND()`                                   |
| `errors+output` | both                                                                                                                                |
| `middleware`    | `authed` (three `.use()`, one returning `UNAUTHORIZED`) plus an inline `.use((opts) => opts.next({ ctx: { … } }))`, then `.input()` |
| `effect`        | `plain` with an `Effect.gen` resolver that `yield*`s the error                                                                      |
| `contract`      | `c.input(S).output(S).errors({ … }).query()` in a contract, implemented through `t.implement(contract)` and `impl.router()`         |

Instantiations, types and memory are the same on every run. Check time moves by about 10% between sessions on this VM (v11's fixed number read 1.15s to 1.30s on the same day), so compare times within one table. Median of 5 runs (3 for `errors` and `effect`, which this work doesn't change).

## Results

Server half, 1,500 procedures. Before is `8605c7637` (the thrown-errors work), after is this work; the pre-thrown-errors column is `946729e18`.

| shape         | instantiations, before → after | types, before → after | memory, before → after | check, before → after | instantiations, pre-thrown-errors |
| ------------- | -----------------------------: | --------------------: | ---------------------: | --------------------: | --------------------------------: |
| plain         |              512,439 → 512,471 |       92,141 → 92,149 |           189 → 189 MB |          0.53 → 0.51s |                           494,417 |
| output        |          1,108,542 → 1,162,580 |     267,840 → 207,855 |           350 → 295 MB |          1.58 → 1.41s |                         1,078,520 |
| errors        |              964,490 → 964,522 |     176,319 → 176,327 |           269 → 269 MB |          0.99 → 0.95s |                           854,924 |
| errors+output |          1,503,130 → 1,521,168 |     344,434 → 287,449 |           423 → 361 MB |          2.20 → 1.82s |                         1,393,564 |
| middleware    |          1,269,432 → 1,508,045 |     164,283 → 161,292 |           257 → 252 MB |          1.13 → 1.13s |                         1,239,386 |
| effect        |              518,650 → 518,682 |       96,802 → 96,810 |           198 → 198 MB |          0.53 → 0.48s |                           500,628 |
| contract      |          2,089,609 → 2,112,145 |     366,169 → 316,684 |           443 → 386 MB |          2.45 → 1.98s |                         2,089,609 |

With the client half (1,500 typed calls more):

| shape         | instantiations, before → after | memory, before → after | check, before → after |
| ------------- | -----------------------------: | ---------------------: | --------------------: |
| plain         |              928,977 → 929,009 |           255 → 255 MB |          0.92 → 0.83s |
| output        |          1,547,578 → 1,601,616 |           416 → 358 MB |          2.05 → 1.70s |
| errors+output |          1,961,662 → 1,979,700 |           493 → 436 MB |          2.51 → 2.14s |
| middleware    |          1,755,018 → 1,978,631 |           319 → 317 MB |          1.58 → 1.51s |
| contract      |          2,416,123 → 2,438,659 |           510 → 457 MB |          2.69 → 2.24s |

Per-step costs, from one-step fixtures (`micro-*`, instantiations per procedure): `.input()` 26, `.output()` 52, `.errors()` 38, an inline `.use(next({ ctx }))` 131 on `t.procedure` and 211 after `authed`; a plain query terminal 203, 518 after `.output()`. A contract leaf costs about 1,000 to implement (280 to reach `impl.f.p`, 670 for the terminal), `impl.router()` 140 more, the handler 170.

## Findings

- **`.output()` cost was union distribution.** The terminals check the resolver's return as `$Ret & OutputConstraint`, and the constraint was `MaybePromise<O | AnyTrpcError> | Effect<O | AnyTrpcError>`. A resolver that returns a value or an error has a union `$Ret`, so the intersection became |`$Ret`| × 4 members per procedure. TypeScript orders union members with `Effect` first, so each returned `TrpcError` (itself a `YieldableError`, an `Effect`) was compared structurally against a fresh `Effect<O | AnyTrpcError>`, pulling in `EffectUnify`, `Variance` and the iterator types. Removing the constraint entirely cut `output` from 227k to 168k instantiations and 0.33s to 0.19s at 300 procedures.
  - The fix (`perf(types): check a resolver's return against the one output form it can be`) keeps the whole union while `$Ret` is inferred (`unknown extends $Ret`), so the resolver's return is still contextually typed and literals stay literal, and then checks each member of `$Ret` against the one form it can be (`TrpcError`, `Effect`, `Promise` or a value). Contract implementations use the same constraint. Every case in the probe (literal outputs from sync, `Promise.resolve`, `Effect.succeed` and `Effect.gen` resolvers; wrong outputs in each form; streamed outputs; the client's output type) passes or fails exactly as before.
  - Error messages now name the one form: `Type '{ status: "c" }' is not assignable to type 'Status'` rather than to the four-member union.
  - Instantiations go up 1 to 5%; types, memory and time go down. The remaining cost is the cross product itself: `$Ret & (AnyTrpcError | O)` still makes `TrpcError & { v }` members, and each instantiates the `TrpcError` class with a new `this`.
- **A ctx-only middleware reopened the error union (a type-safety bug, fixed in `fix(middleware): a middleware that only calls next() adds no errors`).** When every branch of a middleware returns `next()` or `ok()`, TypeScript infers the whole return type into the one naked type variable left in the target union, `$Err` (at the lowest priority, but it is the only candidate). The candidate failed the `AnyTrpcError` bound, so `$Err` became `AnyTrpcError`. Every procedure after `.use((opts) => opts.next({ ctx }))`, or even `opts.next()`, had `AnyTrpcError` in its errors, so the client union took any code, against [`../decisions/granular-errors.md`](../decisions/granular-errors.md). `t.implement(contract).use(ctxOnly)` was a type error unless every leaf declared `AnyTrpcError`.
  - `$Err` is now bounded by `MiddlewareErrors` (`AnyTrpcError` or what `next()` and `ok()` return) and the builder keeps `Extract<$Err, AnyTrpcError>`, in `.use()`, `t.middleware`, `middleware()` and `impl.use()`. Middleware returning anything else is still a type error, and real errors are still inferred (`procedures.test.ts`).
  - It costs the `middleware` shape +19% instantiations (the junk candidate is now carried through the check), with the same check time and slightly less memory. A non-distributive fast path (`[$Err] extends [AnyTrpcError] ? …`) and the bound alone without `Extract` cost the same.
- **The thrown-errors work, re-measured:** against `946729e18`, `.errors()` costs +13% instantiations and +10% memory, `errors+output` +8%, `plain` +4%. `DeclaredCheck` is about a third of the time `.errors()` adds: dropping it gives 0.158s against 0.189s at 300 procedures. Deferring it until `$Ret` is known (`unknown extends $Ret ? unknown : …`) is no cheaper; it's the check itself. With the output change, `errors+output` is now under its pre-thrown-errors time and memory.
- **`pnpm bench typecheck` grew 31% in instantiations** since [`benchmarks.md`](./benchmarks.md) recorded 1,105,592 (`219c819fa`); this work doesn't change it (1,445,822 before and after; its procedures have no `.output()` or middleware). Bisected with `packages/trpc/src` at each commit and today's bench:

  | commit      | change                                                 | v12 instantiations |
  | ----------- | ------------------------------------------------------ | -----------------: |
  | `219c819fa` | recorded                                               |          1,105,592 |
  | `f748d64dd` | input validation issues type their path from the input |  1,217,050 (+111k) |
  | `d8a0b6cbb` | first-class zod and Effect Schema input issues         |   1,266,108 (+49k) |
  | `9be0d7e07` | the closed client error union and `matchError()`       |   1,344,341 (+78k) |
  | `2133a3acc` | defs read by index; then fixes up to `eea472a44`       |   1,327,864 (−17k) |
  | `3c66e70e6` | links declare the link codes they make                 |   1,409,800 (+82k) |
  | `8605c7637` | thrown errors and exhaustive declarations              |   1,445,822 (+36k) |

  Each is a feature a human asked for. On 2026-10-19 the same bench read v12 1.23s / 342 MB, v11 1.19s / 262 MB, oRPC 0.84s / 237 MB: v12 has gone from 10% faster than v11 to level.

- **Tried, no gain:** respelling `With` (`Omit`, homomorphic and `Pick` forms) and a spelled-out `OutputDef` (alias arguments are evaluated eagerly, so worse); an empty-`declared` fast path in `Overwrite` (−2%); changing `ResolverOpts` members; `.output()` checked through a `$Ret extends OutputConstraint` bound (fewer types, 37% more instantiations); `Pick<Terminals, type>` on a contract leaf replaced by a conditional (same); a single `[$Ret] extends [union] ? unknown : …` check (literal outputs lose their contextual type).
- **Pre-existing gap:** an `async` resolver returning a literal object against an output with a literal union (`async () => ({ status: 'a', n: 1 })` for `{ status: 'a' | 'b' }`) is a type error, before and after: the `async` function's contextual return type doesn't reach through `$Ret & …`. `Promise.resolve({ status: 'a' as const })`, sync and Effect resolvers keep the literal.

## Open

- The contract terminal costs more than the builder's (670 against 518 per procedure); `UndeclaredCheck` and `StrictErrors` both compute `SplitReturn<$Ret>`.
- The client half: the link codes and the closed union cost about 53 instantiations per call in `pnpm bench typecheck`.
- An inline `.use()` after a base procedure costs 60% more than on `t.procedure` (211 against 131): `Overwrite` of the accumulated ctx.
