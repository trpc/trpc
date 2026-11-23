---
id: websockets
title: WebSockets
sidebar_label: WebSockets
slug: /server/websockets
section: "Backend Usage"
order: 28
---

You can use WebSockets for all or some of the communication with your server, see [wsLink](../client/links/wsLink.md) for how to set it up on the client.

:::tip
The document here outlines the specific details of using WebSockets. For general usage of subscriptions, see [our subscriptions guide](./subscriptions.md).
:::

### Creating a WebSocket-server

```bash
yarn add ws
```

```ts twoslash title='server/wsServer.ts'
// @filename: trpc.ts
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
export const createContext = (opts: CreateWSSContextFnOptions) => ({});

// @filename: routers/app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: wsServer.ts
// @types: node
// ---cut---
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './routers/app';
import { createContext } from './trpc';

const wss = new WebSocketServer({
  port: 3001,
});
const handler = applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
  // Enable heartbeat messages to keep connection open (disabled by default)
  keepAlive: {
    enabled: true,
    // server ping message interval in milliseconds
    pingMs: 30000,
    // connection is terminated if pong message is not received in this many milliseconds
    pongWaitMs: 5000,
  },
});

wss.on('connection', (ws) => {
  console.log(`++ Connection (${wss.clients.size})`);
  ws.once('close', () => {
    console.log(`-- Connection (${wss.clients.size})`);
  });
});
console.log('WebSocket Server listening on ws://localhost:3001');

process.on('SIGTERM', () => {
  console.log('SIGTERM');
  handler.broadcastReconnectNotification();
  wss.close();
});
```

### Sharing a port with your HTTP server

To serve HTTP and WebSockets on the same port, pass your HTTP server to `WebSocketServer`. `ws` then handles the upgrade requests, and your adapter handles the rest.

```ts twoslash title='server/index.ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// @types: node
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './router';

const server = createHTTPServer({ router: appRouter });
const wss = new WebSocketServer({ server });
applyWSSHandler({ wss, router: appRouter });

server.listen(3000);
```

### Limiting batch size

`applyWSSHandler` accepts the same `maxBatchSize` option as the [HTTP adapters](./adapters.md#common-options). A WebSocket message that batches more requests than this is rejected as a whole: no procedure runs, and every request in it, except `subscription.stop` entries, gets a `BAD_REQUEST` error with the message `Batch call exceeds maximum size`.

`wsLink` sends all requests made in the same tick as one message and has no `maxItems` option, so pick a limit above the number of calls your client makes at once.

### Rejecting cross-origin connections

Browsers don't apply CORS to WebSockets: a page on any origin can open a connection to your server, and the browser sends its cookies with it. If you authenticate with cookies, check the `Origin` header against the origins you trust. With `ws`, do this in `verifyClient`, and pass `403` to its callback so a rejected upgrade gets `403 Forbidden`:

```ts twoslash title='server/wsServer.ts'
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// @types: node
// ---cut---
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './router';

const allowedOrigins = new Set(['https://app.example.com']);

const wss = new WebSocketServer({
  port: 3001,
  verifyClient: ({ origin }, callback) => {
    // Browsers always send `Origin`, but other clients may not.
    // Decide whether your app accepts connections without one.
    callback(!origin || allowedOrigins.has(origin), 403);
  },
});
applyWSSHandler({ wss, router: appRouter });
```

If you handle upgrades yourself with `noServer: true`, check `req.headers.origin` in your server's `upgrade` listener instead. For an origin you don't trust, end the socket with a `403` response, such as `socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')`, rather than calling `wss.handleUpgrade()`.

### Setting `TRPCClient` to use WebSockets

:::tip
You can use [Links](../client/links.md) to route queries and/or mutations to HTTP transport and subscriptions over WebSockets.
:::

```tsx twoslash title='client.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from './server';

// create persistent WebSocket connection
const wsClient = createWSClient({
  url: `ws://localhost:3001`,
});

// configure TRPCClient to use WebSockets transport
const client = createTRPCClient<AppRouter>({
  links: [
    wsLink({
      client: wsClient,
    }),
  ],
});
```

## Authentication / connection params {#connectionParams}

:::tip
If you're doing a web application, you can ignore this section as the cookies are sent as part of the request.
:::

In order to authenticate with WebSockets, you can define `connectionParams` to `createWSClient`. This will be sent as the first message when the client establishes a WebSocket connection.

```ts twoslash title="server/context.ts"
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

export const createContext = async (opts: CreateWSSContextFnOptions) => {
  const token = opts.info.connectionParams?.token;
  //    ^?

  // [... authenticate]

  return {};
};

export type Context = Awaited<ReturnType<typeof createContext>>;
```

```ts twoslash title="client/trpc.ts"
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
const t = initTRPC.create({ transformer: superjson });
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from './server';
import superjson from 'superjson';

