---
title: Context
description: What every call gets as `ctx`, where it comes from, and how middleware adds to it.
section: Server
order: 5
---

`ctx` is what a call knows about where it came from: the user, a database, the platform. Its type is the root `ctx` you give `initTrpc`:

```ts twoslash
import { initTrpc } from '@trpc12/trpc/server';

interface User {
  id: string;
}

const t = initTrpc<{ ctx: { user: User | null } }>();
```

## From the request

The handler's `createContext` makes it from the request (and, on runtimes like Workers, the platform argument). It runs once per HTTP request, so the calls in a batch share one `ctx`, and once per call over a WebSocket or `MessagePort`; `opts.info.calls` lists the paths it serves. Its type comes from the root router, made with `t.router()`, which records `t`'s root `ctx` ([Routers](./routers.md)):

```ts twoslash
// ---cut-start---
import { appRouter } from './server.ts';
// ---cut-end---
import { createFetchHandler } from '@trpc12/trpc/server';

const handler = createFetchHandler({
  router: appRouter,
  createContext: (opts) => ({
    user: opts.request.headers['x-user']
      ? { id: opts.request.headers['x-user'], name: 'Ada' }
      : null,
  }),
});
```

`request` is Effect's `HttpServerRequest`: `headers` is a record of lowercase names, and on fetch runtimes `request.source` is the web `Request`. On Node the request is never converted to a web `Request` ([Node](../adapters/node.md)). The platform argument is described in [Fetch runtimes](../adapters/fetch.md#platform-arguments).

WebSocket calls get their upgrade request. Browsers send cookies with an upgrade from any site, so when `ctx` comes from cookies, add [`cors()`](../adapters/overview.md#middleware-and-cors) to refuse upgrades from other origins.

## From middleware

Middleware adds to the `ctx` with `next({ ctx })`, and the procedures after it see the narrowed type ([Middleware](./middleware.md)). A middleware published by a package states the `ctx` it needs; on a procedure that lacks a key, the key becomes a requirement that `createContext` must supply.

## In-process calls

In-process calls have no HTTP request: you pass the `ctx` yourself (`createRouterClient` also takes a function that makes it, run per call), and the handler's `createContext` doesn't run. To share request-reading code with the handler, keep it in a function of the request and build one: `ctx: () => contextFor(HttpServerRequest.fromWeb(new Request(url, { headers })))`. See [Server-side calls](./server-side-calls.md).

## Services instead of `ctx`

Things built once for the whole server (a connection pool, a mailer) can be Effect services in the handler's `layer` instead of `ctx` keys: the layer is built once, and resolvers that return an `Effect` ask for them ([Effect](./effect.md)).
