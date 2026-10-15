# Actions come from a factory in `trpcdev/actions`; RSC helpers are a subpath (human)

- Alex, 2026-10-15 (Q15.2): "A". Procedures become plain functions through opt-in wrappers, not builder methods.
- Alex, 2026-10-15 (Q15.3): "Make it configurable", then "it should be configurable on a factory function thay also handles the context thing so we can just wrap in action()". A factory sets the context and result mode once:

  ```ts
  export const action = createAction({ ctx: createContext, result: 'safe' }); // or 'throw'
  export const createPost = action(createPostProcedure); // (input | FormData) => result
  ```

  `result: 'safe'` (the default) returns the same dual `[data, error]` / `{ data, error }` value as `safe()`; `'throw'` returns the data and throws `TrpcError`. `createCallable` is the same factory for non-form calls. Both live in `trpcdev/actions` ([`entry-points.md`](./entry-points.md)), so they work in Next, TanStack Start or any React Server Components setup.

- Alex, 2026-10-15 (Q15.4): "We probably don't need a next specific package, just a rsc specific one - look at my package raf-query", then "make the rsc ones at their own entrypoint too". No `@trpcdev/next`. React Server Components helpers are `@trpcdev/tanstack-react-query/rsc`, as raf-query's `@raf-query/react/rsc`: a per-request caller and query utils through React's `cache()`, and a server `HydrationBoundary` that streams prefetched queries.
- Lost: v11's `experimental_caller` builder method and the Next-specific adapter.
- Lives in: `packages/trpcdev/src/actions/`, `packages/tanstack-react-query/src/rsc.tsx`.
