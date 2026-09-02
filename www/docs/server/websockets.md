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

The example below sends **all** operations over WebSockets. To keep queries and mutations on HTTP, see [Using HTTP and WebSockets together](#http-and-websockets).

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

## Using HTTP and WebSockets together {#http-and-websockets}

A common setup is queries and mutations over HTTP, and subscriptions over WebSockets. Use the **same** `appRouter` on both handlers, and [`splitLink`](../client/links/splitLink.mdx) on the client so each operation hits the right terminating link.

[`httpLink`](../client/links/httpLink.md) and [`httpBatchLink`](../client/links/httpBatchLink.md) throw if they receive a subscription. Either route subscriptions with `splitLink`, or send every operation through `wsLink` as in the previous section.

Reference implementations: [standalone-server](https://github.com/trpc/trpc/tree/main/examples/standalone-server) and [fastify-server](https://github.com/trpc/trpc/tree/main/examples/fastify-server).

### Client

```ts twoslash title="client.ts"
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
  url: `ws://localhost:3000`,
});

const client = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({
        client: wsClient,
      }),
      false: httpBatchLink({
        url: `http://localhost:3000`,
      }),
    }),
  ],
});
```

### Server

Pass the same router to the HTTP adapter and to `applyWSSHandler`. You can attach the WebSocket server to the HTTP server (same port) or listen on a separate port as in [Creating a WebSocket-server](#creating-a-websocket-server).

```ts twoslash title="server.ts"
// @types: node
// @filename: context.ts
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

export function createHTTPContext(_opts: CreateHTTPContextOptions) {
  return {};
}
export function createWSSContext(_opts: CreateWSSContextFnOptions) {
  return {};
}

// @filename: routers/app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { appRouter } from './routers/app';
import { createHTTPContext, createWSSContext } from './context';

const server = createHTTPServer({
  router: appRouter,
  createContext: createHTTPContext,
});

const wss = new WebSocketServer({ server });
applyWSSHandler({
  wss,
  router: appRouter,
  createContext: createWSSContext,
});

server.listen(3000);
```

With Express, wrap the app in Node's HTTP server and attach `ws` the same way. Use a **separate** `createContext` for each adapter — see [`createContext` typing](#createContext).

```ts twoslash title="server.ts"
// @types: node
// @filename: context.ts
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

export function createExpressContext(_opts: CreateExpressContextOptions) {
  return {};
}
export function createWSSContext(_opts: CreateWSSContextFnOptions) {
  return {};
}

// @filename: routers/app.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// ---cut---
import { createServer } from 'node:http';
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
const wss = new WebSocketServer({ server });
applyWSSHandler({
  wss,
  router: appRouter,
  createContext: createWSSContext,
});

server.listen(3000);
```

`createContext` for HTTP runs **once per request**. For WebSockets it runs **once per connection** (after `connectionParams` arrive, if you use them).

## Nested routers {#nested-routers}

[Merging / nesting routers](./merging-routers.md) does not change how WebSockets are set up. Pass the **root** `appRouter` to `applyWSSHandler`, the same object you pass to the HTTP adapter. Procedure paths are identical over WebSockets and HTTP: a nested `post.onAdd` subscription is still `post.onAdd`.

```ts twoslash title="routers/_app.ts"
// @types: node
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: routers/post.ts
import { publicProcedure, router } from '../trpc';

