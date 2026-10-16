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

`headers`, `init` and `batch: false` (send this call alone) are read by `httpLink`, and `dedupe` by `dedupeLink`. A link of your own declares what it reads:

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

A link can also declare the errors it fails calls with, and the operation types it can't carry. Declared errors join every call's typed union (`defined: true`). Procedures of an unsupported type lose their method:

```ts
class RateLimited extends TrpcError.Tagged('RATE_LIMITED', {
  data: Schema.Struct({ retryAfter: Schema.Number }),
}) {}

const rateLimit = link.effect<{ errors: RateLimited }>(({ op, next }) =>
  budget.take() ? next(op) : Stream.fail(new RateLimited({ retryAfter: 5 })),
);
const restOnly = link<{ unsupported: 'subscription' }>(…);

const client = createTrpcClient({ router: routerType<AppRouter>(), links: [rateLimit, restOnly, httpLink({ url })] });
const [, err] = await safe(client.post.create.mutate(input));
if (err?.defined && err.code === 'RATE_LIMITED') retryIn(err.data.retryAfter);
client.onPost.subscribe; // type error: no link carries subscriptions
```

`splitLink` and `switchLink` lack an operation type only when every branch does. Built-in links carry every type, and their failures (`NETWORK_ERROR`, `CLIENT_CLOSED_REQUEST`) stay in the untyped part of the union. TanStack context helpers take the link types as their third type argument: `createTrpcContext<AppRouter, LinksContext<typeof links>, LinksTypes<typeof links>>()`.

## Links

- `httpLink({ url, batch?, headers?, init?, fetch?, maxUrlLength?, longQuery?, reconnect? })` sends queries as `GET`, mutations as `POST` and subscriptions as SSE. Outputs with nested promises, async iterables or files stream as JSONL; an unbatched call whose output is a `File` or `Blob` gets it as the raw response body. Inputs holding a `File` or `Blob` go alone as `multipart/form-data`.

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

- `wsLink({ url, connectionParams?, reconnect?, idleMs?, keepAlive? })` runs everything over one WebSocket. It pings every 30 s and reconnects when a ping goes unanswered for 10 s. The server closes a socket that sends nothing for 60 s (code 1001) and stops its subscriptions; set `createFetchHandler({ websocket: { idleTimeoutMs } })`, or `false` to keep silent sockets open.
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

Query inputs go in the URL as readable bracket notation: `?post[id]=1&tags[]=a`. Object keys are sorted (array order is kept), so equal inputs make the same URL and hit the same HTTP cache entry. With a sync [serializer](./serializers.md) or none, the input is `?input=<serialized JSON>`.

A query whose URL would be longer than `maxUrlLength` (2048) is sent with a body. That is `POST` by default; `longQuery: 'query'` uses the HTTP `QUERY` method, a safe method with a body that caches can key on. Every proxy on the way has to allow `QUERY`.

## Errors without try/catch

```ts
const [post, error] = await safe(client.post.byId.query({ id }));
const { data, error: err } = await safe(client.post.create.mutate(input));

const safeClient = createSafeClient(client);
const [p, e] = await safeClient.post.byId.query({ id });
```

## Validating on the client

Clients ship no schemas by default. To check calls against a contract in the browser, add `validationLink`: inputs are validated before anything is sent (the same `BAD_REQUEST` the server returns, so forms can show its issues), and results and subscription events are checked when they arrive (`PARSE_ERROR` when the server drifted from the contract):

```ts
const client = createTrpcClient({
  router: appContract,
  links: [validationLink({ contract: appContract }), httpLink({ url })],
});
```

Results are checked against the output's type side, so Effect Schema transformations don't run a second time. With `openApiLink`, whose results are plain JSON, `output: 'json'` decodes them with the Effect Schema's JSON codec, so `Date`s, `bigint`s and classes come back as their types. Standard Schema outputs are validated as they are.

## The Effect client

`createEffectClient` from `trpcdev/effect` returns an `Effect` per call and a `Stream` per subscription. Typed errors are in the error channel, and interrupting the fiber aborts the request.

```ts
const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url })],
});
const post = yield * client.post.byId.query({ id });
```

## Tracing

Every call runs in an Effect span named `trpc.<path>` (kind `client`), with `rpc.method`, `trpc.type` and `trpc.error.code` on failure. When an Effect tracer is installed, `httpLink` sends the span as `traceparent` and `b3` headers, and the server's `trpc.<path>` span joins the same trace:

```ts
import { NodeSdk } from '@effect/opentelemetry';

const program = client.post.byId
  .query({ id })
  .pipe(Effect.withSpan('page.load'));
await Effect.runPromise(program.pipe(Effect.provide(NodeSdk.layer(otel))));
```

With no tracer (the Promise client, or Effect's default), no headers are sent, so simple requests stay free of CORS preflights. `Effect.provideService(Tracer.DisablePropagation, true)` keeps the spans and drops the headers.

## Integrations

`trpcdev/extend` has what integrations build on: `createUntypedClient` (its options keep link fields in a `context` bag, beside `type`, `path` and `input`), `runLinks`, `runOperation` (`runLinks` in a client span, with trace propagation), `callProcedure`, the wire format and JSON Schema helpers.
