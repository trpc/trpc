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

### Setting `TRPCClient` to use WebSockets

:::tip
You can use [Links](../client/links/overview.md) to route queries and/or mutations to HTTP transport and subscriptions over WebSockets. See [Using WebSockets alongside HTTP](#using-websockets-alongside-http).
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

## Using WebSockets alongside HTTP

You can serve the same router over both transports: mount the HTTP adapter as usual and attach `applyWSSHandler` to the same Node.js server.

### Server

```ts twoslash title='server.ts'
// @filename: routers/app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({
  post: t.router({}),
});

// @filename: server.ts
// @types: node
// ---cut---
import { createServer } from 'http';
import * as trpcExpress from '@trpc/server/adapters/express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import express from 'express';
import { WebSocketServer } from 'ws';
import { appRouter } from './routers/app';

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
  }),
);

const server = createServer(app);
const wss = new WebSocketServer({ server });

applyWSSHandler({
  wss,
  router: appRouter,
});

server.listen(3000);
```

`applyWSSHandler` takes your root router, just like the HTTP adapter, so nested routers need no extra setup: a subscription defined at `appRouter.post.onAdd` is called as `post.onAdd`. The `prefix` option filters which upgrade requests the handler accepts based on the request URL. It does not namespace the router.

### Client

Use [`splitLink`](../client/links/splitLink.mdx) to send subscriptions over the WebSocket connection and everything else over HTTP.

```ts twoslash title='client.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client';
import type { AppRouter } from './server';

const wsClient = createWSClient({
  url: 'ws://localhost:3000',
});

const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({ url: 'http://localhost:3000/trpc' }),
    }),
  ],
});
```

### Typing `createContext` for both adapters

Each adapter passes its own `req`/`res` pair, so a function typed as a union of both option types can only read the properties the two have in common. Express-specific ones like `req.cookies` are not on the union:

```ts twoslash title='server/context.ts'
// @errors: 2339
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

const createContext = (
  opts: CreateExpressContextOptions | CreateWSSContextFnOptions,
) => {
  return { token: opts.req.cookies['token'] };
};
```

Narrowing with `'res' in opts` does not help: both adapters have a `res`, an `express.Response` on HTTP and a `ws.WebSocket` on WebSockets.

Write one function per adapter and give them a shared return type. Only the way you read the request differs: `ws` does not parse cookies for you, so read them off the `cookie` header.

```ts twoslash title='server/context.ts'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

interface Context {
  token: string | undefined;
}

export const createExpressContext = (
  opts: CreateExpressContextOptions,
): Context => ({
  token: opts.req.cookies['token'],
});

export const createWSSContext = (opts: CreateWSSContextFnOptions): Context => ({
  token: /token=([^;]+)/.exec(opts.req.headers.cookie ?? '')?.[1],
});
```

Initialize tRPC with `Context` and pass each function to its own adapter:

```ts twoslash title='server.ts'
// @filename: context.ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
export interface Context {
  token: string | undefined;
}
export declare const createExpressContext: (
  opts: CreateExpressContextOptions,
) => Context;
export declare const createWSSContext: (
  opts: CreateWSSContextFnOptions,
) => Context;

// @filename: routers/app.ts
import { initTRPC } from '@trpc/server';
import type { Context } from '../context';
const t = initTRPC.context<Context>().create();
export const appRouter = t.router({});

// @filename: server.ts
// @types: node
// ---cut---
import { createServer } from 'http';
import * as trpcExpress from '@trpc/server/adapters/express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createExpressContext, createWSSContext } from './context';
import { appRouter } from './routers/app';

const app = express();

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: createExpressContext,
  }),
);

const server = createServer(app);

applyWSSHandler({
  wss: new WebSocketServer({ server }),
  router: appRouter,
  createContext: createWSSContext,
});

server.listen(3000);
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

### Automatic tracking of id using `tracked()` (recommended)

If you `yield` an event using our `tracked()`-helper and include an `id`, the client will automatically reconnect when it gets disconnected and send the last known ID when reconnecting as part of the `lastEventId`-input.

You can send an initial `lastEventId` when initializing the subscription and it will be automatically updated as the browser receives data.

:::info
If you're fetching data based on the `lastEventId`, and capturing all events is critical, you may want to use `ReadableStream`'s or a similar pattern as an intermediary as is done in [our full-stack SSE example](https://github.com/trpc/examples-next-sse-chat) to prevent newly emitted events being ignored while yield'ing the original batch based on `lastEventId`.
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

See [https://www.jsonrpc.org/specification#error_object](https://www.jsonrpc.org/specification#error_object) or [Error Formatting](../server/error-formatting.md).

## Notifications from Server to Client

### `{ id: null, type: 'reconnect' }`

Tells clients to reconnect before shutting down the server. Invoked by `wssHandler.broadcastReconnectNotification()`.
