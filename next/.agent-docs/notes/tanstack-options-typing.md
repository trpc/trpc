# TanStack Query option-bag typing (19)

- **Date:** 2026-10-09
- **Question:** Does 19's option bag (`queryOptions({ input, ...tanstack })`) type as well as v11's positional form against real TanStack types? How do `select`, `skipToken`, `DataTag` keys, explicit infinite `input: (pageParam) => …` vs v11's `cursor` convention, and `streamedOptions` behave?
- **Feeds:** [19 — TanStack Query](../proposals/19-tanstack-query.md).
- **Code:** [`next/spikes/tanstack-options/`](../../spikes/tanstack-options/). `core.ts` is a `declare`-only prototype over `@tanstack/query-core` 5.90.20 types; `useQuery`/`useInfiniteQuery` stand in for the framework packages. `tanstack-options.test-d.ts` (11 type tests) ran in `pnpm test` until the feature shipped; git has it. TypeScript 7.0.2.

## Results

- **The bag types exactly like the positional form.**
  - `useQuery(trpc.post.byId.queryOptions({ input, select: (p) => p.id }))` and v11's `queryOptions(input, { select })` produce the same `data` type.
  - `select`'s argument is contextually typed, and `TData` is inferred from it, even though `input` sits in the same object.
  - `error` is the client error type.
- **The bag keeps every check:**
  - A missing `input` gives "Property 'input' is missing".
  - A wrong input field is a TS2322 on that field.
  - A misspelled TanStack option is TS2561: "'staleTme' does not exist … Did you mean to write 'staleTime'?" The excess-property check still works through `{ input } & Omit<QueryObserverOptions, …>`.
- **No-input procedures** take no argument or `{ staleTime }`. Making `input` optional when `undefined extends TInput` costs one conditional rest parameter.
- **`skipToken`** works as `input: id ? { id } : skipToken`. Hovers print it as `unique symbol | { id: string }`. That's a readability nit, and it's the same in v11.
- **`DataTag` keys:** `queryClient.getQueryData(trpc.post.byId.queryKey({ input }))` and `setQueryData(..., (old) => …)` are typed as `Post | undefined`, with no generic arguments. This also works through `.queryOptions(...).queryKey`.
- **Infinite, explicit `input: (pageParam) => TInput`:**
  - Any page-param type works (a `number` page index, for example), not just an input `cursor`.
  - `TPageParam` is inferred from `initialPageParam`, from `input`'s parameter annotation and from `getNextPageParam`.
  - **Pitfall:** with no annotation, `initialPageParam: undefined` infers `TPageParam = undefined`, and `getNextPageParam: (last) => last.nextCursor` then fails ("'string | undefined' is not assignable to 'null | undefined'"). TanStack's own `infiniteQueryOptions` has the same pitfall. The fix is to annotate `(cursor: string | undefined) => …` or `initialPageParam: undefined as string | undefined`. Both forms are tested.
- **v11's `cursor` convention** doesn't have that pitfall, because the page-param type comes from the input's `cursor`. The cost is that the page param has to be an input field named `cursor`, and the `data` type gains `| null` (`InfiniteData<Page, string | null>`).
- **`streamedOptions`:** data is the accumulated chunks (`{ text: string }[]`). It's the same machinery with `TQueryFnData = TChunk[]`.

## Implications

- The option bag has no typing downside versus positional, so the choice is about ergonomics and future options.
- Explicit infinite `input: (pageParam) => …` is more general, but users must annotate the page param whenever `initialPageParam` is `undefined`. The docs and examples should show the annotation. Alternatively, keep `cursor` as a shorthand next to the function form.
