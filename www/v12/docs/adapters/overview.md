---
title: Adapters
label: Overview
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
// handler.drain(): moves WebSocket clients to other servers
// handler.dispose(): ends requests and connections, then releases the layer
```

Procedures are served under `endpoint`, `/trpc` by default.

| Runtime                        | Serve with                                       | WebSockets            |
| ------------------------------ | ------------------------------------------------ | --------------------- |
| [Node](./node.md)              | `serve(handler)` on `NodeHttpServer`, or Express | yes                   |
| [Bun](./bun.md)                | `Bun.serve({ fetch: handler.fetch })`            | with `serve(handler)` |
| [Deno](./deno.md)              | `Deno.serve` on `handler.fetch`                  | `websocket.upgrade`   |
| [Workers, Next.js](./fetch.md) | `handler.fetch`                                  | in a Durable Object   |
| [AWS Lambda](./aws-lambda.md)  | `toLambdaHandler(handler)`                       | no                    |

The [`examples/runtime-matrix`](../../../../v12/examples/runtime-matrix/README.md) app serves one router on each of these and runs the same calls against every one: batching, errors, files, streaming, SSE, CORS and WebSockets.

## Middleware and CORS

Request-level concerns are Effect `HttpMiddleware` in the handler's `middleware` option, outermost first. They wrap `handler.fetch` and WebSocket upgrades too: under `serve()`/`toHttpEffect`, through `handler.fetch` with `websocket.upgrade` (Deno), and through Cloudflare's hibernating `sockets.upgrade()`. A socket you accept yourself and hand to `handler.websocket` or `sockets.accept()` skips them. Call-level concerns are root `t.use()` [middleware](../server/middleware.md).

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
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

## Request body size

The handler doesn't limit request bodies unless you set `maxBodySize`. Cap them where the request arrives: in your proxy (like nginx's `client_max_body_size`), your platform (Workers and Lambda have request size limits) or your framework's body parser.

On [Node](./node.md) with nothing in front of it, nothing caps the body, so set `maxBodySize` yourself. This applies to `NodeHttpServer`, `node:http`, and Express or Fastify handing the raw request to the handler. A larger JSON, multipart or form body gets a `413` with a `PAYLOAD_TOO_LARGE` error. 1 MiB is plenty for JSON inputs; allow more if you accept files.

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
const handler = createFetchHandler({
  router,
  maxBodySize: 1024 * 1024, // 1 MiB
});
```

`createV11Handler`, the OpenAPI handler and the MCP handler take the same option. A byte stream input has its own `maxBytes` instead.

## Rolling deploys

A server that stops closes its WebSockets and SSE streams, and clients lose the queries and mutations in flight. Drain it first: `handler.drain()` sends every WebSocket and socket client a `reconnect` message, and `wsLink` opens a new connection, moves its calls and subscriptions there once it's ready (each subscription from its last event id, stopped on the old connection only once the new one has answered it), and closes the old connection once the calls it sent there finish ([`wsLink`](../client/links/ws.md#rolling-deploys)). The drain ends when every client has moved, or at its timeout, when the handler closes what's left (code 1012, "service restart") and interrupts those calls. While it runs, the handler answers WebSocket upgrades with a 503 (and closes sockets handed to `handler.websocket` with 1012), so clients back off and reconnect to another server. Each SSE subscription gets a `reconnect` event too: `httpLink` opens a new stream, which the load balancer routes elsewhere, and leaves the old one once that's connected ([Subscriptions](../client/links/http.md#subscriptions)); a stream whose client stays ends at the timeout. A stream that starts during the drain isn't asked to move, and ends when the handler closes.

- `serve(handler)` drains when its layer is released, before the server stops, and answers upgrades with a 503 until it has: `NodeRuntime.runMain` releases it on SIGTERM.
- `handler.dispose()` drains, SSE streams included, while it waits for the requests in flight up to `websocket.drainTimeout`, answers what's still running with a 503, then releases the `layer` (not a `runtime` you passed). The handler takes no connections after. `await using handler = createFetchHandler(…)` calls it at the end of the block, and `makeFetchHandler` at the end of its `Scope`.
- Serving `toHttpEffect(handler)` or `handler.routes` yourself, or a runtime's own server, call `handler.drain()` before you stop it.

```ts
process.once('SIGTERM', async () => {
  await handler.drain({ timeout: '20 seconds' });
  server.close();
});
```

When the load balancer keeps routing to a stopping server for a while, notify clients without refusing anyone: `handler.broadcastReconnect({ drainIn })` sends every WebSocket, socket and SSE client a `reconnect` notice saying the connection closes in `drainIn`. It drains nothing and closes nothing. The links move as on a drain, and let the old connection go at `drainIn` if it's still open. Every notice carries its `drainIn`, a drain's being its timeout ([When the notice is sent](../subscriptions/overview.md#when-the-notice-is-sent)).

```ts
process.once('SIGTERM', async () => {
  // The platform kills the process 30 s after SIGTERM.
  await handler.broadcastReconnect({ drainIn: '20 seconds' });
  setTimeout(() => {
    void handler.dispose().then(() => server.close());
  }, 20_000);
});
```

The timeout is `createFetchHandler({ websocket: { drainTimeout } })`, `'10 seconds'` by default; keep it under your platform's grace period. Like every time option in tRPC, it takes an Effect `Duration.Input`: milliseconds, a string like `'30 seconds'`, or a `Duration`. A `MessagePort` has nowhere to move, so the drain waits for its calls and then closes it. Cloudflare's hibernating sockets don't drain, since a deploy gives the Durable Object no hook to run one: clients reconnect and resume as after a dropped connection.

## Compression

`@trpc12/trpc` doesn't compress. Your CDN or proxy (Cloudflare, Vercel, nginx) already negotiates `Accept-Encoding`, and does it better. If you add a compressing `HttpMiddleware`, skip `application/jsonl`, `application/vnd.trpc.frames` and `text/event-stream` responses: a gzip stream buffers until its window fills, which stalls subscriptions and streamed results.
