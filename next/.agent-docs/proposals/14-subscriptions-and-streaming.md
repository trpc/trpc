# 14 — Subscriptions and streaming

| Status     | Area                     | Depends on     | oRPC parity rows                                                                                      |
| ---------- | ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------- |
| `proposed` | server, client, protocol | 02, 04, 10, 11 | End-to-end typesafe streaming, Streaming response (SSE), WebSockets, Cloudflare WebSocket hibernation |

## Summary

Decide how procedures stream values, how subscriptions resume, how clients consume streams, and what is deliberately dropped.

**Recommendation:**

- Async iterables (and Effect `Stream`) everywhere; no observables.
- Keep `tracked()`, and move `lastEventId` into the resolver options.
- SSE over fetch streaming instead of `EventSource`.
- Clients consume async iterables.
- Nested deferred values are kept if the danSON-based serializer is adopted (11).

## Today (v11)

- **Subscriptions:**
  - `async function*` resolvers. Observable resolvers are deprecated.
  - `tracked(id, data)` with `lastEventId` merged into the **input**, so the input schema must include it.
  - Transported over SSE (`httpSubscriptionLink` using `EventSource` with an optional polyfill for headers) or `wsLink`.
- **Streaming queries/mutations:** `httpBatchStreamLink` streams async iterables _and nested promises_ inside outputs (JSONL with chunk references).
- **Client:** `.subscribe(input, { onData, onError, onStarted, onComplete, onConnectionStateChange, onStopped })` returns an `Unsubscribable`.
- **SSE config:** `ping`, `maxDurationMs`, reconnect-after-inactivity, set in `initTRPC.create({ sse })`.

## Goals

- One streaming model on the server, `AsyncIterable<T>` or `Stream<T, E, R>`, used for subscriptions and streamed outputs.
- Typed events, typed stream errors (07) and validated items.
- Resumable subscriptions without polluting inputs.
- Works over SSE, JSONL, WebSocket and MessagePort, and is designed for hibernation.

## Decision areas

### (a) Server

```ts
const onPost = t.procedure
  .input(z.object({ channel: z.string() }))
  .output(Post) // for subscriptions, validates each event (see (c))
  .subscription(async function* ({ input, signal, lastEventId }) {
    for await (const post of posts.listen(input.channel, {
      since: lastEventId,
      signal,
    })) {
      yield tracked(post.id, post);
    }
  });

// Effect
const ticks = t.procedure.subscription(() =>
  Stream.tick('1 second').pipe(Stream.map(() => Date.now())),
);
```

- `lastEventId` is a **resolver option**, not part of the input.
- `signal` aborts on client disconnect. Effect streams are interrupted.
- Keepalive and limits (`ping`, `maxDurationMs`) move to the handler or a plugin (12, 13).

### (b) Client

```ts
const sub = client.onPost.subscribe({ channel: 'general' }, { signal, lastEventId });
for await (const post of sub) render(post);

// callbacks as a helper
consume(client.onPost.subscribe({ channel }), { onData, onError, onComplete });
```

- The primary API is `AsyncIterable` (with `return()` to stop). A callback helper is provided for UI code.
- Connection state (`connecting` / `pending` / `error`) is exposed through link events or a `state` property on the iterable (**open**).

  ```ts
  // state property on the iterable
  const sub = client.onPost.subscribe({ channel });
  sub.state; // { state: 'connecting', error } | { state: 'pending', error: null } (v11's TRPCConnectionState)

  // link events, surfaced as a callback like v11's onConnectionStateChange
  consume(sub, {
    onData,
    onConnectionStateChange: ({ state }) => setStatus(state),
  });
  ```

- Reconnection with `lastEventId` happens automatically for `tracked()` events, using an Effect `Schedule` for backoff.

### (c) Validation of streamed items

- **Subscriptions:** `.output(schema)` validates _each_ event.
- **Streamed queries and mutations:** use an explicit `stream(schema)` helper (`.output(stream(Post))`), or oRPC's `eventIterator(yieldSchema, returnSchema)`.
- **Open:** a single rule for both kinds (always via `stream()`).

```ts
import { stream } from 'trpcdev/server';

// per kind: .output() validates each subscription event
const onPost = t.procedure.output(Post).subscription(async function* () { … });

// per kind: a streamed query needs stream()
const feed = t.procedure.output(stream(Post)).query(async function* () {
  yield* db.post.cursor();
});

// oRPC-style alternative to stream(): event schema plus return schema
const chat = t.procedure.output(eventIterator(Token, Summary)).mutation(async function* () { … });

// single rule: always stream(), subscriptions included
const onPost = t.procedure.output(stream(Post)).subscription(async function* () { … });
```

### (d) Transport

- SSE is read with `fetch` streaming, **not** `EventSource`. Headers, POST bodies and abort work natively, so no polyfill is needed.

  ```ts
  // v11: headers on subscriptions need an EventSource polyfill
  httpSubscriptionLink({
    url,
    EventSource: EventSourcePolyfill,
    eventSourceOptions: async () => ({ headers }),
  });

  // vNext: the same httpLink as queries; SSE over fetch sends headers natively
  httpLink({
    url,
    headers: async () => ({ authorization: `Bearer ${await getToken()}` }),
  });
  ```

