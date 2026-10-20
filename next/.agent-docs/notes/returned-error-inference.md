# Returned-error inference (07's combined model) — types and cost

- **Date:** 2026-10-09
- **Question:** Can the types in 07's combined model be inferred: errors _returned_ from middleware and resolvers, declared error maps, `mapErrors`, the Effect `E` channel, and client narrowing through `safe()`? Where does inference break, and what does it cost on 1k procedures?
- **Feeds:** [07 — Errors](../proposals/07-errors.md) (Q7.1–Q7.3, Q7.7), [02 — Effect](../proposals/02-effect-integration.md) (d) and Q2.3.
- **Code:** [`next/spikes/returned-errors/`](../../spikes/returned-errors/). `core.ts` is a `declare`-only prototype using the names in 07's text (`error()`, `.errors()`, `mapErrors`, `safe()`, `defined`); it is not an API proposal. `returned-errors.test-d.ts` (20 type tests) ran in `pnpm test` until the feature shipped; git has it. Typeperf: `node returned-errors/bench.ts [n] [runs]` in `next/spikes`.

## How the prototype infers errors

- `TRPCError<TCode, TData>` is branded, and `error()` takes `const TCode`, so the code is a literal while `data` keeps normal widening (`{ id: string }`).
- **Resolvers:** `query<$Ret>(fn: (opts) => $Ret)`, then split `Awaited<$Ret>`. `TRPCError` members are errors; everything else is output. `Effect<A, E>` becomes output `A` and errors `E`.
- **Middleware, two strategies:**
  - _whole_: `use<$Ret extends MaybePromise<MiddlewareResult<object> | AnyTRPCError>>`, then `Extract`/infer the ctx.
  - _split_: `useSplit<$Ctx, $Err extends AnyTRPCError = never>(fn: … => MaybePromise<MiddlewareResult<$Ctx> | $Err>)`, letting TS's union inference fill both parameters.
- **Declared map (A):** `.errors({ CODE: { status?, data?: schema } })` adds the members to the union, and the resolver gets typed `errors.CODE()` constructors.
- **Input validation:** `.input()` adds `TRPCError<'BAD_REQUEST', { issues }>` (07 §5).
- **Client:** a `ClientError` is `defined: true` (the typed union) or `defined: false` (built-in codes, `NETWORK`, `CLIENT_ABORTED`; `data: unknown`). The call returns `TRPCPromise<T, E>`, a `Promise<T>` with an optional `'~error'` phantom that `safe()` reads.

## What works

All of these are type tests that pass:

- Resolver returns are split correctly: `Post | TRPCError<'NOT_FOUND', { id: string }>` gives output `Post` and an error member with typed `data`.
- Middleware errors **and** the ctx are inferred from one return. The errors accumulate through `.use().use().query()`. The whole and split strategies infer identical types.
- Errors returned from helpers propagate with an `isTRPCError(x)` guard (`if (isTRPCError(r)) return r`).
- `.output(schema)` still accepts returned errors and still rejects wrong outputs.
- Declared and returned members merge into one union, and identical members dedupe.
- `mapErrors((cause) => … ? error({...}) : undefined)` infers its return union and drops `undefined`. It is plain middleware, so it uses the same `use` signature.
- **Effect:** `return yield* error({...})` and `Effect.catchTag('DbError', () => error({...}))` both infer into the union. **A yieldable `TRPCError` is structurally an `Effect<never, TRPCError>`** (in Effect 4, `Cause.YieldableError` _is_ an Effect). So "returned error" and "Effect failure" are the same rule: `query(() => error(x))` and `query(() => Effect.fail(error(x)))` infer identical errors. That also holds at runtime if A1's detection runs a returned Effect, since a returned `TRPCError` would fail with itself.
- **02 (d.ii) is cheap to enforce and readable.** The resolver's return type is intersected with a check that becomes `Effect<unknown, AnyTRPCError>` when `E` holds anything else. The error lands on the resolver's returned expression:

  ```text
  error TS2322: Type 'Effect<{ id: string; } | undefined, DbError, never>' is not assignable to type '… & Effect<unknown, AnyTRPCError, never>'.
    Type 'DbError' is not assignable to type 'AnyTRPCError'.
  ```

- **Client:** checking `defined` and then `code` narrows `data` (`NOT_FOUND` → `{ id: string }`, `BAD_REQUEST` → `{ issues }`). `inferRouterErrors<AppRouter>['code']` gives the union of all codes. **All three Q7.3 shapes narrow:** `[data, error]`, `[error, data, isDefined]` and `{ data, error }`. Destructured tuples narrow too.

## Pitfalls (each pinned by a test)

