---
id: websockets
title: WebSockets
sidebar_label: WebSockets
slug: /server/websockets
---

You can use WebSockets for all or some of the communication with your server, see [wsLink](../client/links/wsLink.md) for how to set it up on the client.

:::tip
The document here outlines the specific details of using WebSockets. For general usage of subscriptions, see [our subscriptions guide](../server/subscriptions.md).
:::

### Creating a WebSocket-server

```bash
yarn add ws
```

```ts title='server/wsServer.ts'
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import ws from 'ws';
import { appRouter } from './routers/app';
import { createContext } from './trpc';

const wss = new ws.Server({
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
  console.log(`➕➕ Connection (${wss.clients.size})`);
  ws.once('close', () => {
    console.log(`➖➖ Connection (${wss.clients.size})`);
  });
});
console.log('✅ WebSocket Server listening on ws://localhost:3001');

process.on('SIGTERM', () => {
  console.log('SIGTERM');
  handler.broadcastReconnectNotification();
  wss.close();
});
```

### Setting `TRPCClient` to use WebSockets

:::tip
You can use [Links](../client/links/overview.md) to route queries and/or mutations to HTTP transport and subscriptions over WebSockets.
:::

```tsx title='client.ts'
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '../path/to/server/trpc';

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

```ts title="client/trpc.ts"
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from '~/server/routers/_app';

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

### Automatic tracking of id using `tracked()` (recommended)

If you `yield` an event using our `tracked()`-helper and include an `id`, the client will automatically reconnect when it gets disconnected and send the last known ID when reconnecting as part of the `lastEventId`-input.

You can send an initial `lastEventId` when initializing the subscription and it will be automatically updated as the browser receives data.

:::info
If you're fetching data based on the `lastEventId`, and capturing all events is critical, you may want to use `ReadableStream`'s or a similar pattern as an intermediary as is done in [our full-stack SSE example](https://github.com/trpc/examples-next-sse-chat) to prevent newly emitted events being ignored while yield'ing the original batch based on `lastEventId`.
:::

```ts
import EventEmitter, { on } from 'events';
import { tracked } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

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
      if (opts.input.lastEventId) {
        // [...] get the posts since the last event id and yield them
      }
      // listen for new events
      for await (const [data] of on(ee, 'add', {
        // Passing the AbortSignal from the request automatically cancels the event emitter when the subscription is aborted
        signal: opts.signal,
      })) {
        const post = data as Post;
        // tracking the post id ensures the client can reconnect at any time and get the latest events this id
        yield tracked(post.id, post);
      }
    }),
});
```

## WebSockets RPC Specification

> You can read more details by drilling into the TypeScript definitions:
>
> - [/packages/server/src/rpc/envelopes.ts](https://github.com/trpc/trpc/tree/next/packages/server/src/rpc/envelopes.ts)
> - [/packages/server/src/rpc/codes.ts](https://github.com/trpc/trpc/tree/next/packages/server/src/rpc/codes.ts).

### `query` / `mutation`

#### Request

```ts
{
  id: number | string;
  jsonrpc?: '2.0'; // optional
  method: 'query' | 'mutation';
  params: {
    path: string;
    input?: unknown; // <-- pass input of procedure, serialized by transformer
  };
}
```

#### Response

_... below, or an error._

```ts
{
  id: number | string;
  jsonrpc?: '2.0'; // only defined if included in request
  result: {
    type: 'data'; // always 'data' for mutation / queries
    data: TOutput; // output from procedure
  }
}
```

### `subscription` / `subscription.stop`

#### Start a subscription

```ts
{
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

```ts
{
  id: number | string; // <-- id of your created subscription
  jsonrpc?: '2.0';
  method: 'subscription.stop';
}
```

#### Subscription response shape

_... below, or an error._

```ts
{
  id: number | string;
  jsonrpc?: '2.0';
  result: (
    | {
        type: 'data';
        data: TData; // subscription emitted data
      }
    | {
        type: 'started'; // subscription started
      }
    | {
        type: 'stopped'; // subscription stopped
      }
  )
}
```

#### Connection params

If the connection is initialized with `?connectionParams=1`, the first message has to be connection params.

```ts
{
  data: Record<string, string> | null;
  method: 'connectionParams';
}
```

## Errors

See [https://www.jsonrpc.org/specification#error_object](https://www.jsonrpc.org/specification#error_object) or [Error Formatting](../server/error-formatting.md).

## Notifications from Server to Client

### `{ id: null, type: 'reconnect' }`

Tells clients to reconnect before shutting down the server. Invoked by `wssHandler.broadcastReconnectNotification()`.
