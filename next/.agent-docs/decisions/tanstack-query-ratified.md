# The TanStack Query integration is ratified; hydration follows the client's serializer (human)

- Human, 2026-10-15 (decisions round 3, Q22 = proposal 19): "A".
- [`tanstack-query-adapters.md`](./tanstack-query-adapters.md), [`tanstack-query-keys.md`](./tanstack-query-keys.md) and [`tanstack-query-hydration.md`](./tanstack-query-hydration.md) stand as built: one core on `@tanstack/query-core`, adapters for React, Preact, Vue, Solid, Svelte 5, Angular and Lit, providers that take only `client`, and v11-shaped keys.
- `hydrationOptions()` uses the client's serializer by default instead of always danSON ([`replaceable-serializers.md`](./replaceable-serializers.md)); `serializer` still overrides it.
- (agent) The client's serializer is read from its links (`getClientTransformer(client)`, the first link that records one), so the call is `hydrationOptions({ client })`. Pending queries dehydrate with every kind: TanStack serializes their data when it settles.
- Why: the adapters already exist, are tested against a real server and share one core; hydration must round-trip the same types the client sees.
- Lost: nothing beyond the earlier files' "Lost" entries.
- Lives in: `packages/tanstack-*/src/`, `packages/tanstack-query/src/hydration.ts`, `packages/trpc/src/client/client.ts` (`getClientTransformer`); tests in `packages/tanstack-query/src/index.test.ts`.
