---
title: Serving v11 clients
description: createV11Handler serves the new router to @trpc/client 11 apps on the endpoint they already call, in v11's wire format and error shape.
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

| v11 link                      | Served                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `httpLink`, `httpBatchLink`   | `GET` queries, `POST` mutations, `?batch=1` batches (at most 100 calls by default: `batch: { maxItems }`, or `batch: false`), `207` when a batch's statuses differ         |
| `httpBatchStreamLink`         | JSON Lines: each call's result as it settles, and promises and async iterables at the root or a top-level key of an output                                                 |
| `httpSubscriptionLink`        | SSE with `tracked()` ids, `ping`, `return` and `serialized-error` events; a reconnect's `lastEventId` (in the input, as v11 sends it) reaches the resolver's `lastEventId` |
| `wsLink`                      | queries, mutations, subscriptions with `subscription.stop`, `connectionParams`, `PING`/`PONG`                                                                              |
| `FormData` and `octet-stream` | a form becomes an object (bracket notation, files as `File`s); bytes become a `Blob`                                                                                       |

Errors go out in v11's shape, so `TRPCClientError` reads them: `{ message, code: -32004, data: { code: 'NOT_FOUND', httpStatus: 404, path } }`. A code v11 doesn't have (`POST_LOCKED`, declared with status `423`) takes v11's code for its status, `INTERNAL_SERVER_ERROR` when there's none; the HTTP status stays. If the v11 router had an `errorFormatter`, reproduce it:

```ts twoslash
// ---cut-start---
import { createV11Handler } from '@trpc12/trpc/interop';
import { initTrpc } from '@trpc12/trpc/server';
import { db } from './server.ts';
const t = initTrpc();
const appRouter = { post: { list: t.procedure.query(() => db.post.list()) } };
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

Outputs go out as v11 sent them, `JSON.stringify` after the transformer, so the old apps' types still describe them. They keep compiling against the v11 `AppRouter` type they were built with; nothing on the client changes.

What differs from a v11 server:

- `createContext` runs once per WebSocket message, as for v12 sockets, not once per connection. It gets `info.connectionParams`.
- `httpLink` and `httpBatchLink` get an output's promises settled; a procedure that returns an async iterable needs `httpBatchStreamLink` (as in v11).
- `responseMeta` is gone: procedures set headers and status on their `response` handle, and the v11 handler sends them.
