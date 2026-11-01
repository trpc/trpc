---
title: Cloudflare
description: Everything in `@trpc12/trpc/cloudflare`. Durable Objects with hibernating WebSockets, publishers, durable calls, locks, rate limits and connection tokens, plus Workers Traces.
section: Adapters
order: 7
experiment: cloudflare
---

`@trpc12/trpc/cloudflare` has what a router needs inside a Durable Object, and a tracer for Workers Traces. A Worker on its own serves `handler.fetch` ([Fetch](./fetch.md)). The [`examples/cloudflare`](../../../examples/cloudflare/server.ts) app uses all of it.

## Serving from a Durable Object

A Durable Object is one process that every request for its name reaches, so `Posts.memory()` is enough inside it. Route the endpoint to the object and serve the router there:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import {
  createFetchHandler,
  initTrpc,
  experimental_Publisher,
} from '@trpc12/trpc/server';
import type { Post } from './server.ts';
class Posts extends experimental_Publisher.Service<
  Posts,
  { created: Post; deleted: { id: string } }
>()('Posts') {}
const t = initTrpc();
const router = t.router({
  onCreated: t.procedure.subscription((opts) =>
    Posts.subscribe('created', { lastEventId: opts.lastEventId }),
  ),
});
interface Env {
  POSTS_ROOM: DurableObjectNamespace<PostsRoom>;
}
// ---cut-end---
import { DurableObject } from 'cloudflare:workers';

export class PostsRoom extends DurableObject {
  handler = createFetchHandler({
    router,
    layer: Posts.memory({ buffer: 100 }),
  });
  fetch(request: Request) {
    return this.handler.fetch(request);
  }
}

