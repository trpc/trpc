# Opt-in query key prefix (human)

- Human, 2026-10-15 (issues review Q3, #6555, #5251, #4153): "A". `createTrpcQueryUtils({ client, keyPrefix: 'billing' })` gives keys like `[['billing', 'post', 'byId'], { input, type }]`, so two tRPC APIs can share one `QueryClient`.
- Without `keyPrefix`, keys are unchanged ([`tanstack-query-keys.md`](./tanstack-query-keys.md)).
- (agent) Mutation keys and `pathKey()` carry the prefix too, so `trpc.pathKey()` matches only that API's queries.
- Lost: nothing for single-API apps; keys from two prefixes can't be matched with one filter.
- Human, 2026-10-19 (first-release review, question 12): "yes" to keeping the prefix flat for 0.1: it stays the path's first segment, so another API's unprefixed root `trpc.pathFilter()` (`[[]]`) matches prefixed keys too, and so does a top-level router named like the prefix. `www/docs/integrations/tanstack-query/keys.md` says so and suggests filtering under a path. Open: a separate key slot for the prefix (`[path, { input, type, prefix }]` or a leading segment of its own) before 1.0.
- Lives in: `packages/tanstack-query/src/utils.ts`, the adapters' `createTrpcContext()`, `packages/tanstack-react-query/src/rsc.ts`.
