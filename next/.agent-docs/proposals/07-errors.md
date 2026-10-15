# 07 — Errors: typed, returned, declared and inferred

| Status     | Area                 | Depends on | oRPC parity rows                                |
| ---------- | -------------------- | ---------- | ----------------------------------------------- |
| `proposed` | server, client, core | 02, 04, 06 | **End-to-end typesafe errors**, OpenAPI support |

## Summary

`ideas.md` asks that "errors can be returned and inferred". This proposal combines three mechanisms into one model:

1. **Inferred errors.** Errors that are _returned_ (or failed through Effect's `E` channel) from middleware and resolvers are inferred.
2. **Declared errors.** An optional error map provides runtime schemas, typed constructors that can be thrown from deep code, and OpenAPI docs.
3. **Mapping middleware.** Domain errors are turned into typed errors by middleware, which covers v11's per-procedure `.errors()` formatter.

The client sees one discriminated union, with a `defined` flag that separates expected errors from unexpected ones.

## Today (v11)

- `throw new TRPCError({ code, message, cause })`. There are 21 fixed codes mapped to HTTP statuses.
- A global `errorFormatter` shapes every error. Its return type is the client's `error.shape`, the same for every procedure.
- Recently merged ([#7591](https://github.com/trpc/trpc/pull/7591)): per-procedure `.errors((opts) => shape | undefined)` formatters. They run from the tail backwards, decline by returning `undefined`, and the client infers the union of their shapes. `safe()` on the client returns `[data, error]`. See `examples/minimal-per-procedure-errors`.
- Prior experiments:
  - [#5554](https://github.com/trpc/trpc/pull/5554) "infer errors": middleware `return trpcError({...})`, `inferError<typeof proc>`. Used for server actions only.
  - [#7279](https://github.com/trpc/trpc/pull/7279): declared error classes, closed in favour of #7591.
- Unknown thrown errors become `INTERNAL_SERVER_ERROR` **with their original message**. Stacks are only sent in development.

## Goals

- Typed errors without ceremony (inference-first, like outputs).
- Typed errors that can be thrown from deep inside helper code (declaration).
- Domain errors (`RateLimitError`, Prisma errors, Effect tagged errors) mapped once, in middleware, with types.
- Runtime knowledge of possible errors for OpenAPI and docs (18).
- Clients narrow by `code` and get typed `data`. Unexpected errors are clearly separated.
- Safe defaults: unexpected error messages are masked in production.

## Options

### A — Declared error map only (oRPC)

```ts
const byId = t.procedure
  .errors({ NOT_FOUND: { status: 404, data: z.object({ id: z.string() }) } })
  .input(z.object({ id: z.string() }))
  .query(async ({ input, errors }) => {
    const post = await db.post.find(input.id);
    if (!post) throw errors.NOT_FOUND({ data: { id: input.id } });
    return post;
  });
```

- ✅ Runtime schemas (OpenAPI, validation of error data). Throwable from anywhere you can pass `errors`.
- ❌ Every error must be declared up-front. There is no inference from returns. Effect's `E` channel is not used.

### B — Returned and inferred errors only (#5554 revived)

```ts
const authed = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) return error({ code: 'UNAUTHORIZED' }); // inferred, short-circuits
  return next({ ctx: { user: ctx.user } });
});

const byId = authed
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const post = await db.post.find(input.id);
    if (!post) return error({ code: 'NOT_FOUND', data: { id: input.id } });
    return post; // output = Post, errors = UNAUTHORIZED | NOT_FOUND<{ id: string }>
  });
```

- ✅ Zero declarations. Matches tRPC's inference philosophy. Maps 1:1 to Effect's `E` channel (02).
- ✅ Errors added by base-procedure middleware flow into every procedure's union.
- ❌ Errors deep in helpers must be propagated manually (`if (isTRPCError(r)) return r`), unless you use Effect.
- ❌ There is no runtime schema, so OpenAPI only knows codes that someone declared.

### C — Error formatters (v11 #7591 style)

`.errors((opts) => shape | undefined)` claims thrown errors and maps them to typed shapes.

```ts
const rateLimited = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return undefined; // declined: falls through to the global errorFormatter
});
```

- ✅ Already shipped and familiar. Works with thrown domain errors.
- ❌ "Formatter" is a separate concept from middleware. It is shape-centric (`opts.shape`) rather than error-centric, and its types are tied to a global formatter.

### D — Tagged error classes

```ts
class PostNotFound extends TRPCError.Tagged('PostNotFound', {
  code: 'NOT_FOUND',
  data: z.object({ id: z.string() }),
}) {}
t.procedure.errors([PostNotFound]).query(() => {
  throw new PostNotFound({ id });
});
// client: if (error.is('PostNotFound')) …
```

- ✅ Pairs nicely with Effect `Schema.TaggedError`. Classes can be shared.
- ❌ Classes are not useful on the client, which must narrow by tag string anyway. More ceremony than A.

## Proposed combined model (A + B, with mapping middleware replacing C)

**1. One error type**, isomorphic on server and client:

```ts
class TRPCError<TCode extends string = string, TData = unknown> extends Error {
  code: TCode; // built-in ('NOT_FOUND', …) or custom ('PAYMENT_REQUIRED')
  status: number; // default from the built-in code table, or explicit for custom codes
  data: TData;
  defined: boolean; // true if part of the procedure's typed union
}
```

`error({ code, message?, data?, status? })` is the constructor helper. In Effect generators, `TRPCError` is yieldable (`return yield* error({ code: 'NOT_FOUND' })`), using Effect's `YieldableError` pattern.

**2. Inference (B).** An error _returned_ from middleware or a resolver, or failed through an Effect, is added to the procedure's error union. Returned errors short-circuit the chain.

```ts
const byId = t.procedure.input(Schema.Struct({ id: Schema.String })).query(
  Effect.fn('post.byId')(function* ({ input }) {
    const repo = yield* PostRepo;
    const post = yield* repo
      .find(input.id)
      .pipe(
        Effect.catchTag('PostNotFound', () =>
          error({ code: 'NOT_FOUND', data: { id: input.id } }),
        ),
      );
    if (!post.published) return yield* error({ code: 'FORBIDDEN' });
    return post; // errors = NOT_FOUND<{ id: string }> | FORBIDDEN | BAD_REQUEST (input)
  }),
);
```

**3. Declaration (A, optional).**

- `.errors({ CODE: { status?, message?, data?: schema } })` adds to the union, provides typed `errors.CODE()` constructors (throwable, so they are typed even from deep code), validates `data` at runtime, and documents the errors for OpenAPI.
- **Open:** whether declared-only `throw` without returning is enough, or whether the declaration should also _narrow_ what may be returned.

**4. Mapping middleware (replaces C):**

```ts
const withDomainErrors = t.procedure.use(
  mapErrors((cause) => {
    if (cause instanceof RateLimitError)
      return error({
        code: 'TOO_MANY_REQUESTS',
        data: { retryAfterMs: cause.retryAfterMs },
      });
    if (cause instanceof PaymentRequiredError)
      return error({
        code: 'PAYMENT_REQUIRED',
        status: 402,
        data: { plan: cause.plan },
      });
    return undefined; // not handled: stays an unexpected error
  }),
);
```

`mapErrors` is plain middleware. Its return type is inferred into the union, exactly like (2). This reproduces `examples/minimal-per-procedure-errors` without a separate formatter concept.

**5. Built-in typed errors:**

- `BAD_REQUEST` with `data.issues` for input validation (05), automatically present on procedures with an input.
- `INTERNAL_SERVER_ERROR` (`defined: false`) for everything unexpected.

```ts
const [post, err] = await safe(client.post.create.mutate({ title: '' }));
if (err?.defined && err.code === 'BAD_REQUEST') {
  err.data.issues; // input validation issues (05), typed because `.input()` is set
}
```

**6. Unexpected errors.**

- Anything thrown that is not declared becomes `{ code: 'INTERNAL_SERVER_ERROR', defined: false }`.
- In production the message is **masked**. It is logged through `onError`. `cause` is never serialized.

```ts
const byId = t.procedure.query(async () => {
  throw new Error('connect ECONNREFUSED 10.0.0.7:5432');
});

createHandler({ router, onError: ({ error, path }) => log(error) }); // sees the original error and cause
// client, production: { code: 'INTERNAL_SERVER_ERROR', defined: false, message: <masked> }
```

**7. Client:**

```ts
const [post, err] = await safe(client.post.byId.query({ id }));
if (err) {
  if (err.defined) {
    switch (err.code) {
      case 'NOT_FOUND':
        err.data.id;
        break; // typed
      case 'UNAUTHORIZED':
        redirect('/login');
        break;
    }
  } else {
    // network failure, aborted, INTERNAL_SERVER_ERROR, … (code is still typed as the built-in set)
  }
}
```

- `isDefinedError(err)` is the standalone narrowing helper.
- `inferProcedureErrors<typeof proc>` / `inferRouterErrors<AppRouter>` are the type helpers.
- TanStack Query's `error` is typed with the union (19).

The `safe()` shapes in Q7.3:

```ts
const [post, err] = await safe(client.post.byId.query({ id })); // [data, error] (v11)
const [err, post, isDefined] = await safe(client.post.byId.query({ id })); // [error, data, isDefined] (oRPC)
const { data: post, error: err } = await safe(client.post.byId.query({ id })); // { data, error }
```

The class choice in Q7.7:

```ts
// one class: the same TRPCError on server and client
import { TRPCError } from 'trpcdev/client';
if (err instanceof TRPCError && err.defined) err.code;

// two classes (v11): the client wraps server errors
import { TRPCClientError } from 'trpcdev/client';
if (err instanceof TRPCClientError) err.data;
```

**8. No global `errorFormatter`.**

- Logging moves to the handler's `onError`.
- Shape changes become mapping middleware on base procedures.
- Error data serialization uses the endpoint's serializer (11).

```ts
// v11: one global shape for every procedure
const t = initTRPC.create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      retryAfterMs:
        error.cause instanceof RateLimitError ? error.cause.retryAfterMs : null,
    },
  }),
});

// vNext: logging in onError, the shape change as mapping middleware on a base procedure
createHandler({ router, onError: ({ error, path }) => log(error) });
const base = t.procedure.use(
  mapErrors((cause) =>
    cause instanceof RateLimitError
      ? error({
          code: 'TOO_MANY_REQUESTS',
          data: { retryAfterMs: cause.retryAfterMs },
        })
      : undefined,
  ),
);
```

> **Spike (2026-10-09):** [`notes/returned-error-inference.md`](../notes/returned-error-inference.md). Type-level prototype of the combined model. The following all infer correctly: returned errors (middleware and resolvers), declared maps, `mapErrors`, `return yield* error()`, and client narrowing for all three `safe()` shapes. A yieldable `TRPCError` is itself an `Effect`, so "returned" and "failed" are one rule. Pitfalls: `any`/`unknown`/`{}` outputs swallow returned errors through subtype reduction, and narrowing by `code` without `defined` mixes in the unexpected branch. Typeperf on 1k procedures: split ctx/error inference costs +0.4% instantiations, whole-return inference +33%. The 02 (d.ii) check costs 7–9%.

## Recommendation

The combined model:

- **B** is the primary mechanism (inference, including the Effect `E` channel).
- **A** is optional (runtime schemas, OpenAPI, throwable typed constructors).
- **Mapping middleware** replaces formatters (C).
- One isomorphic `TRPCError` with `defined`.
- Masked unexpected errors.
- No global formatter.

> ⚠️ **Parity:** oRPC's typed errors depend on the declared map (A). Dropping A would leave OpenAPI error docs incomplete. Choosing C alone would keep us at 🟡 for "End-to-end typesafe errors".

## Questions for Alex

- **Q7.1** Adopt the combined model (B primary, A optional, mapping middleware)? Or A only, C only, or D?
- **Q7.2** May _resolvers_ return errors (Go-style), or only middleware ([#5554](https://github.com/trpc/trpc/pull/5554) did middleware only)?
- **Q7.3** `safe()` result shape: keep v11's `[data, error]`, oRPC's `[error, data, isDefined]`, or an object `{ data, error }`?
- **Q7.4** Custom error codes: allowed with an explicit `status`? What is the default status if omitted (400 or 500)?
- **Q7.5** Mask unexpected error messages in production by default?
- **Q7.6** Remove the global `errorFormatter` entirely?
- **Q7.7** One isomorphic `TRPCError` class for server and client (oRPC does this), or keep a separate `TRPCClientError`?

## Decision

- **Q7.1:** [ ] combined · [ ] A only · [ ] C only · [ ] D
- **Q7.2:** [ ] resolvers + middleware · [ ] middleware only
- **Q7.3:** [ ] `[data, error]` · [ ] `[error, data, isDefined]` · [ ] `{ data, error }`
- **Q7.4:** [ ] yes, default status `___` · [ ] no custom codes
- **Q7.5:** [x] yes · [ ] no → [mask-unexpected-errors](../decisions/mask-unexpected-errors.md)
- **Q7.6:** [ ] remove · [ ] keep for shape
- **Q7.7:** [ ] one class · [ ] two classes
- **Notes:**
