# Server-side calls: a direct caller and `localLink` (human)

- Alex, 2026-10-15 (Q15.1): "We should have both I think?". `createRouterClient(router, { ctx, layer })` makes direct calls with the HTTP client's shape (SC-A), so tests, SSR and TanStack prefetching read the same. `localLink({ router, ctx })` runs the same in-process call through the full link chain (logging, dedupe, serialization).
- (agent) `call(procedure, input, { ctx, layer })` calls a single procedure.
- Functions for server actions are [`actions-and-rsc.md`](./actions-and-rsc.md).
- Lives in: `packages/trpcdev/src/server/caller.ts`, `src/client/links/local.ts`.
