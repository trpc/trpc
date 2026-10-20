# Effect services: S1 vs S2 and service-providing middleware (02 (b), 06 (g))

- **Date:** 2026-10-09
- **Question:** How do inferred (S1) and declared (S2) services compare in type-check cost and error quality? Can Effect middleware (M-A) provide a service so that downstream procedures no longer require it?
- **Feeds:** [02 — Effect integration](../proposals/02-effect-integration.md) (Q2.2), [06 — Context and middleware](../proposals/06-context-and-middleware.md) (Q6.6).
- **Code:** [`next/spikes/effect-services/`](../../spikes/effect-services/). `core.ts` is a `declare`-only prototype, and `effect-services.test-d.ts` (8 type tests) ran in `pnpm test` until the feature shipped; git has it. Typeperf: `node effect-services/bench.ts [n] [runs]` in `next/spikes`. Effect 4.0.2, TypeScript 7.0.2.

## Service-providing middleware (06 (g))

- **The provided set must be declared.** `next().pipe(Effect.provideService(CurrentUser, user))` leaves no trace in the types, because `next()` is opaque when the middleware is defined. Effect's own `effect/rpc` `RpcMiddleware` declares `provides` for the same reason.
- **The body is still checked**, using the `effect/rpc` trick:
  - `next()` is typed `Effect<SuccessValue, never, Provides>`, so it _requires_ the declared services.
  - A middleware body that forgets to provide them returns an Effect that still requires them, and a check turns that into an error on the returned expression:

    ```text
    Type 'Effect<SuccessValue, never, CurrentUser>' is not assignable to type '… & TypeError<"middleware does not provide the services it declares", CurrentUser>'.
    ```

  - `effect/rpc` doesn't need that check, because it fixes the middleware's `R` to a declared `requires`. Here `R` is inferred.

  ```ts
  const auth = t.middleware.effect<{ provides: CurrentUser }>()(({ ctx, next }) =>
    Effect.gen(function* () {
      const user = yield* verify(ctx.token); // requires Clock, may fail with Unauthorized
      return yield* next().pipe(Effect.provideService(CurrentUser, user));
    }),
  );
  t.procedure.use(auth).query(() => /* uses CurrentUser, PostRepo */);
  // procedure services: PostRepo | Clock   errors: Unauthorized
  ```

- **The builder rule** is `services = Exclude<resolver R, provided> | middleware R`. Middleware errors join the procedure's error union.

## S1 vs S2 (02 (b))

Both type check, and both reject a handler `layer` that misses a service. The default `Layer` error is unreadable: `Layer` is contravariant in `ROut`, so TS elaborates structurally and ends with "Property 'find' is missing in type '{ send: … }'". An explicit `Exclude<Required, Layer.Success<L>>` check names the missing service instead:

```text
Type 'Layer<PostRepo, never, never>' is not assignable to type '… & TypeError<"layer does not provide every required service", Mailer>'.
```

|                                         | S1 inferred                    | S2 declared                                                                                                                                                    |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error for an unprovided service         | at `createHandler` (the layer) | at the resolver that uses it, plus at `createHandler` for any declared service missing from the layer                                                          |
| Unused services                         | not required                   | required, because they are declared                                                                                                                            |
| Where the handler gets the required set | union over the router type     | from the root (`t`). With plain-object routers (08 A), nothing in the router type carries it, so the handler needs `t`, or has to read it off a leaf procedure |

**Typeperf.** 20 services; 1k and 2k Effect procedures (10 per file) that use one or two services each, a third of them behind `auth`. Handler with a 20-service layer. `--extendedDiagnostics --singleThreaded`, median of 5 runs (3 for 2k).

| variant    | procedures |  types | instantiations | memory | check |
| ---------- | ---------: | -----: | -------------: | -----: | ----: |
| `inferred` |       1000 | 17,834 |         67,424 | 128 MB | 0.13s |
| `declared` |       1000 | 17,723 |         62,087 | 128 MB | 0.16s |
| `inferred` |       2000 | 31,005 |        122,339 | 148 MB | 0.25s |
| `declared` |       2000 | 30,694 |        111,430 | 148 MB | 0.23s |

S1's router-wide union costs about 9% more instantiations, and no measurable check time. The proposal's "S1 is expensive" concern doesn't hold at this size. The choice between S1 and S2 is about where errors appear, and about whether the declared set must reach the handler (an 08 interaction), not about speed.

## Implications

- Q6.6: M-A with `provides` is feasible in v1, and its typing is small.
- Q2.2: choose on ergonomics. S1 needs no declarations, and its typing is cheap. S2 gives errors at the resolver but needs the declared set to reach the handler (`createHandler({ t, … })` or a router type that carries it).
