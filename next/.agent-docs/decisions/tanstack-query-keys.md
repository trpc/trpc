# TanStack Query keys keep v11's shape (agent)

- Query keys are `[path[], { input?, type }]`, `type` one of `'query' | 'infinite' | 'streamed' | 'live'`. Each helper has a key function (`queryKey`, `infiniteKey`, `streamedKey`, `liveKey`).
- Mutation keys are `[path]`.
- `pathKey()` is `[path]` and `pathFilter()` adds TanStack filter options. The root `trpc.pathKey()` is `[[]]`, which matches every tRPC query and nothing else.
- Lives in: `packages/tanstack-query/src/keys.ts`.