export default {
  fetch: (request: Request, env: Env) =>
    env.POSTS_ROOM.getByName('posts').fetch(request),
} satisfies ExportedHandler<Env>;
```

Open SSE streams keep the object in memory; kept events are lost when it's evicted. To let it sleep between events, serve WebSockets with hibernation and provide `experimental_hibernatingPublisher(Posts, { state: this.ctx })` instead of `Posts.memory()` ([Subscriptions that hibernate](#subscriptions-that-hibernate)).

## Hibernating WebSockets

A Durable Object can accept WebSockets with hibernation, so idle connections don't keep it in memory (or on the bill). `experimental_createHibernatingWebSockets()` serves a handler's router that way, from the object's `fetch`, `webSocketMessage` and `webSocketClose`:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import type { CreateContextOpts } from '@trpc12/trpc/server';
import { appRouter as router, type AppRouter, type Context } from './server.ts';
interface Env {}
declare function createContext(opts: CreateContextOpts<{ env: Env }>): Context;
// ---cut-end---
import { DurableObject } from 'cloudflare:workers';
import { experimental_createHibernatingWebSockets } from '@trpc12/trpc/cloudflare';
import { cors } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';

const handler = createFetchHandler<AppRouter, { env: Env }>({
  router,
  createContext,
  middleware: [cors({ allowedOrigins: ['https://app.example.com'] })],
});

export class Room extends DurableObject<Env> {
  sockets = experimental_createHibernatingWebSockets(handler, {
    state: this.ctx,
  });

  fetch(request: Request): Promise<Response> {
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

- `sockets.upgrade()` runs the handler's `middleware` before it accepts the socket, so `cors()` answers an upgrade from another origin with a `403` and no socket is created ([Middleware and CORS](./overview.md#middleware-and-cors)). It returns a `Promise<Response>`.
- When the object wakes, each socket's request URL, its `cookie` and `authorization` headers (`keepHeaders` to choose others) and its `connectionParams` are rebuilt from the socket's attachment, so `createContext` sees the same connection. The attachment has a 2 KB limit; past it, the headers are dropped with a `console.warn` (the connection stays). Browsers can't set WebSocket headers, so same-origin apps authenticate with cookies.
- `wsLink`'s keep-alive pings are answered by the runtime (`setWebSocketAutoResponse`) without waking the object. The handler's `websocket.idleTimeout` doesn't apply here: a timer would wake it.
- A generator or `Stream` subscription keeps the object awake until it ends. Subscriptions to an `experimental_hibernatingPublisher` don't.
- Already created the `WebSocketPair` yourself? `sockets.accept(server, request, platform)` instead of `upgrade()`. It skips `middleware`: check the origin before you create the pair.
- `await sockets.dispose()` (or `await using`) ends what the adapter started. It interrupts its calls and running subscriptions, then closes the object's tRPC sockets with `1012` ("service restart"), so `wsLink` reconnects and resubscribes. After it, `upgrade()` answers `503`.

## Subscriptions that hibernate

Provide the object's [publisher](../subscriptions/publisher.md) with `experimental_hibernatingPublisher(Posts, { state })`. A subscription that returns `Posts.subscribe(...)` over a hibernating socket is then kept in the socket's attachment (call id, channel, path) instead of a running fiber, and `Posts.publish()` sends each event straight to the matching sockets, validated by the subscription's `.output()`. The object sleeps between events.

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import {
  createFetchHandler,
  initTrpc,
  experimental_Publisher,
} from '@trpc12/trpc/server';
import { Effect } from 'effect';
import { PostSchema as PostInput, type Post } from './server.ts';
interface Env {}
const t = initTrpc();
// ---cut-end---
import {
  experimental_createHibernatingWebSockets,
  experimental_hibernatingPublisher,
} from '@trpc12/trpc/cloudflare';

class Posts extends experimental_Publisher.Service<Posts, { created: Post }>()(
  'Posts',
) {}

const router = t.router({
  create: t.procedure
    .input(PostInput)
    .mutation((opts) =>
      Effect.as(Posts.publish('created', opts.input), opts.input),
    ),
  onCreated: t.procedure.subscription((opts) =>
    Posts.subscribe('created', { lastEventId: opts.lastEventId }),
  ),
});

export class Room extends DurableObject<Env> {
  handler = createFetchHandler({
    router,
    layer: experimental_hibernatingPublisher(Posts, {
      state: this.ctx,
      buffer: 100,
    }),
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
- A parked subscription keeps its channel, so with [a channel per audience](../subscriptions/publisher.md#a-channel-per-audience) `Notes.publish('inbox:1', data)` only wakes the sockets subscribed to `inbox:1`.

## Durable calls

`experimental_durable()` needs Effect's `BackingPersistence`. In an object, back it with the object's storage, so kept results and streamed frames outlive an eviction: Effect's `KeyValueStore.makeStringOnly` over `ctx.storage`, under `Persistence.layerBackingKvs`. [`examples/cloudflare/src/storage.ts`](../../../examples/cloudflare/src/storage.ts) has one, which the example merges with its publisher layer:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { experimental_hibernatingPublisher } from '@trpc12/trpc/cloudflare';
import {
  createFetchHandler,
  initTrpc,
  experimental_Publisher,
} from '@trpc12/trpc/server';
import { Layer } from 'effect';
import type { Persistence } from 'effect/persistence';
interface Message {
  from: string;
  text: string;
}
class Messages extends experimental_Publisher.Service<
  Messages,
  { message: Message }
>()('Messages') {}
declare function durableObjectPersistence(
  storage: DurableObjectStorage,
): Layer.Layer<Persistence.BackingPersistence>;
const t = initTrpc();
const router = t.router({
  onMessage: t.procedure.subscription((opts) =>
    Messages.subscribe('message', { lastEventId: opts.lastEventId }),
  ),
});
interface Env {}
class Room extends DurableObject<Env> {
  // ---cut-end---
  handler = createFetchHandler({
    router,
    layer: Layer.mergeAll(
      experimental_hibernatingPublisher(Messages, {
        state: this.ctx,
        buffer: 100,
      }),
      durableObjectPersistence(this.ctx.storage),
    ),
  });
  // ---cut-after---
}
```

