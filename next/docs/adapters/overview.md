---
title: Adapters
description: One handler serves HTTP, SSE and WebSockets on every runtime; pick the adapter for yours.
section: Adapters
order: 1
v11: server/adapters
---

`createFetchHandler()` returns a web-standard `fetch(request)`. Anything that speaks `Request` and `Response` can serve it directly. On Effect's `HttpServer`, `@trpc12/trpc/http` adds WebSockets, client-disconnect aborts, and Effect's platform layers.

```ts twoslash
// ---cut-start---
import { createFetchHandler } from '@trpc12/trpc/server';
import { Layer } from 'effect';
import { appRouter as router, type Context } from './server.ts';
declare function createContext(): Context;
declare const layer: Layer.Layer<never>;
// ---cut-end---
const handler = createFetchHandler({ router, createContext, layer });
// handler.fetch(request): Promise<Response>
// handler.websocket(socket, { request })
// handler.dispose(): releases the layer
```

Procedures are served under `endpoint`, `/trpc` by default.

| Runtime                                 | Serve with                                       | WebSockets                      |
| --------------------------------------- | ------------------------------------------------ | ------------------------------- |
| [Node](./node.md)                       | `serve(handler)` on `NodeHttpServer`, or Express | yes                             |
| [Bun](./bun.md)                         | `Bun.serve({ fetch: handler.fetch })`            | with `serve(handler)`           |
| [Deno](./deno.md)                       | `Deno.serve`                                     | `handler.websocket`             |
| [Workers, Next.js](./fetch.md)          | `handler.fetch`                                  | in a Durable Object             |
| [AWS Lambda](./aws-lambda.md)           | `toLambdaHandler(handler)`                       | no                              |
| [Durable Objects](./durable-objects.md) | `experimental_createHibernatingWebSockets`       | hibernating                     |
| [Message ports](./message-ports.md)     | `handler.messagePort(port)`                      | n/a                             |
| [Firebase](./firebase.md)               | `call()` in `onCall`                             | no                              |
| [Raw sockets](./sockets.md)             | `serveSocket(handler)`                           | the WebSocket protocol over TCP |

## Middleware and CORS

Request-level concerns are Effect `HttpMiddleware` in the handler's `middleware` option, outermost first. They wrap `handler.fetch` and, under `serve()`/`toHttpEffect`, WebSocket upgrades too. Call-level concerns are root `t.use()` [middleware](../server/middleware.md).

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = { health: t.procedure.query(() => 'ok') };
// ---cut-end---
import { HttpMiddleware } from 'effect/http';
import { cors } from '@trpc12/trpc/http';

const handler = createFetchHandler({
  router,
  middleware: [
    cors({ allowedOrigins: ['https://app.example.com'], credentials: true }),
    HttpMiddleware.logger,
  ],
});
```

`cors()` is Effect's `HttpMiddleware.cors` plus an origin check on WebSocket upgrades (403 for other origins). Browsers send cookies with cross-site upgrades and CORS doesn't cover them, so use it when you authenticate with cookies.

## Compression

@trpc12/trpc doesn't compress. Your CDN or proxy (Cloudflare, Vercel, nginx) already negotiates `Accept-Encoding`, and does it better. If you add a compressing `HttpMiddleware`, skip `application/jsonl`, `application/vnd.trpc.frames` and `text/event-stream` responses: a gzip stream buffers until its window fills, which stalls subscriptions and streamed results.
