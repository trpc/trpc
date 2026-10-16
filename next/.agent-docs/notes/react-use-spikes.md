# `use()` without TanStack: a link cache (C) vs Effect atoms (D)

2026-10-16. Question (proposal 20 Q20.2, decision [react-use-package](../decisions/react-use-package.md)): should a `use()`-native React integration be a link cache or a React store?

Code: `next/spikes/cache-link/` and `next/spikes/atom-trpc/`; run with `pnpm test` from `next/`. React 19.3.0, `react-dom/static` `prerender` for server renders, happy-dom with `react-dom/client` for browser renders, `effect` 4.0.2 and `@effect/atom-react` 4.0.2.

## C: `cacheLink()`

```ts
const cache = createQueryCache({ ttlMs: 30_000 });
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [cacheLink({ cache }), httpLink({ url })],
});
const trpc = stablePromises(client, cache); // stands in for a core hook
const post = use(trpc.post.byId.query({ id })); // same promise while fresh
await client.post.byId.query({ id }, { ignoreCache: true });
```

- A link alone can't do it. A link returns an Effect `Stream`, and `request()` (an `async` function) wraps it in a new promise for every call, so `client.x.query() !== client.x.query()`. A link can't return a promise synchronously either, because `runLinks` is lazy (`Stream.suspend`).
- What works: the cache owns the promise the caller gets. `stablePromises()` wraps the client: `.query()` returns `cache.promise(key, start)`. Shipping it would mean a hook in core: `request()` returns a promise a link hands back for the operation, instead of a fresh one.
- `cacheLink` still pays off without the hook. Plain `await client.x.query()` calls share results and requests, mutations invalidate (all paths by default, or `invalidates(op)`), and `ignoreCache` is a typed call option through the link declaration. Failed calls are evicted.
- Browser test (`cache-link.dom.test.ts`): with the hook, `use()` renders with one request and no warnings. Without it, it still renders, because the link cache makes the retry's new promise resolve to the cached data, but React logs "A component was suspended by an uncached promise" on every suspend.
- On the server (`prerender`) both render, because Fizz replays a suspended component with the promise it already tracked.
- Gaps:
  - Invalidation needs a re-render. `use()` has no subscription, so `cache.subscribe` plus a React store (`useSyncExternalStore`) is needed anyway. At that point it is a small React store, not just a link.
  - A shared request can't be aborted by one caller's signal.
  - There's no hydration. Server-started promises crossing to the client is out of scope (Q20.3).

## D: `AtomTrpc` on `effect/reactivity`

```ts
const trpc = AtomTrpc.make<AppRouter>({ links: [httpLink({ url })] });
const post = trpc.post.byId.query(
  { id },
  { reactivityKeys: ['posts'], timeToLive: '1 minute' },
);
const rename = trpc.post.rename.mutation();
registry.set(rename, { input, reactivityKeys: ['posts'] }); // refetches `post`
const events = trpc.post.onRename.subscription(undefined); // latest event
useAtomSuspense(post).value; // @effect/atom-react
```

- About 130 lines over `createEffectClient`, following `AtomRpc`:
  - `Atom.family` keyed by the path, the serialized input and the options.
  - `runtime.atom` for queries and subscriptions.
  - `runtime.fn` with `Reactivity.mutation` for mutations.
  - `withReactivity` for reactivity keys.
  - `setIdleTTL`/`keepAlive` for time-to-live.
- The same call returns the same atom. Atoms are typed from the Effect client, so `AsyncResult` carries the procedure's typed errors; a test checks `err.data` narrows to `{ id: string }` after `err.defined && err.code === 'NOT_FOUND'`.
- Invalidation re-renders through the registry, with no extra store. Unused atoms are disposed unless `timeToLive` is set.
- `useAtomSuspense` renders under `prerender`.
- Gap: hydration. `Atom.serializable` needs an Effect `Schema` for the result. tRPC outputs have none at runtime, so this needs a `Schema` that encodes with the router's serializer. It's not built in the spike.

## Findings

- C needs both a core change (the promise hook) and a React store for invalidation. D needs neither: the registry is the store, and `effect/reactivity` already has keys, TTL and serialization.
- D ties the integration to Effect's atom packages and their release cadence. C needs nothing beyond React.
- Suggestion for Q20.2, for Alex to decide: a React store. Either D, if an Effect-first React package is wanted, or C's cache behind `useSyncExternalStore`. A bare link isn't enough on its own.
