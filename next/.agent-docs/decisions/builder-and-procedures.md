# Builder and procedure shape (human)

- Alex, 2026-10-15 (Q4.1): "A, they're good to distinguish from, example for user impersonating". Keep `query`, `mutation` and `subscription`. Middleware can tell reads from writes, e.g. an admin impersonating a user may run queries but not mutations:

  ```ts
  const readOnlyWhenImpersonating = t.middleware(({ ctx, type, next }) =>
    ctx.impersonating && type !== 'query'
      ? error({ code: 'FORBIDDEN' })
      : next(),
  );
  ```

- Lost: a single `.handler()` terminal (T-B).
- Open (Alex): "mutations and queries that return something we can subscribe to too (make it durable for res cancellations)", a later API whose shape is undecided. Related to resumable subscriptions (proposal 14).
- Alex, 2026-10-15 (Q4.4): "Scoped per procedure is fine, especially if it makes it so transforms break (we can point ts to the input rather than the output of its validators)". `.output(schema, { validate: false })` documents an output (OpenAPI, contracts) without running the schema. The client is then typed with the schema's input type, since no transform runs. No global or production-only switch. oRPC does this per base procedure with `initialOutputValidationIndex: NaN`.
- (agent, Q3.2) G-A. The builder carries one mapped definition bag, `TDef`, instead of a generic per field.
- (agent, Q3.3) No `t.error`; errors come from `error()` ([`errors.md`](./errors.md)).
- (agent) Resolver options are `{ ctx, input, meta, path, type, signal, response, errors }`, plus `lastEventId` on subscriptions. `errors` holds a constructor per code declared with `.errors()`.
- (agent) `response` (04 (d) R-A) has `headers` and a settable `status`. In a batch, headers from every call are merged (`set-cookie` appended) and `status` is ignored, so a batch waits for every call's head before it starts; deferred values still stream after that. Sockets and message ports ignore both.
- (agent) `.output()` validates by default. The resolver returns the schema's input type and the client sees its output type. On a subscription it types each event; `tracked(id, data)` events must match, and the client sees `TrackedEnvelope<Output>`.
- (agent) `.route()` (04 (g)) holds REST metadata (method, path, status, summary, tags, `inputStructure`, `outputStructure`). The RPC endpoint ignores it; OpenAPI reads it.
- Lives in: `packages/trpcdev/src/server/builder.ts`, `procedure.ts`, `execute.ts`, `tracked.ts`.
