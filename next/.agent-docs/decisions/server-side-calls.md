# Server-side calls: a direct caller and `localLink` (human)

- Human, 2026-10-15 (Q15.1): "We should have both I think?". `createRouterClient(router, { ctx, runtime })` makes direct calls with the HTTP client's shape (SC-A), so tests, SSR and TanStack prefetching read the same. `localLink({ router, ctx })` runs the same in-process call through the full link chain (logging, dedupe, serialization).
- (agent) `t.call(procedure, input, { ctx, layer })` calls a single procedure, its `ctx` typed from `t`, since a procedure's type leaves the root ctx out ([`sanitized-procedure-types.md`](./sanitized-procedure-types.md)).
- Both take a caller-owned `ManagedRuntime`, not a layer; `t.call()` takes one too, or a layer it builds per call ([`router-client-runtime.md`](./router-client-runtime.md)).
- Functions for server actions are [`actions-and-rsc.md`](./actions-and-rsc.md).
- Lives in: `packages/trpc/src/server/caller.ts`, `src/server/call.ts`, `src/client/links/local.ts`.
