---
title: wsLink
description: Every call over one WebSocket, with connection params, keep-alive pings and reconnects that resume subscriptions.
section: Client
parent: client/links
order: 2
v11: client/links/wsLink
---

`wsLink` runs queries, mutations and subscriptions over one WebSocket, which it opens on the first call. The handler serves WebSockets on the same endpoint as HTTP ([Adapters](../../adapters/overview.md)).

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
declare function getToken(): Promise<string>;
// ---cut-end---
import { createTrpcClient, routerType, wsLink } from '@trpc12/trpc/client';

const ws = wsLink({
  url: 'ws://localhost:3000/trpc',
  connectionParams: async () => ({ token: await getToken() }),
});
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [ws],
});

await ws.close();
```

- `url`: the handler's endpoint.
- `connectionParams`: sent once per connection, before any call, or a function that makes them. `createContext` gets them as `info.connectionParams` ([Context](../../server/context.md)). Browsers can't set WebSocket headers, so send auth tokens here.
- `reconnect`: how a dropped connection reconnects, `{ attempts: 5, delayMs }` by default.
- `keepAlive`: pings (below).
- `idleMs`: close the connection after this long without calls; the next call opens a new one. By default it stays open until `close()`.
- `binary`: file bytes in outputs as binary messages instead of base64 text. Servers that don't know binary messages keep sending text.
- `serializer`: must match the handler's, and client types follow it ([Serializers](../../server/serializers.md)).
- `WebSocket`: a `WebSocket` implementation, `globalThis.WebSocket` by default.

`close()` closes the connection: calls in flight fail with `CLIENT_CLOSED_REQUEST`, and the next call opens a new connection. The link is also `AsyncDisposable`, so `await using ws = wsLink(…)` closes it at the end of the scope.

## Reconnects

When the connection drops, subscriptions subscribe again from their last [`tracked()`](../../subscriptions/overview.md#resuming) event id, and queries and mutations in flight fail with `NETWORK_ERROR`. A subscription made with `{ reconnect: false }` ends with `NETWORK_ERROR` instead.

## Keep-alive

The link pings every 30 s and treats a connection that answers nothing for 10 s as lost, so it reconnects instead of waiting for a close a dead network never delivers. The traffic also keeps proxies from dropping a quiet socket. `keepAlive: { intervalMs, timeoutMs }` changes the timings, and `false` sends no pings.

The server closes a socket that sends nothing for 60 s (code 1001) and stops its subscriptions; set `createFetchHandler({ websocket: { idleTimeoutMs } })`, or `false` to keep silent sockets open.

The [`examples/realtime`](../../../examples/realtime/index.ts) app sends a token in `connectionParams`, restarts a server under its subscriptions, and has the server drop a client that sends no pings; each one resumes from its last event.