## Locks

`experimental_durableLocker(env.LOCKS)` is an `experimental_lock()` locker every Worker instance shares: one object per key. Each caller keeps a hibernatable WebSocket to the object while it holds or waits for the lock, so the object isn't billed meanwhile, waiters are told when it's their turn (nothing polls), and a crashed holder's lock goes when its socket drops. The object delegates to `experimental_durableLockObject(this.ctx)`:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
interface Env {
  LOCKS: DurableObjectNamespace<Locks>;
}
declare const env: Env;
// ---cut-end---
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
createFetchHandler({ router, layer: experimental_durableLocker(env.LOCKS) });
```

Bind `LOCKS` to `Locks` in `wrangler.jsonc` (a `new_sqlite_classes` migration). The example locks a seat across two room objects.

## Rate limits

`experimental_durableRateLimiterStore(env.RATE_LIMITS)` is a store for `experimental_rateLimit()` ([Rate limiting](../middleware/rate-limit.md#cloudflare)) that every Worker instance shares: one object per key, counting with its own clock in its storage. The object delegates to `experimental_durableRateLimitObject(this.ctx)`, and its alarm deletes the counters once they expire:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
interface Env {
  RATE_LIMITS: DurableObjectNamespace<RateLimits>;
}
declare const env: Env;
// ---cut-end---
import { Layer } from 'effect';
import { RateLimiter } from 'effect/persistence';
import {
  experimental_durableRateLimiterStore,
  experimental_durableRateLimitObject,
} from '@trpc12/trpc/cloudflare';

export class RateLimits extends DurableObject<Env> {
  limits = experimental_durableRateLimitObject(this.ctx);
  override fetch(request: Request) {
    return this.limits.fetch(request);
  }
  override alarm() {
    return this.limits.alarm();
  }
}

// wherever the handler is made
createFetchHandler({
  router,
  layer: RateLimiter.layer.pipe(
    Layer.provide(experimental_durableRateLimiterStore(env.RATE_LIMITS)),
  ),
});
```

Bind `RATE_LIMITS` to `RateLimits` in `wrangler.jsonc` (a `new_sqlite_classes` migration). The example limits each sender to three messages a minute in a room.

## Workers Traces

`experimental_workersTracer({ tracing })` is an Effect `Tracer` that records spans with Workers Traces' custom spans API, with no OpenTelemetry SDK: tRPC's server and client spans and any `Effect.withSpan`, with their attributes and an error status on failure. Turn on `observability.traces` in the Wrangler config. Workers nests spans by async context, so pass `snapshot: () => AsyncLocalStorage.snapshot()` (`nodejs_compat`) too: then spans nest as Effect nests them, and the spans Workers adds itself (subrequests, storage, other objects) sit under the call that made them. Without it, every span is a child of the request's.

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
import { tracing } from 'cloudflare:workers';
import { AsyncLocalStorage } from 'node:async_hooks';
import { experimental_workersTracer } from '@trpc12/trpc/cloudflare';

createFetchHandler({
  router,
  layer: experimental_workersTracer({
    tracing,
    snapshot: () => AsyncLocalStorage.snapshot(),
  }),
});
```

Workers spans have no events, so Effect's span events are dropped, and a `traceparent` from another service doesn't parent the call: its spans join the Worker's own trace. Locally, Wrangler's Local Explorer (`e` in `wrangler dev`) shows the spans; the example's client reads them from its trace store.

## Signed connection tokens

The Worker in front of the object usually authenticates the user already. `experimental_connectionToken(schema, { secret })` lets it hand that over: a procedure on the Worker signs claims, the client sends the token as a connection param, and the object's `createContext` verifies it (HMAC-SHA256 with WebCrypto) instead of looking up the session again:

```ts twoslash
// ---cut-start---
// @filename: token.ts
/// <reference types="@cloudflare/workers-types" />
import { Schema } from 'effect';
interface Env {
  TOKEN_SECRET: string;
}
declare const env: Env;
// ---cut-end---
import { experimental_connectionToken } from '@trpc12/trpc/cloudflare';

