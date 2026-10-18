---
title: Node
description: Serve on Node with Effect's HttpServer, or mount the handler in Express, Fastify and node:http.
section: Adapters
order: 2
v11: server/adapters/standalone
---

## The Effect way

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { serve } from '@trpc12/trpc/http';

serve(handler).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

`serve` takes `endpoint`, the path WebSocket upgrades must use. Any Effect `HttpServer` layer works in place of Node's.

## Routes next to your own

The handler is an `effect/http` app underneath: `createContext` gets Effect's `HttpServerRequest`, and on Node the request is never converted to a web `Request`. `handler.routes` is that app as `HttpRouter` routes for the endpoint and the paths under it, WebSocket upgrades included, and `serve(handler)` serves exactly those, so other paths get a 404. Merge them with your own routes:

```ts twoslash
// ---cut-start---
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { handler } from './server.ts';
// ---cut-end---
import { HttpRouter, HttpServerResponse } from 'effect/http';

const app = Layer.mergeAll(
  handler.routes,
  HttpRouter.add('GET', '/health', HttpServerResponse.text('ok')),
);

HttpRouter.serve(app).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

`handler.fetch` runs the same app through `HttpRouter.toWebHandler`. To use the handler as one app instead of routes, `toHttpEffect(handler)` is the app itself.

## Express, Fastify and `node:http`

`NodeHttpServer.makeHandler` turns the Effect app into a `(req, res)` handler. Its resources live in the scope you pass.

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Scope } from 'effect';
import { toHttpEffect } from '@trpc12/trpc/http';

const scope = Scope.makeUnsafe();
const nodeHandler = await Effect.runPromise(
  NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
);
// on shutdown: await Effect.runPromise(Scope.close(scope, Exit.void))
```

```ts
// Express 5: a route, not app.use('/trpc', …), which strips the prefix from req.url
app.all('/trpc{/*path}', nodeHandler);

// Fastify: hand over the raw request, unparsed
fastify.register(async (scoped) => {
  scoped.removeAllContentTypeParsers();
  scoped.addContentTypeParser('*', (_req, _payload, done) => done(null));
  for (const path of ['/trpc', '/trpc/*']) {
    scoped.all(path, (req, reply) => {
      reply.hijack();
      nodeHandler(req.raw, reply.raw);
    });
  }
});

// node:http
createServer((req, res) => nodeHandler(req, res)).listen(3000);
```

Batches are sent to the endpoint itself (`/trpc`), so the route must match it as well as the paths under it. [`examples/saas-api`](../../examples/saas-api/src/servers.ts) serves one API on Effect's server, Express and Fastify this way, and `pnpm example` runs the same calls against each. The handler reads the body itself. If `express.json()`, `express.text()` or `express.raw()` ran first, it uses `req.body`. Other parsers that consume the stream (for example multipart ones) make the call fail with a 500 that says so, so mount them after the tRPC route.

[Middleware and CORS](./overview.md#middleware-and-cors) apply the same way on every adapter.
