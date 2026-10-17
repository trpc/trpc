# Declared invalidation: a server extension plus `invalidationLink({ queryClient })`

2026-10-16. Question (decision [declared-invalidation-later](../decisions/declared-invalidation-later.md)): can a mutation declare what it invalidates on the server, and a link apply it to TanStack Query, without app code in `onSuccess`?

Code: `next/spikes/invalidation/`; run with `pnpm test` from `next/`. `@tanstack/query-core` 5.90.20, `effect` 4.0.2.

```ts
// server
const t = initTrpc<{ ctx: Context }>().concat(invalidation());
const rename = t.procedure
  .meta({ invalidates: ['post.list'] })
  .meta({
    invalidates: [
      (post: Post) => [{ path: 'post.byId', input: { id: post.id } }],
    ],
  })
  .input(z.object({ id: z.string(), title: z.string() }))
  .mutation(({ input }) => db.post.rename(input));

// client (second round, below)
createTrpcClient({
  router: routerType<AppRouter>(),
  links: chain(invalidationLink({ queryClient }), responseHttpLink({ url })),
});
await client.post.rename.mutate({ id: '1', title: 'Hi' });
// post.list and post.byId({ id: '1' }) are invalidated before the promise resolves
```

## What works

- The server half is an ordinary root extension: an `invalidates` meta key with `mergeMeta` concatenating lists, so a base procedure and its leaves both add targets, and one Effect middleware that, after a successful `next()`, writes the targets as a `trpc-invalidate` JSON header. Failed calls send none.
- The client half is an Effect link. Mutations go unbatched (a batch merges the calls' headers) with a `trpc-invalidation-ref` header; the link's `fetch` wrapper reads the response's `trpc-invalidate` for that ref, and the link awaits `queryClient.invalidateQueries` for each target before the mutation's value reaches the caller, as an `onSuccess` returning the promise would.
- Targets use the adapters' key shape, `[path.split('.'), { input }]`, so a path alone partially matches every input and a path with an input matches one query. Concurrent mutations keep their own targets through the ref.

## Findings

- Links see result streams, not responses, so a header needs the `fetch` wrapper and a ref to pair requests with responses. Shipping this cleanly wants response metadata on the link stream (headers for HTTP, a frame field for sockets), which would also let socket transports carry invalidations; today a WebSocket call can't.
- Root-extension middleware runs before the procedure's `.input()`, so it sees no parsed input (`input` is `undefined`). The spike computes targets from the output. If input-based targets matter, either middleware results expose the final input, or the extension's middleware is placed after `.input()` by the app (`.use(invalidating)`).
- The client takes a mutation's first value and interrupts the stream, so work after the value has to run in `Stream.tap`, not `Stream.onEnd`.
- Cross-origin, the response header must be listed in `access-control-expose-headers`.

## Lean

Keep it out of v1 as decided. If it comes, ship the server half as `invalidation()` and the link in `@trpc12/tanstack-query`, after links can read response metadata, so the `fetch` wrapper and ref header go away.

## Second round: links that need a provider after them

Human, 2026-10-16 (decision round): "Can't the invalidation link somehow require that another link with specific stuff on context is added and then read those things from the link? If so http link could always contain more stuff like response headers that decorate the chain. Spike it further".

Code: `next/spikes/invalidation/response-meta.ts`.

- **Needs and provides, checked.** A link's type can carry `Capabilities<TProvides, TNeeds>`. `chain(...links)` walks the array from the end and fails with `chain: a link needs 'response' from a link after it` when nothing below a link provides what it needs; a provider before it doesn't count, since a link only reads what's below. `invalidationLink` needs `'response'`; `responseHttpLink` provides it.
- **How the response comes back up.** The needing link puts an `onResponse` callback in the call's `op.context`; the provider calls it with `{ status, headers }` before the value goes up the stream; the needing link reads it on the first value (`withResponse`, on a `Deferred`). `responseHttpLink` is `httpLink` with the callback carried in the call's `init`, which `httpLink` spreads into `fetch`, and a wrapped `fetch` that reports. In the core change, `httpLink` would call `onResponse` itself.
- **What went away.** The ref header, the app-side `fetch` wrapper, and forcing mutations unbatched in the link. A call with an `init` holding a function is batched apart today, so batched mutations still go alone; with `onResponse` in `httpLink` proper, a batch would report its shared response to each call, which works for headers the server sets per batch but not per call (the spike's header is per call).
- **Over sockets** the provider would be `wsLink` with a per-frame meta field. Not built.
- **Not changed:** the server half, and extension middleware still sees no parsed input.

### Shape of the core change, if it ships

Shipped 2026-10-17 as below, with `provides` and `needs` on `LinkDecl` rather than in `'~types'` (see [`declared-invalidation-later.md`](../decisions/declared-invalidation-later.md)); the spike's `responseHttpLink` and `chain` predate it.

- `BuiltinCallOptions.onResponse?: (meta: { status, headers }) => void`, called by `httpLink` per response (per batch line for batches, with the batch's headers), and `TrpcLink`'s `'~types'` gaining `provides` and `needs`, checked by `createTrpcClient({ links })` the way `switchLink` names are.
- Batch lines would need their own headers for per-call metadata in a batch.