const RoomToken = experimental_connectionToken(
  Schema.Struct({ room: Schema.String, user: Schema.String }),
  { secret: env.TOKEN_SECRET, ttl: '10 minutes' },
);

// ---cut-start---
export { RoomToken };
// @filename: worker.ts
import { initTrpc } from '@trpc12/trpc/server';
import { Schema } from 'effect';
import type { User } from './server.ts';
import { RoomToken } from './token.ts';
const t = initTrpc<{ ctx: { user: User } }>();
// ---cut-end---
// the Worker's router
const workerRouter = t.router({
  roomToken: t.procedure
    .input(Schema.Struct({ room: Schema.String }))
    .query((opts) =>
      RoomToken.sign({ room: opts.input.room, user: opts.ctx.user.id }),
    ),
});

// ---cut-start---
export type WorkerRouter = typeof workerRouter;
// @filename: room.ts
import { DurableObject } from 'cloudflare:workers';
import { experimental_hibernatingPublisher } from '@trpc12/trpc/cloudflare';
import {
  createFetchHandler,
  initTrpc,
  experimental_Publisher,
} from '@trpc12/trpc/server';
import { Effect } from 'effect';
import { RoomToken } from './token.ts';
interface Env {}
const t = initTrpc<{ ctx: { room: string; user: string } }>();
class Notes extends experimental_Publisher.Service<
  Notes,
  { [inbox: `inbox:${string}`]: { text: string } }
>()('Notes') {}
// ---cut-end---
// the Durable Object's router and handler
const roomRouter = t.router({
  inbox: t.procedure.subscription((opts) =>
    Notes.subscribe(`inbox:${opts.ctx.user}`, {
      lastEventId: opts.lastEventId,
    }),
  ),
});

export class Room extends DurableObject<Env> {
  handler = createFetchHandler({
    router: roomRouter,
    createContext: (opts) =>
      Effect.runPromise(
        RoomToken.verify(opts.info.connectionParams?.['token']),
      ),
    layer: experimental_hibernatingPublisher(Notes, { state: this.ctx }),
  });
  // sockets, fetch and webSocketMessage as above
}

// ---cut-start---
// @filename: browser.ts
import { createTrpcClient, routerType, wsLink } from '@trpc12/trpc/client';
import type { WorkerRouter } from './worker.ts';
declare const url: string;
declare const room: string;
const client = createTrpcClient({
  router: routerType<WorkerRouter>(),
  links: [wsLink({ url })],
});
// ---cut-end---
// the browser
const link = wsLink({
  url,
  connectionParams: async () => ({
    token: await client.roomToken.query({ room }),
  }),
});
```

- `verify` fails with `UNAUTHORIZED` when the token is missing, malformed, signed with another secret or past `ttl` (default `'1 hour'`). It reads the time from Effect's `Clock`.
- The claims are encoded with the schema and readable by the client; keep secrets out of them.
- Expiry is checked whenever `createContext` runs: on each call, and when a subscription starts. A parked subscription keeps getting events after the token expires, until the socket closes or the client reconnects.

## Credits

Hibernating WebSockets, the Durable Object publisher and lock, and Workers Traces follow oRPC's [hibernation integration](https://orpc.dev/docs/integrations/hibernation), [publisher](https://orpc.dev/docs/helpers/publisher), [locks](https://orpc.dev/docs/helpers/lock) and [Cloudflare Traces integration](https://orpc.dev/docs/integrations/cloudflare-traces). The Durable Object rate limit store follows oRPC's [Durable Object rate limiter](https://orpc.dev/docs/helpers/ratelimit).
