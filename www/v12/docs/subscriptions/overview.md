---
title: Subscriptions
label: Overview
description: Streams of events over SSE or WebSockets, with `tracked()` ids so reconnects resume.
section: Subscriptions
order: 1
v11: server/subscriptions
---

A subscription returns an async generator, an `AsyncIterable` or an Effect `Stream`. Clients iterate it with `for await`, or through `safe()` to get a failure as a result, which a client from `createSafeClient` does on its own ([Errors without try/catch](../client/errors.md#streamed-outputs-and-subscriptions)). Breaking out of the loop, or aborting `signal`, closes the connection.

```ts twoslash
// ---cut-start---
// @filename: server.ts
import { initTrpc } from '@trpc12/trpc/server';
const t = initTrpc<{ ctx: {} }>();
declare const posts: {
  watch(opts: {
    signal: AbortSignal;
  }): AsyncIterable<{ id: string; title: string }>;
};
// ---cut-end---
const onPost = t.procedure.subscription(async function* (opts) {
  for await (const post of posts.watch({ signal: opts.signal })) {
    yield post;
  }
});
// ---cut-start---
export const router = t.router({ onPost });
// @filename: client.ts
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { router } from './server.ts';
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
// ---cut-end---

for await (const post of client.onPost.subscribe()) {
  console.log(post.title);
  //               ^?
}
```

`.output(Event)` validates each event (the `data` of `tracked()` events); `.output(stream(Event))` does the same, matching [streamed queries](../server/streaming.md).

When the client stops a subscription or its connection closes, `opts.signal` aborts and the generator's `finally` runs. No client hears what the procedure throws after that, so the handler's `onError` gets it, unless it's an `AbortError`: that's how an aborted call ends.

## Resuming

Yield `tracked(id, data)` to give events ids. SSE sends them as `id:`, and on reconnect the resolver gets `lastEventId` in its options (not in its input). An id can't be empty or hold a line break or NUL, which would end the SSE field:

```ts twoslash
// ---cut-start---
// @filename: server.ts
import { initTrpc, tracked } from '@trpc12/trpc/server';
const t = initTrpc<{ ctx: {} }>();
declare const posts: {
  since(
    lastEventId: string | undefined,
  ): AsyncIterable<{ id: string; title: string }>;
};
// ---cut-end---
const onPost = t.procedure.subscription(async function* (opts) {
  for await (const post of posts.since(opts.lastEventId))
    yield tracked(post.id, post);
});
// ---cut-start---
export const router = t.router({ onPost });
// @filename: client.ts
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { router } from './server.ts';
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: '/trpc' })],
});
// ---cut-end---

client.onPost.subscribe(undefined, { lastEventId: '42' }); // resume from a known id
```

`httpLink` reconnects a dropped subscription with backoff (`reconnect: { attempts, delay }`). `wsLink` resends `lastEventId` after reconnecting, and when a draining server asks it to move to a new connection ([Rolling deploys](../client/links/ws.md#rolling-deploys)). A subscription without `tracked()` ids has nothing to resume from, so a reconnect or a move starts it over: the resolver runs again without `lastEventId`. A subscription whose resolver has side effects that must not rerun can opt out with `subscribe(input, { reconnect: false })`; a dropped connection then ends it with `NETWORK_ERROR`.

While a subscription is quiet, the handler sends a `: ping` comment every 15 seconds so proxies don't close it as idle. Set `createFetchHandler({ sse: { pingInterval } })` (`'30 seconds'`, say), or `false` to turn it off.

### Stream lifetime

Each stream starts with a `connected` event. `createFetchHandler({ sse: { maxDuration: '10 minutes' } })` ends each one that long after it starts, for platforms that cap response time; streams last until the subscription ends by default. Before a stream ends, the server sends a `reconnect` event, and `httpLink` moves the subscription to a new stream ([Subscriptions](../client/links/http.md#subscriptions)). The stream then ends without `done`, so an `EventSource` reconnects with `Last-Event-ID` by itself.

#### When the notice is sent

The server sends `reconnect` in three cases. Its data is `{ "drainIn": ms }`, the milliseconds until the server closes the stream:

| Trigger                                                       | When                                                    | `drainIn`                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `sse.maxDuration`                                             | `maxDuration - reconnectNotice` after the stream starts | `reconnectNotice`                                                           |
| `handler.drain({ timeout })`, `dispose()`, `serve()` stopping | at once, to every open stream                           | the drain's `timeout` (`websocket.drainTimeout`, `'10 seconds'` by default) |
| `handler.broadcastReconnect({ drainIn })`                     | at once, to every open stream                           | `drainIn`                                                                   |

`sse.reconnectNotice` is `'5 seconds'` by default, or `maxDuration` when that's shorter. `createFetchHandler` throws for a negative one or one longer than `maxDuration`. `httpLink` opens the new stream when the notice arrives, and leaves the old one once the new one is connected, or at `drainIn` at the latest. A drain ends the stream once its client leaves, or at its timeout. A broadcast doesn't end anything itself. It tells clients the server will be gone in `drainIn` ([Rolling deploys](../adapters/overview.md#rolling-deploys)). WebSocket clients get the same notice from a drain or a broadcast, as a `{ type: 'reconnect', drainIn }` message.

## Reading with `EventSource`

The stream is standard SSE, so a browser `EventSource` (or `curl`) can read a subscription without the client. Input goes in the query string as `httpLink` sends it (`/trpc/onPost?input={"channel":"news"}`, URL-encoded). Each `message` event's `data` is a serialized value, as a query's response body is (`{"json":…}` with the default transformer): for a `tracked()` event, its `{ id, data }`, with the id also in `event.lastEventId`. An `EventSource` reconnects with `Last-Event-ID` by itself, so close it on the `done` event, or it reconnects when the stream ends. Failures arrive as `error` events with `data`:

```ts twoslash
// ---cut-start---
declare function render(data: unknown): void;
// ---cut-end---
const source = new EventSource('/trpc/onPost');
source.onmessage = (event) => render(JSON.parse(event.data).json);
source.addEventListener('done', () => source.close());
```

The [`examples/realtime`](../../../../v12/examples/realtime/client.ts) app reads a room this way, next to `wsLink` clients, and both resume after the server restarts.

## Over WebSockets

`wsLink` runs subscriptions (and everything else) over one WebSocket; `switchLink` can send subscriptions there and the rest over HTTP ([Links](../client/links.md)).
