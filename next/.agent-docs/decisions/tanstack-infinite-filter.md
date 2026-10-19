# Query procedures have a stable `infiniteFilter()` (human)

- The question (first-release review, 2026-10-19, question 12): "v11's `infiniteQueryFilter` has no v12 equivalent. Recommended: add a stable `infiniteFilter()` (3 lines). And a flat `keyPrefix` lets an unprefixed root `pathFilter()` match prefixed keys. Recommended: keep it flat for 0.1; the caveat is in the docs."
- Human, 2026-10-19 (first-release review, question 12): "yes".
- A query procedure's helpers have a stable `infiniteFilter({ input?, ...filters })` next to `queryFilter()`: the key `[path, { input?, type: 'infinite' }]`, so it matches only that procedure's infinite queries, every input or those whose first page's input matches part of `input`, as v11's `infiniteQueryFilter(input, filters)` did. Its key is typed with `InfiniteData<Output, unknown>` for `getQueryData`.
- (agent) The codemod's `infiniteQueryFilter` note now maps it to `infiniteFilter({ input, ...filters })` ([`v11-codemod.md`](./v11-codemod.md)).
- Why: `queryFilter()` matches only `type: 'query'`, so invalidating a list's infinite queries meant `pathFilter()` (every kind) or an exact `infiniteKey()`; v11 users reached for `infiniteQueryFilter`.
- (agent) Keys keep their shape ([`tanstack-query-keys.md`](./tanstack-query-keys.md)); the flat `keyPrefix` half of the question is in [`query-key-prefix.md`](./query-key-prefix.md).
- Lost: one more name on every query procedure's helpers, so a procedure can't be called `infiniteFilter`.
- Lives in: `packages/tanstack-query/src/utils.ts` (`QueryProcedureUtils.infiniteFilter`), tested in `packages/tanstack-query/src/index.test.ts` and each adapter's tests; docs in `docs/integrations/tanstack-query/keys.md`.