1. **`any` outputs.** `any | TRPCError` is `any`. Without a guard, the error union becomes `any`, and the d.ii check then rejects valid code (seen in the first run). With an `IsAny` guard on the _awaited_ return, the output is `any` and the errors are `never`. Either way, returned errors next to an untyped value (`db.findAny()`) are lost.
2. **`unknown`/`{}`/`object` outputs swallow returned errors.** TS reduces subtypes when it infers a return type from several `return`s, and every `TRPCError` is a `{}`/`object`. `if (!row) return error(…); return row` with `row: unknown` narrows `row` to `{}` and infers errors `never`. A type-level fix isn't possible. The ways out are an `.output()` schema, an explicit return annotation, or a lint rule.
3. **Thrown errors are not inferred.** Only declared errors (A) give a typed `throw`. This is how 07 already describes the split.
4. **Same code, different `data` stays two members.** Narrowing by `code` then gives a union of both `data` types.
5. **Narrowing by `code` alone mixes in the unexpected branch**, because unexpected errors carry built-in codes too: `code === 'NOT_FOUND'` without checking `defined` gives `data: unknown`. The alternative is to type unexpected codes as `Exclude<BuiltinCode, DefinedCodes>`, which would make `code` alone narrow but misdescribe an undeclared `NOT_FOUND` thrown at runtime. The narrowing rule should be documented, or `safeErrorFirst`'s `isDefined` used.
6. **The error phantom is lost through `async` wrappers** (and `Promise.all`, `.then`). `safe(wrapped())` silently gives `error: unknown`. Making the phantom required (`'~error': E`) would turn that into a compile error instead.

## Typeperf

1k and 2k procedures over 5 shapes (returns in resolvers, input + custom code, `authed` middleware, declared map, two chained middlewares). The client calls `safe()` on every procedure and narrows `defined` → `code`. Variants:

- `thrown`: the same code with every error thrown, so nothing is inferred. It still pays for the machinery.
- `whole` and `split`: the two middleware strategies.

TypeScript 7.0.2, `--extendedDiagnostics --singleThreaded`, median of 5 runs (3 for 2k).

| variant  | procedures |   types | instantiations | memory | check |
| -------- | ---------: | ------: | -------------: | -----: | ----: |
| `thrown` |       1000 |  86,113 |        351,363 | 204 MB | 0.41s |
| `whole`  |       1000 | 107,286 |        467,967 | 235 MB | 0.57s |
| `split`  |       1000 |  97,086 |        352,767 | 219 MB | 0.48s |
| `thrown` |       2000 | 170,593 |        699,863 | 304 MB | 0.84s |
| `whole`  |       2000 | 211,966 |        932,267 | 366 MB | 1.17s |
| `split`  |       2000 | 191,566 |        701,867 | 332 MB | 0.99s |

- **Split inference is nearly free:** +0.4% instantiations and +18% check time over `thrown`. **Whole-return inference costs +33% instantiations and +41% check time** for identical types. If B is adopted, middleware should infer through separate ctx/error type parameters.
- **The d.ii check costs 7–9% of instantiations** (`thrown` 351k → 329k without it, `whole` 468k → 436k, `split` 353k → 321k) and about 5–10% of check time.
- The `YieldableError` base doesn't cost anything measurable: replacing it with a plain `Error` gave the same numbers within noise.
- Scaling is linear once the harness is fixed. The first client file narrowed 1,000 results at module top level, and that made control-flow analysis quadratic (1.1s → 3.8s from 1k to 2k). Wrapping each call in its own function made it linear. The same applies to generated or test code that narrows many values at a module's top level.
- These absolute numbers are not comparable to [`builder-generics-typeperf.md`](./builder-generics-typeperf.md) (different shapes, and that client doesn't call `safe()`/narrow).

## Inputs for the open questions (not decisions)

- **Q7.1:** B (inferred) and A (declared) compose in one builder slot with no extra generics. The real limits are pitfalls 1–2 (`any`/`unknown` outputs), not the type machinery.
- **Q7.2:** Resolver returns use the same split as middleware returns. Supporting resolvers adds no special cost; the `unknown`/`{}` pitfall applies to both.
- **Q7.3:** All three shapes narrow equally well. `isDefined` in the error-first tuple sidesteps pitfall 5.
- **Q7.7 / Q2.3:** One isomorphic yieldable `TRPCError` gives the cleanest Effect story (returned = failed). But on the client it extends Effect's `YieldableError`, which pulls in Effect's runtime. That cost is already paid if the client runs on Effect ([`effect-client-bundle-size.md`](./effect-client-bundle-size.md)), but not if the client core is Promise-native. d.ii is cheap and gives readable errors.

## Not covered

- Effect-returning _middleware_, `R` (services) inference next to `E`, and errors in subscriptions/streams (14).
- Runtime behaviour (masking, `defined` on the wire, serializing `data`), OpenAPI emission from declared maps (18).
- Hover readability of the error union on deep chains. Emitted `.d.ts` was only spot-checked (`c4: "CONFLICT" | "FORBIDDEN" | undefined`).