- The stream format is negotiated per request (10). WebSocket and MessagePort use the shared message model.
- Backpressure: iterables are pull-based on the server. SSE writes respect the platform's stream backpressure.

### (e) Nested deferred values

- v11 can stream `{ fast: 1, slow: Promise<…>, items: AsyncIterable<…> }` (JSONL with chunk references, `stream/jsonl.ts`).
- Options:
  - **D-A** Keep: the serializer supports promises and iterables at any path.
  - **D-B** Root-level iterables only in v1; nested deferral later.
  - **D-C** Drop.

  ```ts
  // D-A: deferred values at any depth
  const dashboard = t.procedure.query(async () => ({
    user: await getUser(), // sent in the first chunk
    stats: getStats(), // Promise<Stats>, streamed when it resolves
    activity: activityFeed(), // AsyncIterable<Activity>, streamed
  }));
  const { user, stats, activity } = await client.dashboard.query();
  for await (const item of activity) render(item);

  // D-B (v1) and D-C: only the root value may stream; slow parts become their own procedures
  const dashboard = t.procedure.query(async () => ({ user: await getUser() }));
  const stats = t.procedure.query(() => getStats());
  const activity = t.procedure.query(async function* () {
    yield* activityFeed();
  });
  ```

- oRPC supports root-level event iterators only.
- If 11 adopts danSON, **D-A comes almost for free**. danSON streams `Promise`, `AsyncIterable` and `ReadableStream` values at any depth, which is what v11's JSONL codec does today with a separate implementation. The remaining cost is in types (nested `Promise<…>` in outputs) and in integrations (what TanStack Query does with a nested promise).

### (f) Publishing events

- Effect users have `PubSub` and `Stream.fromPubSub`. Document these.
- For Promise users, a small `createPublisher<Events>()` (memory, with optional resume buffer) can be provided. Redis and Durable Object publishers come later, as in oRPC's publisher helpers.

```ts
// Promise users: method names follow oRPC's MemoryPublisher
const publisher = createPublisher<{ 'post.created': Post }>();

const onPost = t.procedure.subscription(async function* ({
  signal,
  lastEventId,
}) {
  for await (const post of publisher.subscribe('post.created', {
    signal,
    lastEventId,
  })) {
    yield tracked(post.id, post);
  }
});
const create = t.procedure.input(NewPost).mutation(async ({ input }) => {
  const post = await db.post.create(input);
  await publisher.publish('post.created', post);
  return post;
});

// Effect users: PubSub as a service
class PostEvents extends Context.Service<PostEvents, PubSub.PubSub<Post>>()(
  'PostEvents',
) {}

const onPostEffect = t.procedure.subscription(() =>
  Stream.unwrap(Effect.map(PostEvents, Stream.fromPubSub)),
);
// elsewhere: yield* PubSub.publish(yield* PostEvents, post)
```

### (g) Cloudflare hibernation

The WebSocket message model (10) lets a hibernated Durable Object rebuild subscription routing from socket attachments. The full integration (oRPC's "durable iterator") is **later**, but nothing in v1 may keep subscription state _only_ in process memory without an abstraction for it.

## Recommendation

- (a) and (b) as above, with callbacks as a helper.
- `.output()` validates subscription events; `stream()` is used for streamed queries.
- Fetch-based SSE.
- **D-A** if 11 adopts danSON; otherwise **D-B** (root-level only in v1).
- A memory publisher, with Effect `PubSub` documented.
- Hibernation-ready design, with the implementation later.

## Questions for Alex

- **Q14.1** Client subscriptions: `AsyncIterable` first (recommended), or keep callbacks as the primary API?
- **Q14.2** Move `lastEventId` from the input to resolver options?
- **Q14.3** Stream item validation: `.output()` per event for subscriptions + `stream()` for queries, or always `stream()`?
- **Q14.4** Nested deferred values: keep (D-A), later (D-B) or drop (D-C)?
- **Q14.5** Drop `EventSource` in favour of fetch-streamed SSE?
- **Q14.6** Ship a `createPublisher()` helper in v1?
- **Q14.7** Cloudflare hibernation in v1 or later?

## Decision

- **Q14.1:** [x] AsyncIterable first, plus an Effect-native `Stream` · [ ] callbacks first → [client](../decisions/client.md)
- **Q14.2:** [x] yes · [ ] no → [subscriptions](../decisions/subscriptions.md)
- **Q14.3:** [ ] per-kind · [ ] always `stream()`
- **Q14.4:** [ ] D-A · [ ] D-B · [ ] D-C
- **Q14.5:** [x] yes · [ ] no (follow the SSE standard) → [fetch-sse](../decisions/fetch-sse.md)
- **Q14.6:** [x] yes, as an Effect service (memory layer on `PubSub`) · [ ] no → [subscriptions](../decisions/subscriptions.md)
- **Q14.7:** [ ] v1 · [ ] later
- **Notes:**
