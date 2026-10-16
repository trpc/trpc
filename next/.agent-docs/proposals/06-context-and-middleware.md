# 06 — Context and middleware

| Status     | Area   | Depends on | oRPC parity rows                                                                                |
| ---------- | ------ | ---------- | ----------------------------------------------------------------------------------------------- |
| `proposed` | server | 02, 03, 07 | — (oRPC extras: built-in lifecycle middleware, dependent context, output short-circuit, dedupe) |

## Summary

Decide how context is created and extended, what middleware receives and returns, how reusable middleware declares its requirements, and how Effect middleware fits in.

**Recommendation:**

- Keep the `ctx` name and the `next({ ctx })` shape.
- `next()` keeps returning a result instead of throwing.
- Add an `ok()` short-circuit and lifecycle helpers.
- Add standalone middleware that declares its requirements.
- No router-level middleware in v1.

## Today (v11)

- `createContext({ req, res | resHeaders, info })` is passed to each adapter. Context is created once per HTTP request and shared by every call in a batch.
- `t.middleware(async ({ ctx, input, getRawInput, meta, path, type, signal, batchIndex, next }) => next({ ctx: { user } }))`.
- `next()` returns `MiddlewareResult` (`{ ok: true, data } | { ok: false, error }`) and does not throw. Middleware **must** return the result of `next()`; this is enforced by a type marker, so short-circuiting with your own data is impossible.
- Reusable middleware: `t.middleware` (bound to one `t`), `experimental_standaloneMiddleware` (deprecated), `.concat(procedure)` and `.unstable_pipe`.
- No router-level middleware. Base procedures (`protectedProcedure`) are the pattern.

## Goals

- Keep the familiar shape: `.use(async ({ ctx, next }) => next({ ctx: { user } }))`.
- Reusable middleware that libraries can publish without access to the app's `t`.
- Allow caching and short-circuit middleware.
- Effect users can write middleware as Effects and provide services.
- Typed errors from middleware flow to the client (07).

## Decision areas

### (a) Context creation

```ts
createHandler({
  router: appRouter,
  createContext: async ({ request, info }) => ({
    user: await getUser(request.headers),
  }),
});
```

- `createContext` receives the web `Request` and `info` (`{ calls: [{ path, type }], connectionParams, signal }`), plus adapter extras (Node `req`/`res`, Lambda `event`, …) under a typed `adapter` field.
- It runs once per request (or once per WebSocket connection) and is shared across a batch, as in v11.
- The root declares the shape (`initTRPC<{ ctx: Context }>()`), and the handler checks that `createContext` returns it.

### (b) `next()` arguments

