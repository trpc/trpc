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

`serve` takes `endpoint`, the path WebSocket upgrades must use. Any Effect `HttpServer` layer works in place of Node's.

The handler is an `effect/http` app underneath: `createContext` gets Effect's `HttpServerRequest`, and on Node the request is never converted to a web `Request`. To compose with your own Effect HTTP app, `toHttpEffect(handler)` is the app itself.

### Middleware and CORS

Request-level concerns are Effect `HttpMiddleware` in the handler's `middleware` option, outermost first. They wrap `handler.fetch` and, under `serve()`/`toHttpEffect`, WebSocket upgrades too. Call-level concerns are root `t.use()` middleware.

```ts
import { HttpMiddleware } from 'effect/http';
import { cors } from 'trpcdev/http';

const handler = createFetchHandler({
  router,
  middleware: [
    cors({ allowedOrigins: ['https://app.example.com'], credentials: true }),
    HttpMiddleware.logger,
  ],
});
```

`cors()` is Effect's `HttpMiddleware.cors` plus an origin check on WebSocket upgrades (403 for other origins). Browsers send cookies with cross-site upgrades and CORS doesn't cover them, so use it when you authenticate with cookies.

### Compression

trpcdev doesn't compress. Your CDN or proxy (Cloudflare, Vercel, nginx) already negotiates `Accept-Encoding`, and does it better. If you add a compressing `HttpMiddleware`, skip `application/jsonl` and `text/event-stream` responses: a gzip stream buffers until its window fills, which stalls subscriptions and streamed results.

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

```ts
serve(handler).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.launch,
  BunRuntime.runMain,
);
```

CI runs a suite on Bun this way (`pnpm test:bun`): batched queries, files, SSE with resume, `wsLink`, and aborting on disconnect.

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

// Next.js: app/api/trpc/[[...trpc]]/route.ts (batches POST to /api/trpc itself), with createFetchHandler({ router, endpoint: '/api/trpc' })
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

## AWS Lambda

`trpcdev/aws-lambda` turns a fetch handler into a Lambda handler for API Gateway REST APIs (payload 1.0), HTTP APIs and function URLs (payload 2.0), Application Load Balancers and Lambda@Edge. The event becomes a web `Request` and the response becomes that event's result shape. `{ event, context }` is the platform argument:

```ts
import { toLambdaHandler, type LambdaPlatform } from 'trpcdev/aws-lambda';

const handler = createFetchHandler<AppRouter, LambdaPlatform>({
  router,
  createContext: ({ platform }) => ({
    requestId: platform.context.awsRequestId,
  }),
});

export const main = toLambdaHandler(handler);
```

- Text bodies (JSON, JSONL, forms, `text/*`) stay text. Others, such as a `File` output, are base64 with `isBase64Encoded`.
- Set-cookie headers go where each event type expects them: `multiValueHeaders` (REST, ALB), `cookies` (HTTP API) or CloudFront headers (Edge).
- The call's `signal` aborts `timeoutMarginMs` (default 1000) before Lambda's deadline (`context.getRemainingTimeInMillis()`), so a slow call ends with an error response instead of a Lambda timeout.

A buffered result only arrives once the response ends, so subscriptions and streamed outputs reach the client all at once. With response streaming (function URLs with `InvokeMode: RESPONSE_STREAM`, or API Gateway REST streaming), `toLambdaStreamingHandler` writes the status and headers first and then the body as it is produced:

```ts
import { toLambdaStreamingHandler } from 'trpcdev/aws-lambda';

export const main = awslambda.streamifyResponse(
  toLambdaStreamingHandler(handler),
);
```

## Cloudflare Durable Objects

A Durable Object can accept WebSockets with hibernation, so idle connections don't keep it in memory (or on the bill). `createHibernatingWebSockets()` from `trpcdev/cloudflare` serves a handler's router that way, from the object's `fetch`, `webSocketMessage` and `webSocketClose`:

```ts
import { DurableObject } from 'cloudflare:workers';
import { createHibernatingWebSockets } from 'trpcdev/cloudflare';
import { createFetchHandler } from 'trpcdev/server';

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

- When the object wakes, each socket's request URL, its `cookie` and `authorization` headers (`keepHeaders` to choose others) and its `connectionParams` are rebuilt from the socket's attachment, so `createContext` sees the same connection. The attachment has a 2 KB limit; past it, the headers are dropped with a `console.warn` (the connection stays). Browsers can't set WebSocket headers, so same-origin apps authenticate with cookies.
- `wsLink`'s keep-alive pings are answered by the runtime (`setWebSocketAutoResponse`) without waking the object. The handler's `websocket.idleTimeoutMs` doesn't apply here: a timer would wake it.
- A generator or `Stream` subscription keeps the object awake until it ends. Subscriptions to a `hibernatingPublisher` don't (below).
- Already created the `WebSocketPair` yourself? `sockets.accept(server, request, platform)` instead of `upgrade()`.

### Subscriptions that hibernate

Provide the object's [publisher](./subscriptions.md#publisher) with `hibernatingPublisher(Posts, { state })`. A subscription that returns `Posts.subscribe(...)` over a hibernating socket is then kept in the socket's attachment (call id, channel, path) instead of a running fiber, and `Posts.publish()` sends each event straight to the matching sockets, validated by the subscription's `.output()`. The object sleeps between events.

```ts
import {
  createHibernatingWebSockets,
  hibernatingPublisher,
} from 'trpcdev/cloudflare';

class Posts extends Publisher.Service<Posts, { created: Post }>()('Posts') {}

const router = {
  create: t.procedure
    .input(PostInput)
    .mutation(({ input }) => Effect.as(Posts.publish('created', input), input)),
  onCreated: t.procedure.subscription(({ lastEventId }) =>
    Posts.subscribe('created', { lastEventId }),
  ),
};

export class Room extends DurableObject<Env> {
  handler = createFetchHandler({
    router,
    layer: hibernatingPublisher(Posts, { state: this.ctx, buffer: 100 }),
  });
  sockets = createHibernatingWebSockets(this.handler, { state: this.ctx });
  // fetch, webSocketMessage and webSocketClose as above
}
```

- Event ids are timestamps, so they keep growing across wakes. Kept events (`buffer`) are in memory: a reconnect with `lastEventId` replays the ones the object still has.
- The subscription runs its resolver once, when it starts. Anything the resolver does per event (filtering, mapping the stream) is skipped; filter in the channel name instead (`'room:42'`).
- One adapter per object: the latest `createHibernatingWebSockets` for a `state` gets the events.
- A subscription that doesn't fit the attachment runs as a normal stream, with a warning. SSE subscribers in the same object get a normal stream too.

## Workers and message ports

`handler.messagePort(port)` serves calls over a `MessagePort`, a web `Worker` or a `worker_threads` port. See [Client](./client.md) for the matching link.
