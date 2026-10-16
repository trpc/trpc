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

### C, round 2: stable thenables, structural sharing, sorted keys

Asked for in the decision round: promises that stay the same while the data does, as TanStack Query does. Code: `spikes/cache-link/share.ts` (ports of `@tanstack/query-core`'s `hashKey`, `replaceEqualDeep` and `pendingThenable`), tests in `share.test.ts`.

```ts
const first = trpc.post.list.query({ limit: 2, order: 'asc' });
trpc.post.list.query({ order: 'asc', limit: 2 }) === first; // keys sorted before hashing
await first;
first.status; // 'fulfilled', and first.value is the list: use() reads it without suspending

cache.invalidate(); // marks stale, tells subscribers
trpc.post.list.query(input) === first; // still: the stale value, refetched in the background
// refetch equal: same thenable, nobody told. Refetch with post 2 renamed:
// a new thenable whose list[0] and list[1].tags are the old objects
```

- Keys: plain objects' keys are sorted at any depth before the danSON keying, so key order doesn't split entries while `Date`s and `Map`s still key apart.
- Thenables: each cached promise gets React's `status` / `value` / `reason` fields when it settles. `renderToString` renders a settled cached query in one pass; a plain resolved promise shows the fallback.
- Stale-while-revalidate: an expired or invalidated entry keeps its thenable and refetches once in the background. The new value goes through `replaceEqualDeep(old, new)`. All equal: the thenable stays the same object and subscribers aren't told, so React doesn't re-render. Otherwise: a new fulfilled thenable whose unchanged parts are the old objects, then subscribers are told. A failed refetch keeps the old value.
- `replaceEqualDeep` also shares `Date`s with the same time. A danSON (or Effect `Schema`) response revives new `Date` objects each time, which would defeat TanStack's version on any value holding one. `Map`s, `Set`s and class instances are still compared by identity, as in TanStack.
- Invalidation now tells subscribers twice for a changed value (stale, then refetched); a `useSyncExternalStore` store would read the same thenable on the first and re-render on the second.
- Still open: the core hook for promise identity, and the React store for re-renders.

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
- Suggestion for Q20.2, for a human to decide: a React store. Either D, if an Effect-first React package is wanted, or C's cache behind `useSyncExternalStore`. A bare link isn't enough on its own.

## After the spikes: both shipped as experimental packages

2026-10-16, decision [react-use-package](../decisions/react-use-package.md). D became `@trpc12/experimental-react-atom`, with hydration through a `Schema` that encodes with the links' serializer. C's ideas became `@trpc12/experimental-react`, after raf-query (`.repos/raf-query`), without C's core hook: the React client owns its promises (`createReactClient`'s store), so `request()` stays as it is. C's finding that a link alone isn't enough still holds. The query links (`cacheLink()` and the rest) are tRPC links in the chain that register cache behavior with the store; invalidation re-renders through `useSyncExternalStore` in `useQuery`. The spikes stay as the record of the experiment.
