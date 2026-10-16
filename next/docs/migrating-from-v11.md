# Migrating from v11

Move the server first. `createV11Handler` serves the new router to `@trpc/client` 11 apps on the endpoint they already call, so you can deploy before every client (a mobile app in the stores, a tab left open) updates. Then move the clients to `@trpc12/trpc/client` and drop the old endpoint.

## Serve old clients while you migrate

```ts
import superjson from 'superjson';
import { createV11Handler } from '@trpc12/trpc/interop';
import { createFetchHandler } from '@trpc12/trpc/server';

// Old apps: @trpc/client 11, on /trpc, with the transformer they were built with.
const legacy = createV11Handler({
  router: appRouter,
  createContext,
  transformer: superjson,
});
// New clients: the v12 protocol, on /rpc.
const handler = createFetchHandler({
  router: appRouter,
  createContext,
  endpoint: '/rpc',
});

export default {
  fetch: (request: Request) =>
    new URL(request.url).pathname.startsWith('/trpc/')
      ? legacy.fetch(request)
      : handler.fetch(request),
};
```

Under `serve()` from `@trpc12/trpc/http`, the v11 handler runs as its own Effect HTTP app, and WebSocket upgrades on its endpoint reach `legacy.websocket()`.

It speaks every v11 link:

| v11 link                      | Served                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `httpLink`, `httpBatchLink`   | `GET` queries, `POST` mutations, `?batch=1` batches (at most 100 calls by default: `batch: { maxItems }`, or `batch: false`), `207` when a batch's statuses differ         |
| `httpBatchStreamLink`         | JSON Lines: each call's result as it settles, and promises and async iterables at the root or a top-level key of an output                                                 |
| `httpSubscriptionLink`        | SSE with `tracked()` ids, `ping`, `return` and `serialized-error` events; a reconnect's `lastEventId` (in the input, as v11 sends it) reaches the resolver's `lastEventId` |
| `wsLink`                      | queries, mutations, subscriptions with `subscription.stop`, `connectionParams`, `PING`/`PONG`                                                                              |
| `FormData` and `octet-stream` | a form becomes an object (bracket notation, files as `File`s); bytes become a `Blob`                                                                                       |

Errors go out in v11's shape, so `TRPCClientError` reads them: `{ message, code: -32004, data: { code: 'NOT_FOUND', httpStatus: 404, path } }`. A code v11 doesn't have (`POST_LOCKED` with status `423`) takes v11's code for its status, `INTERNAL_SERVER_ERROR` when there's none; the HTTP status stays. If the v11 router had an `errorFormatter`, reproduce it:

```ts
createV11Handler({
  router: appRouter,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError: error.code === 'BAD_REQUEST' ? error.data : null,
    },
  }),
});
```

Outputs go out as v11 sent them, `JSON.stringify` after the transformer, so the old apps' types still describe them. They keep compiling against the v11 `AppRouter` type they were built with; nothing on the client changes.

What differs from a v11 server:

- `createContext` runs once per WebSocket message, as for v12 sockets, not once per connection. It gets `info.connectionParams`.
- `httpLink` and `httpBatchLink` get an output's promises settled; a procedure that returns an async iterable needs `httpBatchStreamLink` (as in v11).
- `responseMeta` is gone: procedures set headers and status on their `response` handle, and the v11 handler sends them.

## Run the codemod

```sh
npx @trpc12/upgrade src          # dry run: what would change, what's left
npx @trpc12/upgrade src --write
```

It rewrites what has one v12 form (imports, `initTRPC`, `TRPCError`, `mergeRouters`, `createCaller`, `fetchRequestHandler`, the HTTP links and their `transformer`, `createTRPCContext`'s names) and keeps your formatting. The rest it prints as `file:line:column` steps, with the v12 way:

```
would upgrade src/server/trpc.ts
src/server/trpc.ts:4:3 transformer: drop it here; pass the same createSyncSerializer(transformer) to the handler and every link
src/server/index.ts:1:1 observable() subscriptions: return an async generator or an Effect Stream
```

## Links

Your own v11 links (`TRPCLink`s) run in a v12 chain through `fromV11Link`, so you can move them over one at a time:

```ts
import { fromV11Link } from '@trpc12/trpc/interop';

createTrpcClient({
  router: routerType<AppRouter>(),
  links: [fromV11Link(authLink), httpLink({ url })],
});
```

The v11 link gets v11 operations and observables, so `observable()`, `tap()` and `share()` from `@trpc/server/observable` work as before. What it gets from `next` differs in two ways:

- Errors are v12 `TrpcError`s, with the code on `error.code`. Errors the link fails with keep their `data.code`.
- Subscription results are `{ type: 'started' }`, then `{ type: 'data', data }` for each event; there is no `stopped` result.

A v11 terminating link (one that sends the request itself, such as v11's `httpBatchLink`) works too.

Rewritten for v12, a link returns an Effect `Stream`:

```ts
const authLink = link(({ op, next }) =>
  next({
    ...op,
    context: { ...op.context, headers: { authorization: token() } },
  }),
);
```

## API changes

| v11                                                                | v12                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `@trpc/server`, `@trpc/client`                                     | `@trpc12/trpc/server`, `@trpc12/trpc/client`                                                                                      |
| `initTRPC.context<Ctx>().meta<Meta>().create()`                    | `initTrpc<{ ctx: Ctx; meta: Meta }>()`                                                                                            |
| `t.router({ … })`, `t.mergeRouters(a, b)`                          | a plain object, `{ ...a, ...b }` (`router()` and `mergeRouters()` still exist)                                                    |
| `throw new TRPCError({ code })`                                    | `return error({ code })`, or `throw new TrpcError({ code })`                                                                      |
| `create({ errorFormatter })`                                       | declared errors (`.errors()`, `TrpcError.Tagged`) with typed `data`                                                               |
| `create({ transformer: superjson })` and each link's `transformer` | `serializer` on the handler and every link; plain JSON by default, danSON with `createSerializer()` (Dates, Maps, BigInts, files) |
| `fetchRequestHandler({ endpoint, req, router, createContext })`    | `createFetchHandler({ endpoint, router, createContext }).fetch(req)`                                                              |
| `createContext({ req, resHeaders })`                               | `createContext({ request, info })`; headers go on the procedure's `response` handle                                               |
| adapters (standalone, express, next, aws-lambda, ws)               | one handler: see [Platforms](./platforms.md)                                                                                      |
| `createTRPCClient<AppRouter>({ links })`                           | `createTrpcClient({ router: routerType<AppRouter>(), links })`                                                                    |
| `httpBatchLink`, `httpBatchStreamLink`, `httpSubscriptionLink`     | `httpLink({ url, batch: true })` streams and subscribes too                                                                       |
| `createWSClient` + `wsLink({ client })`                            | `wsLink({ url })`                                                                                                                 |
| `TRPCClientError`                                                  | `TrpcError`; `safe()` for `[data, error]`                                                                                         |
| `t.createCallerFactory(router)(ctx)`                               | `createRouterClient(router, { ctx })`                                                                                             |
| subscriptions returning `observable()`                             | an async generator or an Effect `Stream`                                                                                          |
| `input.lastEventId` in a subscription                              | the resolver's `lastEventId` option                                                                                               |
| `.subscribe(input, { onData, onError })`                           | `for await (const event of client.x.subscribe(input))`                                                                            |
| `@trpc/react-query`, `@trpc/tanstack-react-query`                  | `@trpc12/tanstack-react-query` (and Solid, Svelte, Vue, Angular, Preact, Lit)                                                     |
