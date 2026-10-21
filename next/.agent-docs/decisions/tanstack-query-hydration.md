# TanStack Query hydration follows the client's serializer (agent)

- `hydrationOptions({ client?, serializer? })` returns `{ dehydrate, hydrate }` defaults for a `QueryClient`. They use the client's serializer, `serializer` overrides it, and without either they use JSON ([`tanstack-query-ratified.md`](./tanstack-query-ratified.md), which replaced the earlier always-progressive JSON default). Pending queries are dehydrated too, so a server can stream them.
- Named `hydrationOptions`, not proposal 19's `hydrationSerializer`, because it returns both directions' options.
- Lives in: `packages/tanstack-query/src/hydration.ts`.
