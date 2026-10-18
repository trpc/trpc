---
title: Durable Objects
description: Hibernating WebSockets, publishers, durable calls, locks, Workers Traces and connection tokens on Cloudflare Durable Objects.
section: Adapters
order: 7
---

`@trpc12/trpc/cloudflare` has what a router needs inside a Durable Object. The [`examples/cloudflare`](../../examples/cloudflare/src/index.ts) app uses all of it.

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
- A generator or `Stream` subscription keeps the object awake until it ends. Subscriptions to a `hibernatingPublisher` don't.
- Already created the `WebSocketPair` yourself? `sockets.accept(server, request, platform)` instead of `upgrade()`.

## Subscriptions that hibernate

Provide the object's [publisher](../subscriptions/publisher.md) with `hibernatingPublisher(Posts, { state })`. A subscription that returns `Posts.subscribe(...)` over a hibernating socket is then kept in the socket's attachment (call id, channel, path) instead of a running fiber, and `Posts.publish()` sends each event straight to the matching sockets, validated by the subscription's `.output()`. The object sleeps between events.

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { createFetchHandler, initTrpc, Publisher } from '@trpc12/trpc/server';
import { Effect } from 'effect';
import { PostSchema as PostInput, type Post } from './server.ts';
interface Env {}
const t = initTrpc();
// ---cut-end---
import {
  experimental_createHibernatingWebSockets,
  hibernatingPublisher,
} from '@trpc12/trpc/cloudflare';

class Posts extends Publisher.Service<Posts, { created: Post }>()('Posts') {}

const router = {
  create: t.procedure
    .input(PostInput)
    .mutation((opts) =>
      Effect.as(Posts.publish('created', opts.input), opts.input),
    ),
  onCreated: t.procedure.subscription((opts) =>
    Posts.subscribe('created', { lastEventId: opts.lastEventId }),
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
- A parked subscription keeps its channel, so with [a channel per audience](../subscriptions/publisher.md#a-channel-per-audience) `Notes.publish('inbox:1', data)` only wakes the sockets subscribed to `inbox:1`.

## Durable calls

`experimental_durable()` needs Effect's `BackingPersistence`. In an object, back it with the object's storage, so kept results and streamed frames outlive an eviction: Effect's `KeyValueStore.makeStringOnly` over `ctx.storage`, under `Persistence.layerBackingKvs`. [`examples/cloudflare/src/storage.ts`](../../examples/cloudflare/src/storage.ts) has one, which the example merges with its publisher layer:

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';
import { hibernatingPublisher } from '@trpc12/trpc/cloudflare';
import { createFetchHandler, initTrpc, Publisher } from '@trpc12/trpc/server';
import { Layer } from 'effect';
import type { Persistence } from 'effect/persistence';
interface Message {
  from: string;
  text: string;
}
class Messages extends Publisher.Service<Messages, { message: Message }>()(
  'Messages',
) {}
declare function durableObjectPersistence(
  storage: DurableObjectStorage,
): Layer.Layer<Persistence.BackingPersistence>;
const t = initTrpc();
const router = {
  onMessage: t.procedure.subscription((opts) =>
    Messages.subscribe('message', { lastEventId: opts.lastEventId }),
  ),
};
interface Env {}
class Room extends DurableObject<Env> {
  // ---cut-end---
  handler = createFetchHandler({
    router,
    layer: Layer.mergeAll(
      hibernatingPublisher(Messages, { state: this.ctx, buffer: 100 }),
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
const router = { health: t.procedure.query(() => 'ok') };
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

## Workers Traces

`experimental_workersTracer({ tracing })` is an Effect `Tracer` that records spans with Workers Traces' custom spans API, with no OpenTelemetry SDK: tRPC's server and client spans and any `Effect.withSpan`, with their attributes and an error status on failure. Turn on `observability.traces` in the Wrangler config. Workers nests spans by async context, so pass `snapshot: () => AsyncLocalStorage.snapshot()` (`nodejs_compat`) too: then spans nest as Effect nests them, and the spans Workers adds itself (subrequests, storage, other objects) sit under the call that made them. Without it, every span is a child of the request's.

```ts twoslash
// ---cut-start---
/// <reference types="@cloudflare/workers-types" />
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = { health: t.procedure.query(() => 'ok') };
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

Workers spans have no events, so Effect's span events are dropped, and a `traceparent` from another service doesn't parent the call: its spans join the Worker's own trace. Locally, Wrangler's Local Explorer (`e` in `wrangler dev`) shows the spans; the example's smoke test reads them from its trace store.

## Signed connection tokens

The Worker in front of the object usually authenticates the user already. `connectionToken(schema, { secret })` lets it hand that over: a procedure on the Worker signs claims, the client sends the token as a connection param, and the object's `createContext` verifies it (HMAC-SHA256 with WebCrypto) instead of looking up the session again:

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
import { connectionToken } from '@trpc12/trpc/cloudflare';

const RoomToken = connectionToken(
  Schema.Struct({ room: Schema.String, user: Schema.String }),
  { secret: env.TOKEN_SECRET, ttlSeconds: 600 },
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
const workerRouter = {
  roomToken: t.procedure
    .input(Schema.Struct({ room: Schema.String }))
    .query((opts) =>
      RoomToken.sign({ room: opts.input.room, user: opts.ctx.user.id }),
    ),
};

// ---cut-start---
export type WorkerRouter = typeof workerRouter;
// @filename: room.ts
import { DurableObject } from 'cloudflare:workers';
import { hibernatingPublisher } from '@trpc12/trpc/cloudflare';
import { createFetchHandler, initTrpc, Publisher } from '@trpc12/trpc/server';
import { Effect } from 'effect';
import { RoomToken } from './token.ts';
interface Env {}
const t = initTrpc<{ ctx: { room: string; user: string } }>();
class Notes extends Publisher.Service<
  Notes,
  { [inbox: `inbox:${string}`]: { text: string } }
>()('Notes') {}
// ---cut-end---
// the Durable Object's router and handler
const roomRouter = {
  inbox: t.procedure.subscription((opts) =>
    Notes.subscribe(`inbox:${opts.ctx.user}`, {
      lastEventId: opts.lastEventId,
    }),
  ),
};

export class Room extends DurableObject<Env> {
  handler = createFetchHandler({
    router: roomRouter,
    createContext: (opts) =>
      Effect.runPromise(
        RoomToken.verify(opts.info.connectionParams?.['token']),
      ),
    layer: hibernatingPublisher(Notes, { state: this.ctx }),
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

- `verify` fails with `UNAUTHORIZED` when the token is missing, malformed, signed with another secret or past `ttlSeconds` (default an hour). It reads the time from Effect's `Clock`.
- The claims are encoded with the schema and readable by the client; keep secrets out of them.
- Expiry is checked whenever `createContext` runs: on each call, and when a subscription starts. A parked subscription keeps getting events after the token expires, until the socket closes or the client reconnects.

## Credits

Hibernating WebSockets, the Durable Object publisher and lock, and Workers Traces follow oRPC's [hibernation integration](https://orpc.dev/docs/integrations/hibernation), [publisher](https://orpc.dev/docs/helpers/publisher), [locks](https://orpc.dev/docs/helpers/lock) and [Cloudflare Traces integration](https://orpc.dev/docs/integrations/cloudflare-traces).
