# TanStack Query helpers take an option bag (human)

- Human, 2026-10-09 (Q19.2): "bag". `queryOptions({ input, ...tanstackOptions })`, not v11's positional `queryOptions(input, opts)`.
- Why: the spike ([notes/tanstack-options-typing.md](../notes/tanstack-options-typing.md)) types identically to the positional form (`select` inference, `skipToken`, `DataTag` keys) and keeps excess-property errors for misspelled options. One argument leaves room for more.
- (agent, Q19.3) Infinite queries take an explicit `input: (pageParam) => TInput`, not v11's `cursor` convention, which tied the procedure's input shape to TanStack. The page param's type comes from the annotation (the spike's pitfall), so docs and tests always annotate it.
- Lives in: `packages/tanstack-query/src/index.ts`.