export const postRouter = router({
  onAdd: publicProcedure.subscription(async function* () {
    while (true) {
      yield { id: '1', title: 'hello' };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
});

// @filename: routers/_app.ts
// ---cut---
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';
import { router } from '../trpc';
import { postRouter } from './post';

export const appRouter = router({
  post: postRouter,
});
export type AppRouter = typeof appRouter;

const wss = new WebSocketServer({ port: 3001 });
applyWSSHandler({
  wss,
  // Same root router as the HTTP handler — not `postRouter`
  router: appRouter,
  createContext: () => ({}),
});
```

The client calls the nested path as usual:

```ts twoslash title="client.ts"
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: routers/post.ts
import { publicProcedure, router } from '../trpc';
export const postRouter = router({
  onAdd: publicProcedure.subscription(async function* () {
    yield { id: '1', title: 'hello' };
  }),
});

// @filename: routers/_app.ts
import { router } from '../trpc';
import { postRouter } from './post';
export const appRouter = router({ post: postRouter });
export type AppRouter = typeof appRouter;

// @filename: client.ts
import { createTRPCClient, createWSClient, wsLink } from '@trpc/client';
import type { AppRouter } from './routers/_app';

const wsClient = createWSClient({ url: `ws://localhost:3001` });
const client = createTRPCClient<AppRouter>({
  links: [wsLink({ client: wsClient })],
});
// ---cut---
const subscription = client.post.onAdd.subscribe(undefined, {
  onData(post) {
    console.log(post);
    //          ^?
  },
});
```

Do **not** pass a child router to `applyWSSHandler` unless the client is also typed against that child. If the client uses `AppRouter` and the WS handler only mounts `postRouter`, the client sends path `post.onAdd` while the server only knows `onAdd`.

:::note
`applyWSSHandler`'s optional `prefix` option filters the WebSocket upgrade URL (`req.url`). It is **not** a nested-router namespace.
:::

## Authentication / connection params {#connectionParams}

:::tip
If you're doing a web application, you can ignore this section as the cookies are sent as part of the WebSocket upgrade request. Reading those cookies (and why Express `req.cookies` is not available on the WS handler) is covered in [`createContext` typing](#createContext).
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

## `createContext` typing {#createContext}

`createContext` is typed **per adapter**. You cannot pass an Express `createContext` into `applyWSSHandler` — the option objects are different types:

| Adapter         | Options type                                                       | `req`                  | `res`                 |
| --------------- | ------------------------------------------------------------------ | ---------------------- | --------------------- |
| Express         | `CreateExpressContextOptions` from `@trpc/server/adapters/express` | `express.Request`      | `express.Response`    |
| WebSockets      | `CreateWSSContextFnOptions` from `@trpc/server/adapters/ws`        | Node `IncomingMessage` | `ws.WebSocket`        |
| Standalone HTTP | `CreateHTTPContextOptions` from `@trpc/server/adapters/standalone` | Node `IncomingMessage` | `http.ServerResponse` |

Each function is passed to the matching handler. Both must return the **same context shape** so `initTRPC.context<Context>()` stays a single type for every procedure.

### Two `createContext` functions (recommended)

This is the supported pattern when HTTP and WebSockets run side by side. Cookie parsing and `res` differ by transport, so each adapter gets its own function.

Do **not** type one function as `CreateExpressContextOptions | CreateWSSContextFnOptions` if you need Express-only fields. In that union, `req.cookies` disappears (`IncomingMessage` has no `cookies`), and `res` is `express.Response | WebSocket`.

```ts twoslash title="server/context.ts"
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

function cookieValue(cookieHeader: string | undefined, name: string) {
  const prefix = `${name}=`;
  const part = cookieHeader
    ?.split('; ')
    .find((entry) => entry.startsWith(prefix));
  return part?.slice(prefix.length);
}

/**
 * Shared inner context so HTTP and WS handlers expose the same `ctx`.
 * @see https://trpc.io/docs/server/context
 */
function createContextInner(opts: { token: string | undefined }) {
  return {
    token: opts.token,
  };
}

export function createExpressContext(opts: CreateExpressContextOptions) {
  const token = cookieValue(opts.req.headers.cookie, 'token');
  return createContextInner({ token });
}

export function createWSSContext(opts: CreateWSSContextFnOptions) {
  const token =
    opts.info.connectionParams?.token ??
    cookieValue(opts.req.headers.cookie, 'token');
  return createContextInner({ token });
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;
```

```ts twoslash title="server/trpc.ts"
// @filename: context.ts
export type Context = { token: string | undefined };

// @filename: trpc.ts
// ---cut---
import { initTRPC } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;
```

Wire each function into its adapter:

```ts
trpcExpress.createExpressMiddleware({
  router: appRouter,
  createContext: createExpressContext,
});

applyWSSHandler({
  wss,
  router: appRouter,
  createContext: createWSSContext,
});
```

### Cookies

Same-origin browsers send cookies on the WebSocket upgrade. tRPC does not parse them.

- **Express:** middleware such as [`cookie-parser`](https://www.npmjs.com/package/cookie-parser) sets `req.cookies`. That property is **not** on `CreateWSSContextFnOptions['req']`.
- **WebSockets:** read the raw `Cookie` header on `opts.req.headers.cookie` (as above), or pass a token with [`connectionParams`](#connectionParams).

### When a union type is enough

If you only use fields that exist on both option objects (typically `opts.req.headers`), a union is fine. The [standalone-server example](https://github.com/trpc/trpc/blob/main/examples/standalone-server/src/server.ts) does this because standalone HTTP and WebSockets both use Node's `IncomingMessage`:

```ts twoslash title="server/context.ts"
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';

export function createContext(
  opts: CreateHTTPContextOptions | CreateWSSContextFnOptions,
) {
  const token = opts.req.headers.authorization;
  return { token };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

Prefer two functions as soon as you need Express `req.cookies`, `res` cookies/headers, or WS `connectionParams` without narrowing.

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
