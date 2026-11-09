---
title: '`wsLink`'
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

await ws.dispose();
```

- `url`: the handler's endpoint.
- `connectionParams`: sent once per connection, before any call, or a function that makes them. `createContext` gets them as `info.connectionParams` ([Context](../../server/context.md)). Browsers can't set WebSocket headers, so send auth tokens here.
- `reconnect`: how a dropped connection reconnects, `{ attempts: 5, delay }` by default. `delay(attempt)` returns the wait before each attempt.
- `keepAlive`: pings (below).
- `idleTimeout`: close the connection after this long without calls; the next call opens a new one. By default it stays open until `close()`.
- `binary`: file bytes in outputs as binary messages instead of base64 text. Servers that don't know binary messages keep sending text.
- `transformer`: must match the handler's, and client types follow it ([Transformers](../../server/transformers.md)).
- `WebSocket`: a `WebSocket` implementation, `globalThis.WebSocket` by default.

`close()` closes the connection: calls in flight fail with `CLIENT_CLOSED_REQUEST`, and the next call opens a new connection. `dispose()` ends the link for good: calls in flight and every later call fail with `CLIENT_CLOSED_REQUEST`, and the connection closes. The link is also `AsyncDisposable`, so `await using ws = wsLink(…)` disposes it at the end of the scope.

## Reconnects

When the connection drops, subscriptions subscribe again from their last [`tracked()`](../../subscriptions/overview.md#resuming) event id, and queries and mutations in flight fail with `NETWORK_ERROR`. A subscription made with `{ reconnect: false }` ends with `NETWORK_ERROR` instead.

A connection that doesn't open, because the WebSocket fails or `connectionParams` throws, counts as a dropped one: subscriptions try again after `delay`, and queries and mutations fail. The call that gives up fails with `NETWORK_ERROR`, and its `cause` is the error that kept the connection from opening, such as the one `connectionParams` threw.

`attempts` counts the connections in a row that dropped before the server sent anything; one that it answered on starts the count again. An error the server sends for the whole connection, such as an unsupported protocol version, fails every call on it, subscriptions included, with that error instead of reconnecting, so a server that keeps refusing can't keep a subscription reconnecting.

### Rolling deploys

A server that is shutting down drains its connections ([Rolling deploys](../../adapters/overview.md#rolling-deploys)) and sends each client a `reconnect` message. It keeps serving that connection until the client leaves, so the link switches over without a gap:

- It opens a new connection, which the load balancer routes to a server that isn't shutting down. Until that one is open and its `connectionParams` have resolved, new queries, mutations and subscriptions still go on the old connection.
- Then each subscription subscribes on the new connection from the last event it handled, and keeps receiving on the old one until the new one answers it. Only then is it stopped on the old connection, whose later events for it are dropped. The new connection resends the events the old one delivered in between, and the link drops each of those once by its `tracked()` id, so none is missed or seen twice.
- If the new connection fails to open or drops before it answers, the subscription stays on the old connection, and the link tries again with its reconnect backoff for as long as the old one serves, without failing anything. If the old connection closes first, subscriptions that haven't moved reconnect as after a dropped connection, and ones already sent to the new connection stay there.
- It closes the old connection once the queries and mutations sent on it have their results and every subscription has moved.
- The notice says when the server closes the old connection (`drainIn`; [When the notice is sent](../../subscriptions/overview.md#when-the-notice-is-sent)). If it's still open then, the link lets it go as if it had dropped: subscriptions sent to the new connection stay there, the others reconnect, and calls still waiting on it fail with `NETWORK_ERROR`.

Subscribers see none of this: no error and no second `started`. Nothing already sent is sent again, so a mutation never runs twice. A query or mutation the server doesn't finish before its drain timeout fails with `NETWORK_ERROR`, as on a dropped connection.

A subscription without `tracked()` ids has no event to resume from, so it **starts over** on the new connection: the resolver runs again from the start, without `lastEventId`. Its events can't be matched, so the old connection keeps delivering them until the server confirms it stopped the subscription there, or the connection closes. An event can arrive twice, but none is missed. Give events ids if the client must see each one once. A subscription made with `{ reconnect: false }` stays on the old connection and ends with `NETWORK_ERROR` when the server closes it.

## Keep-alive

The link pings every 30 s and treats a connection that answers nothing for 10 s as lost, so it reconnects instead of waiting for a close a dead network never delivers. The traffic also keeps proxies from dropping a quiet socket. `keepAlive: { interval: '15 seconds', timeout: '5 seconds' }` changes the timings, and `false` sends no pings.

The server closes a socket that sends nothing for 60 s (code 1001) and stops its subscriptions; set `createFetchHandler({ websocket: { idleTimeout } })`, or `false` to keep silent sockets open.

The [`examples/realtime`](../../../../../v12/examples/realtime/client.ts) app sends a token in `connectionParams`, restarts a server under its subscriptions, and has the server drop a client that sends no pings; each one resumes from its last event.
