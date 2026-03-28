---
name: subscriptions
description: >
  Set up real-time event streams with async generator subscriptions using
  .subscription(async function*() { yield }). SSE via httpSubscriptionLink is
  recommended over WebSocket. Use tracked(id, data) from @trpc/server for
  reconnection recovery with lastEventId. WebSocket via wsLink and
  createWSClient from @trpc/client, applyWSSHandler from @trpc/server/adapters/ws. Configure SSE ping with
  initTRPC.create({ sse: { ping: { enabled, intervalMs } } }). AbortSignal
  via opts.signal for cleanup. splitLink to route subscriptions.
type: core
library: trpc
library_version: '11.16.0'
requires:
  - server-setup
  - links
sources:
  - www/docs/server/subscriptions.md
  - www/docs/server/websockets.md
  - www/docs/client/links/httpSubscriptionLink.md
  - www/docs/client/links/wsLink.md
  - packages/server/src/unstable-core-do-not-import/stream/sse.ts
  - packages/server/src/unstable-core-do-not-import/stream/tracked.ts
  - examples/standalone-server/src/server.ts
---

# tRPC — Subscriptions

## Setup

SSE is recommended for most subscription use cases. It is simpler to set up and does not require a WebSocket server.

### Server

```ts
// server.ts
import EventEmitter, { on } from 'node:events';
import { initTRPC, tracked } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';

const t = initTRPC.create({
  sse: {
    ping: {
      enabled: true,
      intervalMs: 2000,
    },
    client: {
      reconnectAfterInactivityMs: 5000,
    },
  },
});

type Post = { id: string; title: string };
const ee = new EventEmitter();

const appRouter = t.router({
  onPostAdd: t.procedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* (opts) {
      for await (const [data] of on(ee, 'add', { signal: opts.signal })) {
        const post = data as Post;
        yield tracked(post.id, post);
      }
    }),
});

export type AppRouter = typeof appRouter;

createHTTPServer({
  router: appRouter,
  createContext() {
    return {};
  },
}).listen(3000);
```

### Client (SSE)

```ts
// client.ts
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: 'http://localhost:3000' }),
      false: httpBatchLink({ url: 'http://localhost:3000' }),
    }),
  ],
});

const subscription = trpc.onPostAdd.subscribe(
  { lastEventId: null },
  {
    onData(post) {
      console.log('New post:', post);
    },
    onError(err) {
      console.error('Subscription error:', err);
    },
  },
);

// To stop:
// subscription.unsubscribe();
```

## Core Patterns

### tracked() for reconnection recovery

```ts
import EventEmitter, { on } from 'node:events';
import { initTRPC, tracked } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();
const ee = new EventEmitter();

const appRouter = t.router({
  onPostAdd: t.procedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* (opts) {
      const iterable = on(ee, 'add', { signal: opts.signal });

      if (opts.input?.lastEventId) {
        // Fetch and yield events since lastEventId from your database
        // const missed = await db.post.findMany({ where: { id: { gt: opts.input.lastEventId } } });
        // for (const post of missed) { yield tracked(post.id, post); }
      }

      for await (const [data] of iterable) {
        yield tracked(data.id, data);
      }
    }),
});
```

When using `tracked(id, data)`, the client automatically sends `lastEventId` on reconnection. For SSE this is part of the EventSource spec; for WebSocket, `wsLink` handles it.

### Polling loop subscription

```ts
import { initTRPC, tracked } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  onNewItems: t.procedure
    .input(z.object({ lastEventId: z.coerce.date().nullish() }))
    .subscription(async function* (opts) {
      let cursor = opts.input?.lastEventId ?? null;

      while (!opts.signal?.aborted) {
        const items = await db.item.findMany({
          where: cursor ? { createdAt: { gt: cursor } } : undefined,
          orderBy: { createdAt: 'asc' },
        });

        for (const item of items) {
          yield tracked(item.createdAt.toJSON(), item);
          cursor = item.createdAt;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    }),
});
```

### WebSocket setup (when bidirectional communication is required)

```ts
// server
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './router';

const wss = new WebSocketServer({ port: 3001 });
const handler = applyWSSHandler({
  wss,
  router: appRouter,
  createContext() {
    return {};
  },
  keepAlive: {
    enabled: true,
    pingMs: 30000,
    pongWaitMs: 5000,
  },
});

process.on('SIGTERM', () => {
  handler.broadcastReconnectNotification();
  wss.close();
});
```

```ts
// client
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const wsClient = createWSClient({ url: 'ws://localhost:3001' });

const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({ url: 'http://localhost:3000' }),
    }),
  ],
});
```

