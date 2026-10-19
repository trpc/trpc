# Middleware is a function that calls `next({ ctx })` (human)

- Human, 2026-10-15 (Q6.4): "Never". No router-level middleware; put it on a base procedure.
- Human, 2026-10-15 (Q6.5): keep the lifecycle helpers, "at their own export", in `@trpc12/trpc/middleware` ([`entry-points.md`](./entry-points.md)). oRPC has the same four.
- (agent, Q6.1 N-A) `next({ ctx })` extends the context, not `next({ user })`, so `next({ input })` can sit beside it ([`middleware-input.md`](./middleware-input.md)).
- (agent) A middleware may return a `TrpcError` instead of calling `next()`. That short-circuits the call, and the error joins the procedure's error union.
- (agent) `ok(value)` (Q6.2) short-circuits with a value. The resolver doesn't run, but output validation does. The terminal checks the value against the output through a phantom `'~short'` type; without the phantom, `next()`'s results would be inferred as shorts.
- (agent, Q6.3) `t.middleware(fn)` types a standalone middleware against the root; `mapInput` is `next({ input })` ([`middleware-input.md`](./middleware-input.md)). A middleware is a plain function, so the builder checks its requirements through parameter contravariance.
- (agent, Q6.6 M-A, service-providing in v1) Effect middleware: `t.middleware.effect<{ provides?: S }>()(fn)`, or standalone `middleware.effect<{ ctx?, meta?, input?, provides? }>()(fn)`. `next()` returns an `Effect` that requires `provides`, so a body that forgets to provide them doesn't compile. The body's failures join the error union; its requirements join the procedure's services, minus `provides`.
- (agent) `.provide(Service, (opts) => value | Effect)` stays for the common one-service case.
- (agent) `onStart`, `onSuccess`, `onError` and `onFinish` are middleware factories, not hook options. They nest like any middleware, so an `onFinish` added first observes everything after it.
- (agent) The four hooks are generic in the ctx, input and meta their `opts` carry (`onError<TCtx, TInput, TMeta>`). `.use()` infers input and meta from the procedure; ctx stays `unknown` unless given (`onError<{ user: User }>(…)`), because `.use()`'s ctx parameter includes the `$Needs` it infers, and TypeScript can't infer through an unfixed type parameter. A given ctx works like a packaged middleware's needs: a key the procedure lacks becomes a requirement. Before, all three were `unknown`.
- Lives in: `packages/trpc/src/server/procedures/middleware.ts`, `src/middleware/index.ts`.
