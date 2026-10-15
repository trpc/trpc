# Platforms

`createFetchHandler()` returns a web-standard `fetch(request)`. Anything that speaks `Request` and `Response` can serve it directly. On Effect's `HttpServer`, `trpcdev/http` adds WebSockets, client-disconnect aborts, and Effect's platform layers.

```ts
const handler = createFetchHandler({ router, createContext, layer });
// handler.fetch(request): Promise<Response>
// handler.websocket(socket, { request })
// handler.dispose(): releases the layer
```

Procedures are served under `endpoint`, `/trpc` by default.

## Node, the Effect way

```ts
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from 'trpcdev/http';

serve(handler).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

`serve` takes `endpoint` and `allowOrigin`. Browsers send cookies with cross-site WebSocket upgrades, so check `origin` when you authenticate with cookies. Any Effect `HttpServer` layer works in place of Node's.

To compose with your own Effect HTTP app, `toHttpEffect(handler)` is the app itself:

```ts
import { toHttpEffect } from 'trpcdev/http';

const app = toHttpEffect(handler, {
  allowOrigin: (o) => o === 'https://app.example.com',
});
```

## Express, Fastify and `node:http`

`NodeHttpServer.makeHandler` turns the Effect app into a `(req, res)` handler. Its resources live in the scope you pass.

```ts
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Scope } from 'effect';

const scope = Scope.makeUnsafe();
const nodeHandler = await Effect.runPromise(
  NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
);
// on shutdown: await Effect.runPromise(Scope.close(scope, Exit.void))
```

```ts
// Express 5: a route, not app.use('/trpc', …), which strips the prefix from req.url
app.all('/trpc/{*path}', nodeHandler);

// Fastify: hand over the raw request, unparsed
fastify.register(async (scoped) => {
  scoped.removeAllContentTypeParsers();
  scoped.addContentTypeParser('*', (_req, _payload, done) => done(null));
  scoped.all('/trpc/*', (req, reply) => {
    reply.hijack();
    nodeHandler(req.raw, reply.raw);
  });
});

// node:http
createServer((req, res) => nodeHandler(req, res)).listen(3000);
```

The handler reads the body itself. If `express.json()`, `express.text()` or `express.raw()` ran first, it uses `req.body`. Other parsers that consume the stream (for example multipart ones) make the call fail with a 500 that says so, so mount them after the tRPC route.

## Bun

```ts
Bun.serve({ port: 3000, fetch: handler.fetch });
```

Bun's server WebSockets aren't web-standard `WebSocket`s, so for WebSockets run `serve(handler)` on `BunHttpServer.layer` from `@effect/platform-bun`.

## Deno

```ts
Deno.serve((request) => {
  if (request.headers.get('upgrade') !== 'websocket')
    return handler.fetch(request);
  const { socket, response } = Deno.upgradeWebSocket(request);
  handler.websocket(socket, { request });
  return response;
});
```

## Fetch runtimes

Cloudflare Workers, Next.js route handlers, Lambda function URLs and other fetch runtimes take `handler.fetch` as it is.

```ts
// Cloudflare Workers
export default { fetch: handler.fetch };

// Next.js: app/api/trpc/[trpc]/route.ts, with createFetchHandler({ router, endpoint: '/api/trpc' })
export const GET = handler.fetch;
export const POST = handler.fetch;
```

On Workers, `env` and `ctx` come with each request, not with the handler. Pass them as the platform argument, typed by the handler's second type parameter; `createContext` reads them:

```ts
const handler = createFetchHandler<
  AppRouter,
  { env: Env; ctx: ExecutionContext }
>({
  router,
  createContext: ({ platform }) => ({
    db: platform.env.DB,
    waitUntil: (p: Promise<unknown>) => platform.ctx.waitUntil(p),
  }),
});

export default {
  fetch: (request, env, ctx) => handler.fetch(request, { env, ctx }),
} satisfies ExportedHandler<Env>;
// in a resolver: ctx.waitUntil(sendWelcomeEmail(user))
```

With a platform type, `handler.fetch(request)` without it is a type error, and so is `handler.websocket(socket, { request })` without `platform`. Without one, `fetch` takes the request alone, which is what Next's route handler types expect. `serve()`, Node and Bun pass nothing, and `platform` is `undefined`.

For Effect HTTP middleware in front of the handler on a fetch runtime, convert the Effect app back to a web handler:

```ts
import { HttpEffect } from 'effect/http';

const fetch = HttpEffect.toWebHandler(toHttpEffect(handler));
```

Not built yet: an adapter for Lambda behind API Gateway (event in, result out).

## Cloudflare Durable Objects

A Durable Object can accept WebSockets with hibernation, so idle connections don't keep it in memory (or on the bill). `createHibernatingWebSockets()` serves a handler's router that way, from the object's `fetch`, `webSocketMessage` and `webSocketClose`:

```ts
import { DurableObject } from 'cloudflare:workers';
import {
  createFetchHandler,
  createHibernatingWebSockets,
} from 'trpcdev/server';

const handler = createFetchHandler<AppRouter, { env: Env }>({
  router,
  createContext,
});

export class Room extends DurableObject<Env> {
  sockets = createHibernatingWebSockets(handler, { state: this.ctx });

  fetch(request: Request) {
    if (request.headers.get('upgrade') !== 'websocket') {
      return handler.fetch(request, { env: this.env });
    }
    return this.sockets.upgrade(request, { env: this.env });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.sockets.message(ws, message, { env: this.env });
  }
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.sockets.close(ws, code, reason);
  }
  webSocketError(ws: WebSocket) {
    this.sockets.close(ws);
  }
}
```

- When the object wakes, each socket's request URL, its `cookie` and `authorization` headers (`keepHeaders` to choose others) and its `connectionParams` are rebuilt from the socket's attachment, so `createContext` sees the same connection. They must fit Cloudflare's 2 KB attachment limit.
- `wsLink`'s keep-alive pings are answered by the runtime (`setWebSocketAutoResponse`) without waking the object.
- A running subscription keeps the object awake until it ends; hibernation saves idle connections, not open streams. Pair it with a [publisher](./subscriptions.md#cloudflare-durable-objects) inside the object so subscribers resume with `lastEventId` after a reconnect.
- Already created the `WebSocketPair` yourself? `sockets.accept(server, request, platform)` instead of `upgrade()`.

## Workers and message ports

`handler.messagePort(port)` serves calls over a `MessagePort`, a web `Worker` or a `worker_threads` port. See [Client](./client.md) for the matching link.
