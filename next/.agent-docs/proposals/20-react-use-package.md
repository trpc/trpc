# 20 — A `use()`-native React package (exploratory)

| Status           | Area         | Depends on     | oRPC parity rows  |
| ---------------- | ------------ | -------------- | ----------------- |
| `needs-research` | integrations | 15, 16, 17, 19 | — (beyond parity) |

## Summary

`ideas.md`: "Possibly a new `use()`-native React package."

This proposal frames the options and **recommends deferring the decision** until the core and the TanStack integration exist. Only one constraint must hold now: nothing in the client or link design may prevent a cache layer built on links.

## Today (v11)

- `@trpc/react-query` (classic hooks, to be deleted) and `@trpc/tanstack-react-query` (options proxy).
- [#5498](https://github.com/trpc/trpc/pull/5498) prototyped `createReactClient` with request dedupe and link-driven re-renders, together with typed link decorations (17).
- [#6184](https://github.com/trpc/trpc/pull/6184) explored a standalone `queryOptions` package on React 19.
- [#5569](https://github.com/trpc/trpc/pull/5569) explored an RSC data layer with `.action()` (15).

## What "`use()`-native" could mean

```tsx
// Suspense-first reads: the promise is cached by key, so `use()` gets a stable promise
function Post({ id }: { id: string }) {
  const post = use(trpc.post.byId.query({ id }));
  return <h1>{post.title}</h1>;
}

// RSC → client: start the request on the server, pass the promise, `use()` it on the client
const postPromise = caller.post.byId({ id }); // server component
<Post postPromise={postPromise} />;

// Actions
const [state, submit, pending] = useActionState(
  action(createPost),
  initialState,
); // 15
```

## Options

- **U-A — Thin layer over TanStack Query.** `use(queryClient.ensureQueryData(trpc.x.queryOptions(…)))` helpers with suspense-friendly utilities. Cache, invalidation and devtools come from TanStack.

  ```tsx
  // U-A: `trpc` is createTRPCQueryUtils({ client }) from 19
  function Post({ id }: { id: string }) {
    const queryClient = useQueryClient();
    const post = use(
      queryClient.ensureQueryData(
        trpc.post.byId.queryOptions({ input: { id } }),
      ),
    );
    return <h1>{post.title}</h1>;
  }
  // invalidation, devtools and so on stay TanStack's: queryClient.invalidateQueries(trpc.post.pathFilter())
  ```

- **U-B — Standalone cache built on links.**
  - A small, Effect-backed cache (`Cache`/`Request` deduplication) that lives in a link (`cacheLink`) and exposes stable promises for `use()`.
  - Link decorations add `{ ignoreCache, revalidate }` call options (17).
  - No TanStack dependency.
  - ❌ A second cache to build, document and maintain.

  ```tsx
  // U-B: no QueryClient; the cache is a link
  const client = createTRPCClient({
    router: type<AppRouter>(),
    links: [cacheLink(), httpLink({ url })],
  });

  function Post({ id }: { id: string }) {
    const post = use(client.post.byId.query({ id })); // same promise for the same key while cached
    return <h1>{post.title}</h1>;
  }
  await client.post.byId.query({ id }, { ignoreCache: true }); // or under `context`, per 17 F-B
  ```

- **U-C — Defer.** Ship TanStack only. Revisit after users try vNext with React 19 patterns.

## Recommendation

**U-C** (defer), with one guardrail: link decorations (17) and stable promise identity for in-flight dedupe must remain possible, so that U-B can be built later as a link without changing the core.

## Questions

- **Q20.1** Defer (U-C)? Or commit now to U-A or U-B?
- **Q20.2** If U-B: does the cache belong in a link (`cacheLink`) or in a React-specific store?
- **Q20.3** Is RSC promise-passing (server-started requests consumed with `use()` on the client) a v1 goal?

## Decision

- **Q20.1:** [ ] U-C defer · [ ] U-A · [ ] U-B
- **Q20.2:** [ ] link · [ ] React store · [ ] n/a
- **Q20.3:** [ ] yes · [ ] no
- **Notes:**
