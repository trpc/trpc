# Client

```ts
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    dedupeLink(),
    httpLink({ url: 'http://localhost:3000/trpc', batch: true }),
  ],
});

await client.post.byId.query({ id: '1' }, { signal });
await client.post.create.mutate({ title: 'Hi' });
for await (const event of client.onPost.subscribe()) render(event);
```

## Call options

The second argument holds `signal` (and `lastEventId` for subscriptions) plus the fields links read. Links declare those fields, and a client made with `router:` types them:

```ts
await client.post.byId.query(
  { id },
  { signal, dedupe: false, headers: { 'x-trace': id } },
);
```

`headers` and `init` are read by `httpLink`, and `dedupe` by `dedupeLink`. A link of your own declares what it reads:

```ts
const traceLink = link<{ context: { traceId?: string } }>(
  async ({ op, next }) => {
    span(op.context.traceId);
    return next(op);
  },
);
// client.post.byId.query(input, { traceId: 'abc' })
```

Links receive the fields in `op.context`. `signal` and `lastEventId` are reserved: a link declaring either is a type error. With `createTrpcClient<AppRouter>({ links })` (no `router:`), the fields come from the `TrpcClientContext` interface, which you can augment.

## Links

- `httpLink({ url, batch?, headers?, init?, fetch?, maxUrlLength?, longQuery?, reconnect? })` sends queries as `GET`, mutations as `POST` and subscriptions as SSE. Outputs with nested promises or async iterables stream as JSONL. Inputs holding a `File` or `Blob` go alone as `multipart/form-data`.

  `init` sets `fetch` options. The link's `init` is a default, or a function called once per HTTP request with the calls it carries; a call's `init` is merged onto it (shallowly, but `headers` and `next` key by key). Calls with different `init`s are batched apart. `next` passes Next's data-cache options through:

  ```ts
  httpLink({
    url,
    init: ({ ops }) => ({ cache: 'no-store', headers: forwardCookies() }),
  });
  await client.post.list.query(input, {
    init: { next: { revalidate: 60, tags: ['posts'] } },
  });
  ```

- `wsLink({ url, connectionParams?, reconnect?, idleMs?, keepAlive? })` runs everything over one WebSocket. It pings every 30 s and reconnects when a ping goes unanswered for 10 s.
- `splitLink({ condition, true, false })` picks a chain per call; its `condition` sees typed paths.
- `switchLink({ name, links, pick })` picks one of several named chains, and a call can force one (below).
- `dedupeLink()` shares identical queries in flight.
- `localLink({ router })` calls a router in-process.
- `messagePortLink({ port })` talks to a worker.

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

`link(async ({ op, next }) => …)` writes a Promise link and `link.effect(({ op, next }) => stream)` an Effect one.

A link can change the operation it passes on. That lets one client cover routers served by different backends, even ones with different contexts:

```ts
const unprefix = (prefix: string) =>
  link.effect(({ op, next }) =>
    next({ ...op, path: op.path.slice(prefix.length + 1) }),
  );

createTrpcClient<{ blog: BlogRouter; shop: ShopRouter }>({
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

Query inputs go in the URL as readable bracket notation: `?post[id]=1&tags[]=a`. Object keys are sorted (array order is kept), so equal inputs make the same URL and hit the same HTTP cache entry.

A query whose URL would be longer than `maxUrlLength` (2048) is sent with a body. That is `POST` by default; `longQuery: 'query'` uses the HTTP `QUERY` method, a safe method with a body that caches can key on. Every proxy on the way has to allow `QUERY`.

## Errors without try/catch

```ts
const [post, error] = await safe(client.post.byId.query({ id }));
const { data, error: err } = await safe(client.post.create.mutate(input));

const safeClient = createSafeClient(client);
const [p, e] = await safeClient.post.byId.query({ id });
```

## The Effect client

`createEffectClient` from `trpcdev/effect` returns an `Effect` per call and a `Stream` per subscription. Typed errors are in the error channel, and interrupting the fiber aborts the request.

```ts
const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url })],
});
const post = yield * client.post.byId.query({ id });
```

## Integrations

`trpcdev/extend` has what integrations build on: `createUntypedClient` (its options keep link fields in a `context` bag, beside `type`, `path` and `input`), `runLinks`, `callProcedure`, the wire format and JSON Schema helpers.
