# The TanStack Query integration is ratified; hydration follows the client's serializer (human)

- Alex, 2026-10-15 (decisions round 3, Q22 = proposal 19): "A".
- [`tanstack-query-adapters.md`](./tanstack-query-adapters.md), [`tanstack-query-keys.md`](./tanstack-query-keys.md) and [`tanstack-query-hydration.md`](./tanstack-query-hydration.md) stand as built: one core on `@tanstack/query-core`, adapters for React, Preact, Vue, Solid, Svelte 5, Angular and Lit, providers that take only `client`, and v11-shaped keys.
- `hydrationOptions()` uses the client's serializer by default instead of always danSON ([`replaceable-serializers.md`](./replaceable-serializers.md)); `serializer` still overrides it.
- (agent) With no serializer or a sync one, pending queries are dehydrated only if that serializer can carry them; otherwise they are dehydrated after they settle.
- Why: the adapters already exist, are tested against a real server and share one core; hydration must round-trip the same types the client sees.
- Lost: nothing beyond the earlier files' "Lost" entries.
- Lives in: `packages/tanstack-*/src/`, `packages/tanstack-query/src/hydration.ts` (the serializer default isn't changed yet).
