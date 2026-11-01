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

The [`examples/realtime`](../../../examples/realtime/client.ts) app reads a room this way, next to `wsLink` clients, and both resume after the server restarts.

## Over WebSockets

`wsLink` runs subscriptions (and everything else) over one WebSocket; `switchLink` can send subscriptions there and the rest over HTTP ([Links](../client/links.md)).