- **N-A — Keep `next({ ctx: { user } })`.** Leaves room for `next({ ctx, input })`.
- **N-B — `next({ user })`** ([#6587](https://github.com/trpc/trpc/pull/6587)). Shorter, but blocks future `next` options.

```ts
// N-A
t.procedure.use(async ({ ctx, next }) =>
  next({ ctx: { user: await getUser(ctx.token) } }),
);
// N-B
t.procedure.use(async ({ ctx, next }) =>
  next({ user: await getUser(ctx.token) }),
);
```

### (c) Middleware results and short-circuiting

```ts
const cache = t.middleware(async ({ path, input, next, ok }) => {
  const hit = await kv.get(key(path, input));
  if (hit) return ok(hit); // short-circuit, typed against the procedure output
  const result = await next();
  if (result.ok) await kv.set(key(path, input), result.data);
  return result;
});
```

- Keep the result object. Add `ok(data)` for short-circuiting.
- With returned errors (07), `return new TRPCError({ code: 'UNAUTHORIZED' })` or `return error(…)` short-circuits with a typed error.

### (d) Standalone, dependency-declaring middleware

```ts
import { middleware } from '@trpc12/trpc/server';

export const withOrg = middleware<{
  ctx: { db: Db };
  input: { orgId: string };
}>()(async ({ ctx, input, next }) =>
  next({ ctx: { org: await ctx.db.org(input.orgId) } }),
);

t.procedure.input(z.object({ orgId: z.string() })).use(withOrg); // OK
t.procedure.use(withOrg); // type error: requires input.orgId and ctx.db
```

- This is the replacement for `experimental_standaloneMiddleware`. It matches oRPC's "dependent context".
- **Open:** oRPC-style `mapInput` (`.use(mw, (input) => input.id)`) to adapt input shapes.

  ```ts
  t.procedure
    .input(z.object({ post: z.object({ orgId: z.string() }) }))
    .use(withOrg, (input) => ({ orgId: input.post.orgId }));
  ```

> **Spike (2026-10-09):** [`notes/middleware-and-input-typing.md`](../notes/middleware-and-input-typing.md).
>
> - Standalone middleware needs no special `.use()` overload. `middleware<{ ctx; input }>()(fn)` is identity, and unmet requirements fail through parameter contravariance with a readable "Property 'orgId' is missing".
> - `mapInput` is an arity overload.
> - `ok(data)` can't be typed at the call site, because the output isn't known yet. The builder collects the short-circuit types and checks them at the terminal, so the error lands on the resolver.

### (e) Composition

- Keep `.concat(otherProcedureBuilder)` and `pipe` (stable, no `unstable_`).

  ```ts
  const authed = t.middleware(async ({ ctx, next }) =>
    next({ ctx: { user: await getUser(ctx.token) } }),
  );
  const authedWithOrg = authed.pipe(async ({ ctx, next }) =>
    next({ ctx: { org: await ctx.db.org(ctx.user.orgId) } }),
  ); // was unstable_pipe

  // auditProcedure: a procedure builder published by a library
  export const orgProcedure = t.procedure
    .use(authedWithOrg)
    .concat(auditProcedure);
  ```

  - **Required ([keep-t-object](../decisions/keep-t-object.md)):** standalone packages must be able to publish plugins this way. A plugin's own `t` declares the ctx and meta it needs, and its middleware and inputs are what it adds.

  > **Spike (2026-10-10):** [`notes/concat-plugins.md`](../notes/concat-plugins.md). `.concat()` works with `initTRPC<{ … }>()`. Requirements are checked against the current ctx (after middleware), and errors name the missing key ("db"), not v11's bare "Context mismatch". Plugin ctx and inputs flow on, plugins compose, and a published plugin's `.d.ts` is flat and readable. Every type a builder can contain must be exported: a private `unique symbol` broke declaration emit (TS2527).

- **Router-level middleware** (`t.router(routes, { use: [mw] })` or oRPC's `os.use(mw).router(…)`):
  - ✅ Frequently requested.
  - ❌ Ordering and duplication problems (oRPC needs a dedupe mechanism), and it is less explicit than base procedures.
  - **Recommendation: not in v1.**

  ```ts
  // router-level middleware (not in v1)
  export const adminRouter = t.router(adminRoutes, { use: [authed] });
  // the same in oRPC
  export const adminRouter = os.use(authed).router({ listUsers, banUser });

  // v1: a base procedure
  const adminProcedure = t.procedure.use(authed);
  export const adminRouter = {
    listUsers: adminProcedure.query(…),
    banUser: adminProcedure.input(…).mutation(…),
  };
  ```

### (f) Lifecycle helpers

`onStart`, `onSuccess`, `onError` and `onFinish` as middleware factories, as in oRPC. They are trivial to provide and remove a lot of boilerplate.

```ts
import { onError, onFinish, onStart, onSuccess } from '@trpc12/trpc/server';

const loggedProcedure = t.procedure
  .use(onStart(({ path }) => log.info('start', path)))
  .use(onSuccess((data, { path }) => log.info('ok', path)))
  .use(onError((error, { path }) => report(error, path)))
  .use(onFinish(() => metrics.increment('calls')));
```

### (g) Effect middleware

- Effect middleware returns an Effect. `next()` must then also be an Effect. Options:
  - **M-A** A separate constructor, `t.middleware.effect(fn)` or `Middleware.effect(fn)`, where `next()` returns an `Effect`.

    ```ts
    // M-A
    const authed = t.middleware.effect(({ ctx, next }) =>
      Effect.gen(function* () {
        const user = yield* verify(ctx.token);
        return yield* next({ ctx: { user } }); // next() returns an Effect
      }),
    );
    ```

  - **M-B** `next()` returns a value that is both `PromiseLike` and yieldable (`yield* next()`) in Effect generators.
    - ✅ No new API.
    - ❌ Too clever; confusing types.

    ```ts
    // M-B: one constructor; the same next() is awaited or yielded
    const timed = t.middleware(async ({ next }) => {
      const start = Date.now();
      const result = await next();
      log.info('took', Date.now() - start);
      return result;
    });
    const authed = t.middleware(({ ctx, next }) =>
      Effect.gen(function* () {
        const user = yield* verify(ctx.token);
        return yield* next({ ctx: { user } });
      }),
    );
    ```

- **Providing services** (the Effect analogue of extending `ctx`):

  ```ts
  const auth = t.middleware.effect(({ next, ctx }) =>
    Effect.gen(function* () {
      const user = yield* verify(ctx.token);
      return yield* next().pipe(Effect.provideService(CurrentUser, user));
    }),
  ); // procedures after this no longer require CurrentUser from the endpoint layer
  ```

  The typing of "removes `CurrentUser` from R" needs a spike. It may land after v1.

> **Spike (2026-10-09):** [`notes/effect-services-typing.md`](../notes/effect-services-typing.md). M-A with a declared `provides` works. `next()` requires the provided services, so a body that forgets to provide them is a type error (the `effect/rpc` `RpcMiddleware` trick). Procedures after the middleware drop the service from `R` and gain the middleware's own `R` and errors. The provided set can't be inferred from `Effect.provideService` on an opaque `next()`.

## Recommendation

- **N-A** (keep `next({ ctx })`).
- Result object plus `ok()` short-circuit.
- Standalone `middleware<{ ctx; input; meta }>()` factory.
- Stable `concat`/`pipe`; no router-level middleware in v1.
- Lifecycle helpers.
- **M-A** for Effect middleware, with service provisioning gated on a type-level spike.

## Questions

- **Q6.1** `next({ ctx: { user } })` (N-A) or `next({ user })` (N-B)?
- **Q6.2** Add `ok(data)` short-circuit for middleware?
- **Q6.3** Standalone `middleware<{ ctx; input; meta }>()` factory as the way to share middleware? Add `mapInput` too?
- **Q6.4** Router-level middleware: never, later or v1?
- **Q6.5** Ship `onStart/onSuccess/onError/onFinish` helpers?
- **Q6.6** Effect middleware via a separate constructor (M-A) or dual-mode `next` (M-B)? Must service-providing middleware be in v1?

## Decision

- **Q6.1:** [ ] N-A · [ ] N-B
- **Q6.2:** [ ] yes · [ ] no
- **Q6.3:** [ ] yes · [ ] no · `mapInput`: [ ] yes · [ ] no
- **Q6.4:** [x] never · [ ] later · [ ] v1 → [middleware](../decisions/middleware.md)
- **Q6.5:** [x] yes, in `@trpc12/trpc/middleware` · [ ] no → [middleware](../decisions/middleware.md)
- **Q6.6:** [ ] M-A · [ ] M-B · services in v1: [ ] yes · [ ] no
- **Notes:**
