# Subscriptions resume with `lastEventId`; the publisher is an Effect service (human)

- Human, 2026-10-15 (Q14.2): "Yes". `tracked(id, data)` events set the SSE `id:`, and the resolver gets `lastEventId` in its options, not in its input, so reconnects resume (SSE's `Last-Event-ID`, `wsLink`'s resend).
- Human, 2026-10-15 (Q14.6): "Build something thay works great with effect and their integrations, it doesn't have to satisfy non effect people". The publisher is an Effect service provided as a layer: an in-memory layer on `PubSub` with an optional resume buffer, and other backends by swapping the layer. No Promise wrapper.

  ```ts
  class Posts extends Publisher.Service<Posts, { created: Post }>()('Posts') {}
  yield * Posts.publish('created', post); // in a mutation's Effect
  const onPost = t.procedure.subscription(({ lastEventId }) =>
    Posts.subscribe('created', { lastEventId }),
  );
  createFetchHandler({ router, layer: Posts.memory({ buffer: 100 }) });
  ```

- (agent) The key is declared like Effect's own `Context.Service<Self, Shape>()(key)`, so it is yieldable and `Layer.succeed(Posts, …)` swaps in another backend. `subscribe` yields `tracked()` envelopes with the publisher's ids; the memory layer keeps `buffer` events per channel and de-duplicates the replay against live events.
- Lost: keeping the last event id in the input (v11), which mixes transport state into the schema; oRPC's Promise-facing `MemoryPublisher`.
- (agent) There is no server-sent "reconnect" message (v11's `broadcastReconnectNotification`, asked for on Fastify in v11 issue #4734). A server that shuts down closes its sockets, and `wsLink` resends subscriptions with their `lastEventId` on a new connection, so subscriptions survive a deploy. Queries and mutations in flight on that socket fail with `NETWORK_ERROR`.
- Open (human): add a graceful drain for rolling deploys? For example a `reconnect` server message that makes `wsLink` open a new connection for new calls and close the old one once its in-flight calls settle, sent by `handler.dispose()` or a `handler.drain()`. v11's client answers the message by closing, reopening and resending its pending requests.
- Q14.7 is answered in [`cloudflare-hibernation.md`](./cloudflare-hibernation.md); backends are guides, in [`publisher-backends.md`](./publisher-backends.md).
- Lives in: `packages/trpc/src/server/subscriptions/tracked.ts`, `src/server/subscriptions/publisher.ts`.
