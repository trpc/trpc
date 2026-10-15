# Opt-in query key prefix (human)

- Alex, 2026-10-15 (issues review Q3, #6555, #5251, #4153): "A". `createTrpcQueryUtils({ client, keyPrefix: 'billing' })` gives keys like `[['billing', 'post', 'byId'], { input, type }]`, so two tRPC APIs can share one `QueryClient`.
- Without `keyPrefix`, keys are unchanged ([`tanstack-query-keys.md`](./tanstack-query-keys.md)).
- (agent) Mutation keys and `pathKey()` carry the prefix too, so `trpc.pathKey()` matches only that API's queries.
- Lost: nothing for single-API apps; keys from two prefixes can't be matched with one filter.
- Lives in: `packages/tanstack-query/src/keys.ts`, `src/utils.ts`.
