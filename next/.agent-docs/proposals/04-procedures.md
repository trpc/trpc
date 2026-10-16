# 04 — Procedures: types, resolvers, outputs and metadata

| Status     | Area   | Depends on | oRPC parity rows                                  |
| ---------- | ------ | ---------- | ------------------------------------------------- |
| `proposed` | server | 02, 03     | End-to-end typesafe input/output, OpenAPI support |

## Summary

Decide which procedure types exist, what a resolver receives and may return, how outputs are validated, and how procedures declare metadata and HTTP routing.

**Recommendation:**

- Keep `query`, `mutation` and `subscription`. The resolver receives one options bag.
- A resolver may return a value, a Promise, an Effect, an async iterable or a Stream, or _return_ an error (07).
- Response headers and status are set through a `response` handle.
- `.route()` is first-class.

## Today (v11)

- `.query(fn)`, `.mutation(fn)`, `.subscription(fn)`. The resolver gets `{ ctx, input, signal, path, type, getRawInput }`.
- Queries and mutations may return async iterables; these are streamed over `httpBatchStreamLink`.
- `.output(schema)` validates the resolver output.
- `.meta(obj)` merges shallowly. `defaultMeta` is set in `create()`.
- Response headers and status are set via the endpoint-level `responseMeta()` callback or by mutating `ctx.resHeaders`, which depends on the adapter.
- HTTP mapping is fixed: query maps to GET, mutation to POST, subscription to SSE or WebSocket.

## Goals

- Keep the familiar verbs: `.query()`, `.mutation()`, `.subscription()`.
- One options bag for resolvers, extensible without breaking changes.
- A portable way to set headers, status and cookies that works across adapters and in batches.
- Per-procedure HTTP routing metadata for OpenAPI (18).

## Decision areas

### (a) Procedure types

- **T-A — Keep three types.** `query` (safe and idempotent, may use GET and be cached), `mutation` (POST) and `subscription` (long-lived stream with reconnect semantics).
  - ✅ Familiar. Integrations need the distinction (TanStack `queryOptions` versus `mutationOptions`, HTTP method, caching).

  ```ts
  // T-A
  export const byId = t.procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => db.post.find(input.id)); // GET, queryOptions
  export const create = t.procedure
    .input(NewPost)
    .mutation(({ input }) => db.post.create(input)); // POST, mutationOptions
  export const onPost = t.procedure.subscription(async function* () { … }); // SSE or WebSocket
  ```

- **T-B — oRPC style, one `.handler()`**, with the kind inferred from `.route({ method })`.
  - ✅ Fewer concepts.
  - ❌ Loses semantic intent. Clients cannot choose GET/POST or query/mutation helpers without route metadata.

  ```ts
  // T-B
  export const byId = t.procedure
    .route({ method: 'GET' }) // → query
    .input(z.object({ id: z.string() }))
    .handler(({ input }) => db.post.find(input.id));
  export const create = t.procedure
    .route({ method: 'POST' }) // → mutation
    .input(NewPost)
    .handler(({ input }) => db.post.create(input));
  ```

### (b) Resolver options

```ts
t.procedure.input(schema).query(async ({ ctx, input, signal, path, meta, response }) => { … });
```

| Field         | Notes                                                               |
| ------------- | ------------------------------------------------------------------- |
| `ctx`         | Context after middleware (06)                                       |
| `input`       | Parsed input (05)                                                   |
| `signal`      | `AbortSignal`, aborted on client disconnect or timeout              |
| `path`        | `'post.byId'`                                                       |
| `meta`        | Procedure meta (in v11 only middleware gets it)                     |
| `response`    | Response handle, see (d)                                            |
| `errors`      | Typed error constructors, only if a declared error map is used (07) |
| `lastEventId` | Subscriptions only (14)                                             |

### (c) Return values

