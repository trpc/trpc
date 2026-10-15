# Middleware is a function that calls `next({ ctx })` (agent)

- N-A: `next({ ctx })` extends the context.
- A middleware may return a `TRPCError` instead of calling `next()`. That short-circuits the call, and the error joins the procedure's error union.
- `ok(value)` (Q6.2) short-circuits with a value. The resolver doesn't run, but output validation does. The terminal checks the value against the output through a phantom `'~short'` type; without the phantom, `next()`'s results would be inferred as shorts.
- `t.middleware(fn)` types a standalone middleware against the root. A middleware is a plain function, so the builder checks its requirements through parameter contravariance.
- Effect middleware (M-A): `t.middleware.effect<{ provides?: S }>()(fn)`, or standalone `middleware.effect<{ ctx?, meta?, input?, provides? }>()(fn)`. `next()` returns an `Effect` that requires `provides`, so a body that forgets to provide them doesn't compile. The body's failures join the error union; its requirements join the procedure's services, minus `provides`.
- `.provide(Service, (opts) => value | Effect)` stays for the common one-service case.
- `onStart`, `onSuccess`, `onError` and `onFinish` are middleware factories, not hook options. They nest like any middleware, so an `onFinish` added first observes everything after it.
- Lives in: `packages/trpcdev/src/server/middleware.ts`.
