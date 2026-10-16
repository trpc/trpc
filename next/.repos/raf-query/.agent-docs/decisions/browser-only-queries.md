# `ssr: false` runs a query in the browser only (agent)

- `ssr` is a `QueryBehavior` option (factory or per call). With `ssr: false`, `Entry.begin` on a server cache (`cache.isServer`) never runs the request: it rejects the entry's pending promise with `Query.BrowserOnlyError` and dies with it, so `ensure` / `fetch` fail, `prefetch` stays quiet, and readers see `isPending` with a rejected promise.
- `invalidate` / `reset` and the observer commands (`refetch`, `fetchNextPage`, `fetchPreviousPage`) are no-ops for browser-only entries on the server; `dehydrateEntries` skips them, so the browser starts empty and runs the query itself.
- Rejected, not pending: a promise that never settles would hang a streaming SSR render that `use()`s it. Rejecting makes React render the nearest Suspense boundary on the client (reported to `onRecoverableError`), the same path RSC uses for client-only content.
- Not used: React's internal `react.recoverable` symbol (not exported in stable React) and throwing from `useQuery` during SSR (breaks the `isPending ? … : use(promise)` reader pattern).
- Tests: `client.test.ts` and `ssr.test.tsx` ("ssr: false").