| Return type                                          | Meaning                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `T` / `Promise<T>`                                   | Output                                                                                                                                    |
| `Effect<T, E, R>`                                    | Output, typed errors `E`, services `R` (02)                                                                                               |
| `AsyncIterable<T>` / `Stream<T, E, R>`               | Streamed output (14)                                                                                                                      |
| a returned `TRPCError` (if 07 picks returned errors) | Typed error, not thrown                                                                                                                   |
| `File` / `Blob`                                      | Binary response (11)                                                                                                                      |
| `Response` (raw)                                     | **Open, Q4.3.** Escape hatch from [#6488](https://github.com/trpc/trpc/pull/6488): typed on the client as `Response`, skips serialization |

```ts
const byIdInput = t.procedure.input(z.object({ id: z.string() }));

byIdInput.query(async ({ input }) => db.post.find(input.id)); // Promise<T>
byIdInput.query(
  Effect.fn(function* ({ input }) {
    const repo = yield* PostRepo;
    return yield* repo.find(input.id); // Effect<Post, PostNotFound, PostRepo>
  }),
);
byIdInput.query(
  async ({ input }) =>
    (await db.post.find(input.id)) ?? error({ code: 'NOT_FOUND' }),
); // returned error (07)
t.procedure.query(() => new File([csv], 'export.csv', { type: 'text/csv' })); // File (11)
t.procedure.subscription(async function* () {
  yield 1; // AsyncIterable<number> (14)
});
```

Raw `Response` (Q4.3):

```ts
export const download = t.procedure
  .input(z.object({ id: z.string() }))
  .query(async ({ input }) => {
    const body = await storage.stream(input.id);
    return new Response(body, {
      headers: { 'content-type': 'application/pdf' },
    }); // not serialized
  });

const res = await client.download.query({ id: '1' }); // Response
const blob = await res.blob();
```

### (d) Response headers and status

- **R-A — Mutable handle in resolver and middleware options:**

  ```ts
  .mutation(async ({ input, response }) => {
    response.headers.append('set-cookie', cookie);
    response.status = 201; // ignored, with a dev warning, inside batches
    return created;
  });
  ```

  - In batches, headers from all calls are merged and status falls back to the batch status (207 or 200; see 10).

- **R-B — Return wrapper:** `return respond(created, { status: 201, headers })`.
  - ✅ Pure.
  - ❌ Middleware cannot set headers this way; the output type needs unwrapping.

  ```ts
  // R-B
  .mutation(async ({ input }) => {
    const created = await db.post.create(input);
    return respond(created, { status: 201, headers: { 'set-cookie': cookie } }); // client output: Post
  });
  ```

- **R-C — Endpoint-level only** (`responseMeta`-like plugin hook).
  - ❌ Same pain as v11.

  ```ts
  // R-C: v11's responseMeta shape, on the handler or as a plugin hook
  createHandler({
    router: appRouter,
    createContext,
    responseMeta: ({ ctx, info, errors }) => ({
      status:
        info?.calls[0]?.path === 'post.create' && !errors.length
          ? 201
          : undefined,
      headers: ctx?.cookie ? { 'set-cookie': ctx.cookie } : {},
    }),
  });
  ```

### (e) Output validation

- `.output(schema)` validates and _encodes_ the output (with Effect Schema codecs or Standard Schema output types).
- An invalid output is an `INTERNAL_SERVER_ERROR` that is never exposed to the client. In development it logs the issues.
- **Open (Q4.4):** an option to skip output validation in production for performance.

```ts
export const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), title: z.string() }))
  .query(({ input }) => db.post.find(input.id)); // a row without `title` → INTERNAL_SERVER_ERROR, issues logged in dev

// Q4.4
createHandler({
  router: appRouter,
  validateOutput: process.env.NODE_ENV !== 'production',
}); // name and placement TBD
```

### (f) Meta

- Keep `.meta(obj)` with **shallow merge** across chained calls.
- Default meta is set by calling `.meta()` on the base procedure, so `defaultMeta` disappears (there is no `create()` any more, [root-init-option-bag](../decisions/root-init-option-bag.md)).
- Meta is available to middleware and resolvers, and through the router definition (for codegen/OpenAPI).

```ts
const t = initTRPC<{
  ctx: Context;
  meta: { auth?: boolean; role?: 'admin'; rateLimit?: number };
}>();

const base = t.procedure.meta({ auth: false, rateLimit: 100 }); // default meta
const admin = base.meta({ auth: true, role: 'admin' });

export const stats = admin.meta({ rateLimit: 10 }).query(({ meta }) => meta); // { auth: true, role: 'admin', rateLimit: 10 } (Q4.5)

stats['~trpc'].meta; // the same object, for codegen/OpenAPI (03 (d))
```

### (g) Route metadata

```ts
t.procedure
  .route({ method: 'GET', path: '/posts/{id}', successStatus: 200, tags: ['posts'], summary: 'Get a post' })
  .input(z.object({ id: z.string() }))
  .query(…);
```

- Part of the contract (03 (d)). It is ignored by the RPC endpoint and used by the OpenAPI endpoint, link and generator (18).
- `t.router({ … }, { prefix, tags })` or `.prefix()` / `.tag()` give route defaults (08).

## Recommendation

- **T-A** (keep the three types).
- The resolver options bag as in (b), including `meta`.
- **R-A** (mutable response handle), documented for batches.
- `.output()` validates by default.
- `.route()` is first-class.
- No raw `Response` returns in v1. Revisit after OpenAPI, which needs binary or streaming responses anyway.

## Questions

- **Q4.1** Keep three procedure types (T-A), or a single `.handler()` (T-B)?
- **Q4.2** Response headers/status: mutable handle (R-A), return wrapper (R-B) or endpoint-only (R-C)?
- **Q4.3** Allow returning a raw `Response` from a procedure?
- **Q4.4** Option to skip output validation in production?
- **Q4.5** Expose `meta` to resolvers (not just middleware)?

## Decision

- **Q4.1:** [x] T-A · [ ] T-B → [builder-and-procedures](../decisions/builder-and-procedures.md)
- **Q4.2:** [ ] R-A · [ ] R-B · [ ] R-C
- **Q4.3:** [ ] yes · [ ] no · [ ] later
- **Q4.4:** [x] yes, per procedure: `.output(schema, { validate: false })`, typed from the schema's input · [ ] no → [builder-and-procedures](../decisions/builder-and-procedures.md)
- **Q4.5:** [x] yes · [ ] no → [meta-in-resolvers](../decisions/meta-in-resolvers.md)
- **Notes:**
