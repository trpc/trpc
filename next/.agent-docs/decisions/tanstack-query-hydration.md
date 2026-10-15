# TanStack Query hydration uses danSON (agent)

- `hydrationOptions({ serializer? })` returns `{ dehydrate, hydrate }` defaults for a `QueryClient`. They use danSON by default ([`serializer.md`](./serializer.md)), so `Date`, `Map`, `BigInt` and similar survive a server render. Pending queries are dehydrated too, so a server can stream them.
- Named `hydrationOptions`, not proposal 19's `hydrationSerializer`, because it returns both directions' options.
- Lives in: `packages/tanstack-query/src/hydration.ts`.