const wsClient = createWSClient({
  url: `ws://localhost:3000`,

  connectionParams: async () => {
    return {
      token: 'supersecret',
    };
  },
});
export const trpc = createTRPCClient<AppRouter>({
  links: [wsLink({ client: wsClient, transformer: superjson })],
});
```

`createContext` runs once per connection (after the connection params arrive, if you send them), and every call over that connection shares its result. If it throws, the server sends the error and closes the connection. A token is only checked when the connection opens, so it stays accepted on that connection after it expires.

## Automatic tracking of id using `tracked()` (recommended)

If you `yield` an event using our `tracked()`-helper and include an `id`, the client will automatically reconnect when it gets disconnected and send the last known ID when reconnecting as part of the `lastEventId`-input.

You can send an initial `lastEventId` when initializing the subscription and it will be automatically updated as the browser receives data.

:::info
If you're fetching data based on the `lastEventId`, and capturing all events is critical, you may want to use `ReadableStream`'s or a similar pattern as an intermediary as is done in [our full-stack SSE example](https://github.com/trpc/examples-tanstack-start-sse-chat) to prevent newly emitted events being ignored while yield'ing the original batch based on `lastEventId`.
:::

```ts twoslash
// @types: node
import EventEmitter, { on } from 'events';
import { initTRPC, tracked } from '@trpc/server';
import { z } from 'zod';

type Post = { id: string; title: string };

const t = initTRPC.create();
const publicProcedure = t.procedure;
const router = t.router;

const ee = new EventEmitter();

export const subRouter = router({
  onPostAdd: publicProcedure
    .input(
      z
        .object({
          // lastEventId is the last event id that the client has received
          // On the first call, it will be whatever was passed in the initial setup
          // If the client reconnects, it will be the last event id that the client received
          lastEventId: z.string().nullish(),
        })
        .optional(),
    )
    .subscription(async function* (opts) {
      if (opts.input?.lastEventId) {
        // [...] get the posts since the last event id and yield them
      }
      // listen for new events
      for await (const [data] of on(ee, 'add', {
        // Passing the AbortSignal from the request automatically cancels the event emitter when the subscription is aborted
        signal: opts.signal,
      })) {
        const post = data as Post;
        // tracking the post id ensures the client can reconnect at any time and get the latest events since this id
        yield tracked(post.id, post);
      }
    }),
});
```

## WebSockets RPC Specification

> You can read more details by drilling into the TypeScript definitions:
>
> - [/packages/server/src/unstable-core-do-not-import/rpc/envelopes.ts](https://github.com/trpc/trpc/tree/main/packages/server/src/unstable-core-do-not-import/rpc/envelopes.ts)
> - [/packages/server/src/unstable-core-do-not-import/rpc/codes.ts](https://github.com/trpc/trpc/tree/main/packages/server/src/unstable-core-do-not-import/rpc/codes.ts).

### `query` / `mutation`

#### Request

```ts twoslash
interface RequestMessage {
  id: number | string;
  jsonrpc?: '2.0';
  method: 'query' | 'mutation';
  params: {
    path: string;
    input?: unknown; // <-- pass input of procedure, serialized by transformer
  };
}
```

#### Response

_... below, or an error._

```ts twoslash
type TOutput = any;
// ---cut---
interface ResponseMessage {
  id: number | string;
  jsonrpc?: '2.0';
  result: {
    type: 'data'; // always 'data' for mutation / queries
    data: TOutput; // output from procedure
  };
}
```

### `subscription` / `subscription.stop`

#### Start a subscription

```ts twoslash
interface SubscriptionRequest {
  id: number | string;
  jsonrpc?: '2.0';
  method: 'subscription';
  params: {
    path: string;
    input?: unknown; // <-- pass input of procedure, serialized by transformer
  };
}
```

#### To cancel a subscription, call `subscription.stop`

```ts twoslash
interface SubscriptionStopRequest {
  id: number | string; // <-- id of your created subscription
  jsonrpc?: '2.0';
  method: 'subscription.stop';
}
```

#### Subscription response shape

_... below, or an error._

```ts twoslash
type TData = any;
// ---cut---
interface SubscriptionResponse {
  id: number | string;
  jsonrpc?: '2.0';
  result:
    | {
        type: 'data';
        data: TData; // subscription emitted data
      }
    | {
        type: 'started'; // subscription started
      }
    | {
        type: 'stopped'; // subscription stopped
      };
}
```

#### Connection params

If the connection is initialized with `?connectionParams=1`, the first message has to be connection params.

```ts twoslash
interface ConnectionParamsMessage {
  data: Record<string, string> | null;
  method: 'connectionParams';
}
```

## Errors

See [https://www.jsonrpc.org/specification#error_object](https://www.jsonrpc.org/specification#error_object) or [Error Formatting](./error-formatting.md).

## Notifications from Server to Client

### `{ id: null, type: 'reconnect' }`

Tells clients to reconnect before shutting down the server. Invoked by `wssHandler.broadcastReconnectNotification()`.
