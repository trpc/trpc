---
title: How should many live collections share one connection?
summary: Over SSE each live collection opens its own request, so HTTP/1.1's 6-connection cap applies. Rely on `wsLink` and HTTP/2, or pool them.
area: live
recommended: B
questions: [Q26.5]
links:
  - kind: spike
    label: live-queries
    url: ../../spikes/live-queries/
  - kind: proposal
    label: 26 Live queries and sync
    url: ../proposals/26-live-queries-and-sync.md
  - kind: decision
    label: live-queries
    url: ../decisions/live-queries.md
  - kind: decision
    label: fetch-sse
    url: ../decisions/fetch-sse.md
  - kind: note
    label: live-queries spike
    url: ../notes/live-queries.md
  - kind: docs
    label: Subscriptions over WebSockets
    url: https://v12.trpc.io/v12/docs/subscriptions/overview#over-websockets
---

# How should many live collections share one connection?

## Why it matters

`wsLink` already carries every subscription on one socket and resumes them all with `lastEventId` after a drop (the spike: 2 collections, 1 socket, changes rather than snapshots on resume). SSE is one fetch per subscription, so an app on HTTP/1.1 with several live collections open (a dev server, an old proxy) hits the browser's 6 connections per origin, and other requests queue behind them. The spike built a pooled subscription that avoids it.

## Options

### A) Keep it as it is: `wsLink` and HTTP/2

The docs say to use `wsLink`, or serve SSE over HTTP/2, which multiplexes requests on one connection.

```ts
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [wsLink({ url })],
});

createCollection(
  liveCollectionOptions({
    subscribe: (o) => client.post.live.subscribe(undefined, o),
    getKey,
  }),
);
createCollection(
  liveCollectionOptions({
    subscribe: (o) => client.todo.live.subscribe({ done: false }, o),
    getKey,
  }),
);
// two collections, one socket; both resume after a drop
```

- ✅ Nothing to build; already tested
- ❌ SSE over HTTP/1.1 still opens one request per collection

### B) A pooled live subscription for HTTP/1.1

One subscription carries many live queries: `{ subs: { [id]: { feed, input } } }`. Its event ids are a JSON cursor `{ [id]: id }`, so a reconnect, or a reopen with a changed set, resumes each query from its own position.

```ts
// server
const feeds = { posts: postFeed, todos: todoFeed };
const router = {
  live: t.procedure.input(PooledInput).subscription(liveFeeds(feeds)),
};

// client
const pool = createLivePool<typeof feeds>((input, opts) =>
  client.live.subscribe(input, opts),
);
const posts = createCollection(
  liveCollectionOptions({ subscribe: pool.feed('posts', {}), getKey }),
);
const done = createCollection(
  liveCollectionOptions({
    subscribe: pool.feed('todos', { done: true }),
    getKey,
  }),
);
```

- ✅ One SSE request however many collections are open, with no server state between requests
- ✅ Cheap reopens: the spike sent 3 snapshots for 3 queries across 3 opens, instead of 5; the server side is `Stream.mergeAll` over feeds
- ❌ Adding or dropping a collection reopens the stream (fine on navigation, not per keystroke), and the cursor in `Last-Event-ID` grows with the set
- ❌ One feed's failure ends them all until there are per-query error events

### C) Subscription batching in `httpLink`

Subscriptions started in the same tick share one SSE response, with per-call ids and a composite `Last-Event-ID`, for any subscription.

```ts
httpLink({ url, batch: { subscriptions: true } });
// GET /trpc/post.live,chat.onMessage?batch=1  ->  one text/event-stream
```

- ✅ Pools every subscription with no pooled procedure in the router
- ❌ A protocol and handler change; like B, a set change still reopens
- ❌ Worth it only once non-live subscriptions hit the cap

### D) One long-lived stream per client

Subscribe and unsubscribe are POSTs that carry the stream's connection id.

```ts
// GET  /trpc/~stream                -> SSE, first event { connectionId: 'c1' }
// POST /trpc/~subscribe   { connectionId: 'c1', id: 3, path: 'post.live', input }
// POST /trpc/~unsubscribe { connectionId: 'c1', id: 3 }
```

- ✅ Truly incremental: no reopen per set change
- ❌ Per-connection server state and sticky routing, which fight serverless and multi-instance deployments; WebSockets already are this

## Recommendation

**B**, with A's docs either way. The pool is plain `Stream.mergeAll` on the server and needs no transport change, and the cursor makes a reopen resume rather than resnapshot. C waits until ordinary subscriptions hit the cap.

## Blocked until answered

- Nothing ships yet: B's `liveFeeds` merges the server half's feeds, so it follows [`live-query-server.md`](./live-query-server.md). `createLivePool` would go in `@trpc12/experimental-tanstack-db`.

## Details

The spike's `liveFeeds` and `createLivePool` predate the shipped adapter: they used a `feed` option and integer versions. Shipped, `pool.feed(name, input)` would return a `subscribe` function for `liveCollectionOptions`, and the cursor would hold each query's last `tracked()` id. A set change reopens on the next macrotask, so collections created together share one open.
