---
title: Serving v11 clients
description: "`createV11Handler` serves the new router to `@trpc/client` 11 apps on the endpoint they already call, in v11's wire format and error shape."
section: Migrations
parent: migrations/from-v11
order: 1
---

Move the server first. `createV11Handler` from `@trpc12/trpc/interop` serves the new router to `@trpc/client` 11 apps on the endpoint they already call, so you can deploy before every client (a mobile app in the stores, a tab left open) updates. Serve the v12 protocol next to it, on another endpoint:

```ts twoslash
// ---cut-start---
import { appRouter, type Context } from './server.ts';
declare function createContext(): Context;
// ---cut-end---
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

| v11 link                      | Served                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `httpLink`, `httpBatchLink`   | `GET` queries, `POST` mutations, `?batch=1` batches (at most 100 calls by default: `batch: { maxItems }`, or `batch: false`), `207` when a batch's statuses differ                                           |
| `httpBatchStreamLink`         | JSON Lines: each call's result as it settles, and promises and async iterables at the root or a top-level key of an output                                                                                   |
| `httpSubscriptionLink`        | SSE with `tracked()` ids, `ping`, `return` and `serialized-error` events; a reconnect's `lastEventId` (in the input, as v11 sends it) reaches the resolver's `lastEventId`                                   |
| `wsLink`                      | queries, mutations, subscriptions with `subscription.stop`, `connectionParams`, `PING`/`PONG`; a message's array of calls is capped like a batch (`batch.maxItems`, 100 by default even with `batch: false`) |
| `FormData` and `octet-stream` | a form becomes an object (bracket notation, files as `File`s); bytes become a `Blob`                                                                                                                         |

A batch over the cap runs none of its calls and fails with the error v11 sends for one over its `maxBatchSize` (`BAD_REQUEST`, "Batch call exceeds maximum size"): over HTTP for the whole request, over a WebSocket for each call in the message. v11's own WebSocket handler had no cap.

Errors go out in v11's shape, so `TRPCClientError` reads them: `{ message, code: -32004, data: { code: 'NOT_FOUND', httpStatus: 404, path } }`. A code v11 doesn't have (`POST_LOCKED`, declared with status `423`) takes v11's code for its status, `INTERNAL_SERVER_ERROR` when there's none; the HTTP status stays. If the v11 router had an `errorFormatter`, reproduce it:

```ts twoslash
// ---cut-start---
import { createV11Handler } from '@trpc12/trpc/interop';
import { initTrpc } from '@trpc12/trpc/server';
import { db } from './server.ts';
const t = initTrpc();
const appRouter = t.router({
  post: { list: t.procedure.query(() => db.post.list()) },
});
// ---cut-end---
createV11Handler({
  router: appRouter,
  errorFormatter: (opts) => ({
    ...opts.shape,
    data: {
      ...opts.shape.data,
      zodError: opts.error.code === 'BAD_REQUEST' ? opts.error.data : null,
    },
  }),
});
```

Outputs go out as v11 sent them, `JSON.stringify` after the transformer, so the old apps' types still describe them. They keep compiling against the v11 `AppRouter` type they were built with; nothing on the client changes. An app you keep working on before it moves can [take its types from the new router](#typing-v11-clients-from-the-new-router) instead.

What differs from a v11 server:

- `createContext` runs once per WebSocket message, as for v12 sockets, not once per connection. It gets `info.connectionParams`.
- `httpLink` and `httpBatchLink` get an output's promises settled; a procedure that returns an async iterable needs `httpBatchStreamLink` (as in v11).
- `responseMeta` is gone: procedures set headers and status on their `response` handle, and the v11 handler sends them. A batch's `cache-control` is the strictest policy every call in it allows; a call that sets none keeps the batch uncached.

## Typing v11 clients from the new router

A deployed app needs no types, but an app you keep working on while it's still on `@trpc/client` 11 does, and the v12 `AppRouter` doesn't fit `createTRPCClient<AppRouter>()`. Either keep the old router's type until the app moves, or build a v11 router type from the new router with `@trpc/server`'s own types, so procedures you add show up in the old app too:

```sample title="v11-app-router.ts"
docs/src/v11-app-router.ts
```

The old app imports it as its `AppRouter`:

```ts twoslash
// ---cut-start---
import type { V11AppRouter } from './v11-app-router.ts';
// ---cut-end---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const client = createTRPCClient<V11AppRouter>({
  links: [httpBatchLink({ url: '/trpc', transformer: superjson })],
});
const post = await client.post.byId.query({ id: '1' });
//    ^?
```

Inputs are what the v12 schemas accept, and outputs what the procedures return, as `createV11Handler` sends them. Subscription events are `{ id, data }` for `tracked()` ones, as v11 typed them.