### Cleanup with try...finally

```ts
const appRouter = t.router({
  events: t.procedure.subscription(async function* (opts) {
    const cleanup = registerListener();
    try {
      for await (const [data] of on(ee, 'event', { signal: opts.signal })) {
        yield data;
      }
    } finally {
      cleanup();
    }
  }),
});
```

tRPC invokes `.return()` on the generator when the subscription stops, triggering the `finally` block.

## Common Mistakes

### HIGH Using Observable instead of async generator

Wrong:

```ts
import { observable } from '@trpc/server/observable';

t.procedure.subscription(({ input }) => {
  return observable((emit) => {
    emit.next(data);
  });
});
```

Correct:

```ts
t.procedure.subscription(async function* ({ input, signal }) {
  for await (const [data] of on(ee, 'event', { signal })) {
    yield data;
  }
});
```

Observable subscriptions are deprecated and will be removed in v12. Use async generator syntax (`async function*`).

Source: packages/server/src/unstable-core-do-not-import/procedureBuilder.ts

### MEDIUM Empty string as tracked event ID

Wrong:

```ts
yield tracked('', data);
```

Correct:

```ts
yield tracked(event.id.toString(), data);
```

`tracked()` throws if the ID is an empty string because it conflicts with SSE "no id" semantics.

Source: packages/server/src/unstable-core-do-not-import/stream/tracked.ts

### HIGH Fetching history before setting up event listener

Wrong:

```ts
t.procedure.subscription(async function* (opts) {
  const history = await db.getEvents(); // events may fire here and be lost
  yield* history;
  for await (const event of listener) {
    yield event;
  }
});
```

Correct:

```ts
t.procedure.subscription(async function* (opts) {
  const iterable = on(ee, 'event', { signal: opts.signal }); // listen first
  const history = await db.getEvents();
  for (const item of history) {
    yield tracked(item.id, item);
  }
  for await (const [event] of iterable) {
    yield tracked(event.id, event);
  }
});
```

If you fetch historical data before setting up the event listener, events emitted between the fetch and listener setup are lost.

Source: www/docs/server/subscriptions.md

### MEDIUM SSE ping interval >= client reconnect interval

Wrong:

```ts
initTRPC.create({
  sse: {
    ping: { enabled: true, intervalMs: 10000 },
    client: { reconnectAfterInactivityMs: 5000 },
  },
});
```

Correct:

```ts
initTRPC.create({
  sse: {
    ping: { enabled: true, intervalMs: 2000 },
    client: { reconnectAfterInactivityMs: 5000 },
  },
});
```

If the server ping interval is >= the client reconnect timeout, the client disconnects thinking the connection is dead before receiving a ping.

Source: packages/server/src/unstable-core-do-not-import/stream/sse.ts

### HIGH Sending custom headers with SSE without EventSource polyfill

Wrong:

```ts
httpSubscriptionLink({
  url: 'http://localhost:3000',
  // Native EventSource does not support custom headers
});
```

Correct:

```ts
import { EventSourcePolyfill } from 'event-source-polyfill';

httpSubscriptionLink({
  url: 'http://localhost:3000',
  EventSource: EventSourcePolyfill,
  eventSourceOptions: async () => ({
    headers: { authorization: 'Bearer token' },
  }),
});
```

The native EventSource API does not support custom headers. Use an EventSource polyfill and pass it via the `EventSource` option on `httpSubscriptionLink`.

Source: www/docs/client/links/httpSubscriptionLink.md

### MEDIUM Choosing WebSocket when SSE would suffice

SSE (`httpSubscriptionLink`) is recommended for most subscription use cases. WebSockets add complexity (connection management, reconnection, keepalive, separate server process). Only use `wsLink` when bidirectional communication or WebSocket-specific features are required.

Source: maintainer interview

### MEDIUM WebSocket subscription stale inputs on reconnect

When a WebSocket reconnects, subscriptions re-send the original input parameters. There is no hook to re-evaluate inputs on reconnect, which can cause stale data. Consider using `tracked()` with `lastEventId` to mitigate this.

Source: https://github.com/trpc/trpc/issues/4122

## See Also

- **links** -- `splitLink`, `httpSubscriptionLink`, `wsLink`, `httpBatchLink`
- **auth** -- authenticating subscription connections (connectionParams, cookies, EventSource polyfill headers)
- **server-setup** -- `initTRPC.create()` SSE configuration options
- **adapter-fastify** -- WebSocket subscriptions via `@fastify/websocket` and `useWSS`
