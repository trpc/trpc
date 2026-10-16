# Platforms

`createFetchHandler()` returns a web-standard `fetch(request)`. Anything that speaks `Request` and `Response` can serve it directly. On Effect's `HttpServer`, `@trpc12/trpc/http` adds WebSockets, client-disconnect aborts, and Effect's platform layers.

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
import { serve } from '@trpc12/trpc/http';

serve(handler).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

`serve` takes `endpoint`, the path WebSocket upgrades must use. Any Effect `HttpServer` layer works in place of Node's.

The handler is an `effect/http` app underneath: `createContext` gets Effect's `HttpServerRequest`, and on Node the request is never converted to a web `Request`. `handler.routes` is that app as `HttpRouter` routes for the endpoint and the paths under it, WebSocket upgrades included, and `serve(handler)` serves exactly those, so other paths get a 404. Merge them with your own routes:

```ts
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

### Middleware and CORS

Request-level concerns are Effect `HttpMiddleware` in the handler's `middleware` option, outermost first. They wrap `handler.fetch` and, under `serve()`/`toHttpEffect`, WebSocket upgrades too. Call-level concerns are root `t.use()` middleware.

```ts
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

### Compression

@trpc12/trpc doesn't compress. Your CDN or proxy (Cloudflare, Vercel, nginx) already negotiates `Accept-Encoding`, and does it better. If you add a compressing `HttpMiddleware`, skip `application/jsonl`, `application/vnd.trpc.frames` and `text/event-stream` responses: a gzip stream buffers until its window fills, which stalls subscriptions and streamed results.

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

`@trpc12/trpc/aws-lambda` turns a fetch handler into a Lambda handler for API Gateway REST APIs (payload 1.0), HTTP APIs and function URLs (payload 2.0), Application Load Balancers and Lambda@Edge. The event becomes a web `Request` and the response becomes that event's result shape. `{ event, context }` is the platform argument:

```ts
import { toLambdaHandler, type LambdaPlatform } from '@trpc12/trpc/aws-lambda';

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
import { toLambdaStreamingHandler } from '@trpc12/trpc/aws-lambda';

export const main = awslambda.streamifyResponse(
  toLambdaStreamingHandler(handler),
);
```

## Cloudflare Durable Objects

A Durable Object can accept WebSockets with hibernation, so idle connections don't keep it in memory (or on the bill). `experimental_createHibernatingWebSockets()` from `@trpc12/trpc/cloudflare` serves a handler's router that way, from the object's `fetch`, `webSocketMessage` and `webSocketClose`:

```ts
import { DurableObject } from 'cloudflare:workers';
import { experimental_createHibernatingWebSockets } from '@trpc12/trpc/cloudflare';
import { createFetchHandler } from '@trpc12/trpc/server';

const handler = createFetchHandler<AppRouter, { env: Env }>({
  router,
  createContext,
});

export class Room extends DurableObject<Env> {
  sockets = experimental_createHibernatingWebSockets(handler, {
    state: this.ctx,
  });

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
  experimental_createHibernatingWebSockets,
  hibernatingPublisher,
} from '@trpc12/trpc/cloudflare';

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
  sockets = experimental_createHibernatingWebSockets(this.handler, {
    state: this.ctx,
  });
  // fetch, webSocketMessage and webSocketClose as above
}
```

