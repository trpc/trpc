# Server-side calls use a client-shaped caller (agent)

- SC-A: `createRouterClient(router, { ctx, layer })` has the same shape as the HTTP client, so tests and SSR read the same, and TanStack helpers accept it for prefetching.
- `call(procedure, input, { ctx, layer })` calls a single procedure.
- Lives in: `packages/trpcdev/src/server/caller.ts`.
