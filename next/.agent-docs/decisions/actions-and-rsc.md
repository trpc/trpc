# Actions come from a factory in `@trpc12/trpc/actions`; RSC helpers are a subpath (human)

- Human, 2026-10-15 (Q15.2): "A". Procedures become plain functions through opt-in wrappers, not builder methods.
- Human, 2026-10-15 (Q15.3): "Make it configurable", then "it should be configurable on a factory function thay also handles the context thing so we can just wrap in action()". A factory sets the context and result mode once:

  ```ts
  export const action = createAction({ ctx: createContext, result: 'safe' }); // or 'throw'
  export const createPost = action(createPostProcedure); // (input | FormData) => result
  ```

  `'throw'` returns the data and throws `TrpcError`. `createCallable` is the same factory for non-form calls. Both live in `@trpc12/trpc/actions` ([`entry-points.md`](./entry-points.md)), so they work in Next, TanStack Start or any React Server Components setup.

- Human, 2026-10-18: "A" — asked whether an action's safe result should be a plain, serializable object. `result: 'safe'` first returned `safe()`'s dual `[data, error]` / `{ data, error }`, which React's Server Action serialization breaks: the array arrives without its `data` and `error` fields, and the `TrpcError` as a plain object without its class (development logs an error for it). An action's safe result is now `{ data }` or `{ error: { code, message, defined, data? } }`, plain objects; `data` is left out for errors without it, as Flight drops `undefined` fields. `code` and `defined` narrow it as on `TrpcError`. A callable's results stay on the server, so its `'safe'` result is still `safe()`'s, with the `TrpcError` itself.
- Human, 2026-10-15 (Q15.4): "We probably don't need a next specific package, just a rsc specific one - look at my package raf-query", then "make the rsc ones at their own entrypoint too". No `@trpc12/next`. React Server Components helpers are `@trpc12/tanstack-react-query/rsc`, as raf-query's `@raf-query/react/rsc`: a per-request caller and query utils through React's `cache()`, and a server `HydrationBoundary` that streams prefetched queries.
- (agent) `createTrpcRsc({ router, ctx, layer })` returns `trpc` (query helpers over a router caller), `caller`, `getQueryClient`, `prefetch` and `HydrationBoundary`. `ctx` and the query client are memoized per request with `cache()`; the boundary dehydrates with `hydrationOptions()`, so the browser's `QueryClient` takes `defaultOptions: hydrationOptions()` and the same serializer. It renders TanStack's client `HydrationBoundary`, so no `'use client'` file is needed.
- Lost: v11's `experimental_caller` builder method and the Next-specific adapter. From the 2026-10-18 answer: `const [post, error] = await createPost(form)` and parity with `safe()` for actions, and the error's class (`instanceof TrpcError`, `_tag` for `Effect.catchTag`) and `cause`.
- Lives in: `packages/trpc/src/actions/` (`flight.test.ts` sends action results through React's Flight server and client), `packages/tanstack-react-query/src/rsc.ts`.
