---
title: Links
description: httpLink, wsLink, splitLink, switchLink and the other built-in links, and how calls travel over HTTP.
section: Client
order: 2
---

A client's `links` is a chain: each link gets the operation and the rest of the chain, and the last one sends it.

- `httpLink({ url, batch?, headers?, init?, fetch?, maxUrlLength?, longQuery?, binary?, reconnect? })` sends queries as `GET`, mutations as `POST` and subscriptions as SSE. Outputs with nested promises, async iterables or files stream as JSONL (or, with `binary: true`, as [binary frames](../server/files.md#binary-frames) that carry file bytes unencoded); an unbatched call whose output is a `File` or `Blob` gets it as the raw response body. Inputs holding a `File` or `Blob` go alone as `multipart/form-data`.
- `wsLink({ url, connectionParams?, reconnect?, idleMs?, keepAlive?, binary? })` runs everything over one WebSocket. It pings every 30 s and reconnects when a ping goes unanswered for 10 s. The server closes a socket that sends nothing for 60 s (code 1001) and stops its subscriptions; set `createFetchHandler({ websocket: { idleTimeoutMs } })`, or `false` to keep silent sockets open. With `binary: true`, file bytes in outputs arrive as binary messages instead of base64 text.
- `splitLink({ condition, true, false })` picks a chain per call; its `condition` sees typed paths.
- `switchLink({ name, links, pick })` picks one of several named chains, and a call can force one (below).
- `dedupeLink()` shares identical queries in flight.
- `retryLink({ retries?, retry?, delayMs? })` retries failed calls: by default queries only, on errors outside the typed union (network failures, 5xx), three times. `delayMs` gets the error, so it can wait a [rate limit's](../middleware/rate-limit.md) `retryAfter`.
- `loggerLink({ enabled? })` logs every operation, its results and its errors.
- `localLink({ router })` calls a router in-process.
- `validationLink({ contract })` checks calls against a contract ([Validating on the client](./validation.md)).
- `experimental_durableLink()` retries lost responses with the same call id ([Durable calls](../middleware/durable.md)).
- `experimental_messagePortLink({ port })` talks to a worker ([Message ports](../adapters/message-ports.md)).
- `experimental_socketLink({ socket })` runs everything over a raw TCP, TLS or Unix socket, with `wsLink`'s options ([Raw sockets](../adapters/sockets.md)).

## Request options

`init` sets `fetch` options. The link's `init` is a default, or a function called once per HTTP request with the calls it carries; a call's `init` is merged onto it (shallowly, but `headers` and `next` key by key). Calls with different `init`s are batched apart. `next` passes Next's data-cache options through:

```ts
httpLink({
  url,
  init: () => ({ cache: 'no-store', headers: forwardCookies() }),
});
await client.post.list.query(input, {
  init: { next: { revalidate: 60, tags: ['posts'] } },
});
```

## Switching transports

`switchLink`'s `name` becomes a typed call option, so one call can override `pick`:

```ts
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    switchLink({
      name: 'transport',
      links: {
        http: httpLink({ url, batch: true }),
        ws: wsLink({ url: wsUrl }),
      },
      pick: (op) => (op.type === 'subscription' ? 'ws' : 'http'),
    }),
  ],
});
await client.report.query(input, { transport: 'http' });
```

A branch can be a chain (an array of links), including another `switchLink`. The name can't be `signal`, `lastEventId`, `init`, `headers` or `reconnect`, and two switch links on one chain can't share a name; both are type errors and throw when the link is made.

## One client, several backends

A link can change the operation it passes on. That lets one client cover routers served by different backends, even ones with different contexts:

```ts
const unprefix = (prefix: string) =>
  link((opts) =>
    opts.next({ ...opts.op, path: opts.op.path.slice(prefix.length + 1) }),
  );

createTrpcClient({
  router: routerType<{ blog: BlogRouter; shop: ShopRouter }>(),
  links: [
    splitLink({
      condition: (op) => op.path.startsWith('shop.'),
      true: [unprefix('shop'), httpLink({ url: shopUrl })],
      false: [unprefix('blog'), httpLink({ url: blogUrl })],
    }),
  ],
});
```

## Query URLs

Query inputs go in the URL as `?input=<JSON>`: `?input={"post":{"id":"1"}}`, URL-encoded. Object keys are sorted (array order is kept), so equal inputs make the same URL and hit the same HTTP cache entry. A [serializer](../server/serializers.md) that makes refs adds `&refs=`.

A query whose URL would be longer than `maxUrlLength` (2048) is sent with a body. That is `POST` by default; `longQuery: 'query'` uses the HTTP `QUERY` method, a safe method with a body that caches can key on. Every proxy on the way has to allow `QUERY`.

## Writing links

`link(({ op, next }) => stream)` writes a link of your own, and declares the call options it reads, the errors it fails with and what it needs from the links after it ([Custom links](./custom-links.md)).