- Event ids are timestamps, so they keep growing across wakes. Kept events (`buffer`) are in memory: a reconnect with `lastEventId` replays the ones the object still has.
- The subscription runs its resolver once, when it starts. Anything the resolver does per event (filtering, mapping the stream) is skipped; filter in the channel name instead (`'room:42'`).
- One adapter per object: the latest `experimental_createHibernatingWebSockets` for a `state` gets the events.
- A subscription that doesn't fit the attachment runs as a normal stream, with a warning. SSE subscribers in the same object get a normal stream too.
- A parked subscription keeps its channel, so with [a channel per audience](./subscriptions.md#a-channel-per-audience) `Notes.publish('inbox:1', data)` only wakes the sockets subscribed to `inbox:1`.

### Durable calls in an object

[`experimental_durable()`](./procedures.md) needs Effect's `BackingPersistence`. In an object, back it with the object's storage, so kept results and streamed frames outlive an eviction: Effect's `KeyValueStore.makeStringOnly` over `ctx.storage`, under `Persistence.layerBackingKvs`. [`examples/cloudflare/src/storage.ts`](../examples/cloudflare/src/storage.ts) has one, which the example merges with its publisher layer:

```ts
layer: Layer.mergeAll(
  hibernatingPublisher(Messages, { state: this.ctx, buffer: 100 }),
  durableObjectPersistence(this.ctx.storage),
),
```

### Locks in Durable Objects

`experimental_durableLocker(env.LOCKS)` is an [`experimental_lock()`](./procedures.md) locker every Worker instance shares: one object per key. Each caller keeps a hibernatable WebSocket to the object while it holds or waits for the lock, so the object isn't billed meanwhile, waiters are told when it's their turn (nothing polls), and a crashed holder's lock goes when its socket drops. The object delegates to `experimental_durableLockObject(this.ctx)`:

```ts
import {
  experimental_durableLocker,
  experimental_durableLockObject,
} from '@trpc12/trpc/cloudflare';

export class Locks extends DurableObject<Env> {
  locks = experimental_durableLockObject(this.ctx);
  override fetch(request: Request) {
    return this.locks.fetch(request);
  }
  override webSocketClose(ws: WebSocket) {
    this.locks.close(ws);
  }
  override webSocketError(ws: WebSocket) {
    this.locks.close(ws);
  }
}

// wherever the handler is made
layer: experimental_durableLocker(env.LOCKS),
```

Bind `LOCKS` to `Locks` in `wrangler.jsonc` (a `new_sqlite_classes` migration). [`examples/cloudflare`](../examples/cloudflare/src/index.ts) locks a seat across two room objects.

### Workers Traces

`experimental_workersTracer({ tracing })` is an Effect `Tracer` that records spans with Workers Traces' custom spans API, with no OpenTelemetry SDK: tRPC's server and client spans and any `Effect.withSpan`, with their attributes and an error status on failure. Turn on `observability.traces` in the Wrangler config. Workers nests spans by async context, so pass `snapshot: () => AsyncLocalStorage.snapshot()` (`nodejs_compat`) too: then spans nest as Effect nests them, and the spans Workers adds itself (subrequests, storage, other objects) sit under the call that made them. Without it, every span is a child of the request's.

```ts
import { tracing } from 'cloudflare:workers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { experimental_workersTracer } from '@trpc12/trpc/cloudflare';

layer: experimental_workersTracer({ tracing, snapshot: () => AsyncLocalStorage.snapshot() }),
```

Workers spans have no events, so Effect's span events are dropped, and a `traceparent` from another service doesn't parent the call: its spans join the Worker's own trace. Locally, Wrangler's Local Explorer (`e` in `wrangler dev`) shows the spans; the example's smoke test reads them from its trace store.

### Signed connection tokens

The Worker in front of the object usually authenticates the user already. `connectionToken(schema, { secret })` lets it hand that over: a procedure on the Worker signs claims, the client sends the token as a connection param, and the object's `createContext` verifies it (HMAC-SHA256 with WebCrypto) instead of looking up the session again:

```ts
import { connectionToken } from '@trpc12/trpc/cloudflare';

const RoomToken = connectionToken(
  Schema.Struct({ room: Schema.String, user: Schema.String }),
  { secret: env.TOKEN_SECRET, ttlSeconds: 600 },
);

// the Worker's router
const workerRouter = {
  roomToken: t.procedure
    .input(Schema.Struct({ room: Schema.String }))
    .query(({ ctx, input }) =>
      RoomToken.sign({ room: input.room, user: ctx.user.id }),
    ),
};

// the Durable Object's router and handler
const roomRouter = {
  inbox: t.procedure.subscription(({ ctx, lastEventId }) =>
    Notes.subscribe(`inbox:${ctx.user}`, { lastEventId }),
  ),
};

export class Room extends DurableObject<Env> {
  handler = createFetchHandler({
    router: roomRouter,
    createContext: ({ info }) =>
      Effect.runPromise(RoomToken.verify(info.connectionParams?.['token'])),
    layer: hibernatingPublisher(Notes, { state: this.ctx }),
  });
  // sockets, fetch and webSocketMessage as above
}

// the browser
const link = wsLink({
  url,
  connectionParams: async () => ({
    token: await client.roomToken.query({ room }),
  }),
});
```

- `verify` fails with `UNAUTHORIZED` when the token is missing, malformed, signed with another secret or past `ttlSeconds` (default an hour). It reads the time from Effect's `Clock`.
- The claims are encoded with the schema and readable by the client; keep secrets out of them.
- Expiry is checked whenever `createContext` runs: on each call, and when a subscription starts. A parked subscription keeps getting events after the token expires, until the socket closes or the client reconnects.

## Workers and message ports

`handler.messagePort(port)` serves calls over a `MessagePort`, a web `Worker` or a `worker_threads` port. See [Client](./client.md) for the matching link.

## Firebase callable functions

A callable function gets JSON `data` and Firebase's `auth`, and reports errors as `HttpsError`. Call the procedure with `call()` and map the error code:

```ts
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from 'firebase-functions/v2/https';
import { call, isTrpcError } from '@trpc12/trpc/server';

const firebaseCode: Record<string, FunctionsErrorCode> = {
  BAD_REQUEST: 'invalid-argument',
  UNPROCESSABLE_CONTENT: 'invalid-argument',
  UNAUTHORIZED: 'unauthenticated',
  FORBIDDEN: 'permission-denied',
  NOT_FOUND: 'not-found',
  CONFLICT: 'already-exists',
  PRECONDITION_FAILED: 'failed-precondition',
  TOO_MANY_REQUESTS: 'resource-exhausted',
  TIMEOUT: 'deadline-exceeded',
  CLIENT_CLOSED_REQUEST: 'cancelled',
  NOT_IMPLEMENTED: 'unimplemented',
  SERVICE_UNAVAILABLE: 'unavailable',
};

export const createPost = onCall(async (request) => {
  try {
    return await call(appRouter.post.create, request.data, {
      ctx: { uid: request.auth?.uid ?? null },
    });
  } catch (error) {
    const code = isTrpcError(error) ? firebaseCode[error.code] : undefined;
    // Anything else reaches the client as Firebase's masked `internal`.
    if (!isTrpcError(error) || code === undefined) throw error;
    throw new HttpsError(code, error.message, error.data);
  }
});
```

The input is validated by the procedure as usual. Firebase's wire format is plain JSON, so outputs lose `Date`s, `Map`s and the other types the tRPC serializer keeps; return strings or numbers for those. Firebase hosting can also serve `handler.fetch` through an HTTPS function (`onRequest`) behind Express ([Express](#express-fastify-and-nodehttp)), which keeps the whole protocol.

## Raw sockets (TCP)

Between services, or where there is no HTTP stack, `serveSocket(handler)` from `@trpc12/trpc/socket` serves the router on Effect's `SocketServer`. The platform layer picks the socket: `NodeSocketServer.layer({ port })` for TCP, `NodeSocketServer.layerTls` for TLS, or `{ path }` for a Unix socket.

```ts
import { NodeRuntime, NodeSocketServer } from '@effect/platform-node';
import { Layer } from 'effect';
import { serveSocket } from '@trpc12/trpc/socket';

serveSocket(handler).pipe(
  Layer.provide(NodeSocketServer.layer({ port: 4000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

The client is `experimental_socketLink` with an Effect `Socket`:

```ts
import { NodeSocket } from '@effect/platform-node';
import { experimental_socketLink } from '@trpc12/trpc/client';

const link = experimental_socketLink({
  socket: NodeSocket.makeNet({ host: 'localhost', port: 4000 }),
  connectionParams: { token },
});
```

A connection speaks the WebSocket protocol, one JSON message per line, so everything that works over `wsLink` works here: `connectionParams`, subscriptions with resume, deferred values, aborts, keep-alive pings and reconnects. `createContext` gets `info.transport === 'socket'`. There are no headers, so authenticate with `connectionParams`. A connection that sends nothing for 60 s is closed (`serveSocket(handler, { idleTimeoutMs })`, or `false`).

WebTransport isn't supported: no server runtime that Effect has a platform for serves it yet.
