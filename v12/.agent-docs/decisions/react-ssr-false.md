# `ssr: false` for queries only a browser can run (agent)

- (agent) `trpc.x.query(input, { ssr: false })` on a `@trpc12/experimental-react` client. On a server store (`isServer`), a query without data and without a request in flight starts nothing: the entry's promise becomes a rejection with a `BrowserOnlyQueryError` whose `digest` is `BAILOUT_TO_CLIENT_SIDE_RENDERING`. `use()` throws it, React renders the nearest Suspense fallback, and the browser renders that boundary and runs the query. `dehydrate` leaves it out, as every entry without data.
  - It's the entry's own promise, so `useQuery` reads it, and the same object on every read. A later read without `ssr: false` starts the request with a new promise; data, or a request something else started, is read as usual.
  - On a browser store it changes nothing.
  - It's a read option, stripped before the links see the call options, and typed onto `.query()` by `ReactQueryArgs`.
- Why: a query the server can't run (the browser's session, `localStorage` in its input) had no way to stay off the server. Calling `.query()` in a server render started it anyway, and a request that never settles there held `prerender` until the store was disposed.
- The digest is the one Next.js gives `next/dynamic` with `ssr: false`, so Next doesn't report it; other frameworks see it in the render's `onError` and the browser's `onRecoverableError`.
- Lost: a sentinel such as TanStack's `skipToken`, which disables a query everywhere; here the browser still runs it.
- Lives in: `packages/experimental-react/src/store.ts` (`ReadOptions`, `leaveToBrowser`), `packages/experimental-react/src/client.ts` (`ReactQueryArgs`, the `query` case), `packages/experimental-react/src/index.test.ts` and `dom.test.tsx` ("ssr: false…"), `packages/experimental-react/src/hooks.test-d.ts`, `www/v12/docs/integrations/experimental-react.md`.
