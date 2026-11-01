# Subscriptions resume with `lastEventId`; the publisher is an Effect service (human)

- Human, 2026-10-15 (Q14.2): "Yes". `tracked(id, data)` events set the SSE `id:`, and the resolver gets `lastEventId` in its options, not in its input, so reconnects resume (SSE's `Last-Event-ID`, `wsLink`'s resend).
- Human, 2026-10-15 (Q14.6): "Build something thay works great with effect and their integrations, it doesn't have to satisfy non effect people". The publisher is an Effect service provided as a layer: an in-memory layer on `PubSub` with an optional resume buffer, and other backends by swapping the layer. No Promise wrapper.

  ```ts twoslash
  // ---cut-start---
  import {
    createFetchHandler,
    experimental_Publisher,
  } from '@trpc12/trpc/server';
  import { Effect } from 'effect';
  import { z } from 'zod';
  import { db, t, type Post } from './server.ts';
  // ---cut-end---
  class Posts extends experimental_Publisher.Service<
    Posts,
    { created: Post }
  >()('Posts') {}

  const router = t.router({
    create: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const post = db.post.create(opts.input.title);
          yield* Posts.publish('created', post);
          return post;
        }),
      ),
    onPost: t.procedure.subscription(({ lastEventId }) =>
      Posts.subscribe('created', { lastEventId }),
    ),
  });
  createFetchHandler({
    router,
    createContext: () => ({ user: null }),
    layer: Posts.memory({ buffer: 100 }),
  });
  ```

- (agent) The key is declared like Effect's own `Context.Service<Self, Shape>()(key)`, so it is yieldable and `Layer.succeed(Posts, …)` swaps in another backend. `subscribe` yields `tracked()` envelopes with the publisher's ids; the memory layer keeps `buffer` events per channel and de-duplicates the replay against live events.
- Lost: keeping the last event id in the input (v11), which mixes transport state into the schema; oRPC's Promise-facing `MemoryPublisher`.
- Human, 2026-10-19, on a graceful drain for rolling deploys (v11 issues #4734, #7608), option A, a `reconnect` server message: "A) sounds good... but subscriptions are gracefully "ported" to the new connection right?"
  - (agent) Built: `handler.drain({ timeout })` sends `{ type: 'reconnect' }` to each WebSocket and socket client and waits for the client to close that connection. At the timeout (`websocket.drainTimeout`, 10 seconds) it closes what's left with 1012 and interrupts those calls. During a drain, and under `serve()` until the server has stopped, upgrades get a 503 (sockets handed to `handler.websocket` are closed with 1012), so a client's dial fails before it opens and it backs off to another server. Accepting and then closing them made `wsLink` open a connection to the server it was leaving. A `MessagePort` drains by waiting for its calls, then closing.
  - (agent) It's Effect-native: releasing `serve()`'s layer drains before the server stops (Node's `server.close()` otherwise waits 20 s on open WebSockets), and `dispose()` drains for good before it releases the handler's layer. `toHttpEffect` and `HttpRouter.serve(handler.routes)` users add the drain finalizer themselves.
  - (agent) On `reconnect`, `wsLink` sends new calls on a new connection and closes the old one once the queries and mutations sent on it settle. It never resends anything already sent, so in-flight calls finish where they started and a mutation runs once. Each subscription is ported: it's aborted on the old connection, its messages still arriving there are dropped, and it subscribes on the new one with the `lastEventId` of the last event it handled, so it has no gap and no duplicate.
  - (agent) A subscription without `tracked()` ids has nothing to resume from, so it restarts on the new connection (the resolver runs again without `lastEventId`). One made with `{ reconnect: false }` stays on the old connection and ends with `NETWORK_ERROR` when the server closes it.
  - (agent) Cloudflare's hibernating sockets don't drain: a deploy gives the Durable Object no hook to run one.
- Lost: v11's handling, where the client answers `reconnect` by closing the connection. That errors the in-flight queries and mutations, and only subscriptions are resent on the new connection. The in-flight calls fail; mutations aren't run twice, but the client can't tell whether a failed one ran. Also lost: no message at all (the earlier agent call), where a shutdown closes the sockets and in-flight calls fail with `NETWORK_ERROR`.
- Q14.7 is answered in [`cloudflare-hibernation.md`](./cloudflare-hibernation.md); backends are guides, in [`publisher-backends.md`](./publisher-backends.md).
- Lives in: `packages/trpc/src/server/subscriptions/tracked.ts`, `src/server/subscriptions/publisher.ts`; the drain in `src/server/sockets/drain.ts`, `src/server/sockets/socket.ts` (`connectionReceiver`), `src/server/handler/fetch.ts` (`drain`, `dispose`), `src/server/handler/routes.ts` (the 503), `src/http/index.ts` (`serve`) and `src/client/links/socket.ts` (`retire`).
