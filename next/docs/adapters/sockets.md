---
title: Raw sockets
description: serveSocket serves the router over TCP, TLS or Unix sockets, with experimental_socketLink on the client.
section: Adapters
order: 10
hidden: true
---

Between services, or where there is no HTTP stack, `serveSocket(handler)` from `@trpc12/trpc/socket` serves the router on Effect's `SocketServer`. The platform layer picks the socket: `NodeSocketServer.layer({ port })` for TCP, `NodeSocketServer.layerTls` for TLS, or `{ path }` for a Unix socket.

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
// ---cut-end---
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

```ts twoslash
// ---cut-start---
declare const token: string;
// ---cut-end---
import { NodeSocket } from '@effect/platform-node';
import { experimental_socketLink } from '@trpc12/trpc/client';

const link = experimental_socketLink({
  socket: NodeSocket.makeNet({ host: 'localhost', port: 4000 }),
  connectionParams: { token },
});
```

A connection speaks the WebSocket protocol, one JSON message per line, so everything that works over `wsLink` works here: `connectionParams`, subscriptions with resume, deferred values, aborts, keep-alive pings and reconnects. `createContext` gets `info.transport === 'socket'`. There are no headers, so authenticate with `connectionParams`. A connection that sends nothing for 60 s is closed (`serveSocket(handler, { idleTimeoutMs })`, or `false`).

WebTransport isn't supported: no server runtime that Effect has a platform for serves it yet.
