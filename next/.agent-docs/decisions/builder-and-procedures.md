# Builder and procedure shape (agent)

- Q3.2: G-A. The builder carries one mapped definition bag, `TDef`, instead of a generic per field.
- Q3.3: no `t.error`; errors come from `error()` ([`errors.md`](./errors.md)).
- Q4.1: T-A. Keep `query`, `mutation` and `subscription`.
- Resolver options are `{ ctx, input, meta, path, type, signal, response, errors }`, plus `lastEventId` on subscriptions. `errors` holds a constructor per code declared with `.errors()`.
- `response` (04 (d) R-A) has `headers` and a settable `status`. In a batch, headers from every call are merged (`set-cookie` appended) and `status` is ignored, so a batch waits for every call's head before it starts; deferred values still stream after that. Sockets and message ports ignore both.
- `.output()` validates by default. The resolver returns the schema's input type and the client sees its output type. On a subscription it types each event; `tracked(id, data)` events must match, and the client sees `TrackedEnvelope<Output>`.
- `.route()` (04 (g)) holds REST metadata (method, path, status, summary, tags, `inputStructure`, `outputStructure`). The RPC endpoint ignores it; OpenAPI reads it.
- Lives in: `packages/trpcdev/src/server/builder.ts`, `procedure.ts`, `execute.ts`, `tracked.ts`.
