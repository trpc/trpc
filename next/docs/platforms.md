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

For Effect HTTP middleware in front of the handler on a fetch runtime, convert the Effect app back to a web handler:

```ts
import { HttpEffect } from 'effect/http';

const fetch = HttpEffect.toWebHandler(toHttpEffect(handler));
```

Not built yet: adapters for Lambda behind API Gateway (event in, result out) and for Cloudflare's hibernating WebSockets.

## Workers and message ports

`handler.messagePort(port)` serves calls over a `MessagePort`, a web `Worker` or a `worker_threads` port. See [Client](./client.md) for the matching link.
