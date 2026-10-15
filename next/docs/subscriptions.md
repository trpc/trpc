# Subscriptions

A subscription returns an async generator, an `AsyncIterable` or an Effect `Stream`. Clients iterate it with `for await`. Breaking out of the loop, or aborting `signal`, closes the connection.

```ts
const onPost = t.procedure.subscription(async function* ({ signal }) {
  for await (const post of posts.watch({ signal })) yield post;
});

for await (const post of client.onPost.subscribe()) render(post);
```

## Resuming

Yield `tracked(id, data)` to give events ids. SSE sends them as `id:`, and on reconnect the resolver gets `lastEventId` in its options (not in its input):

```ts
const onPost = t.procedure.subscription(async function* ({ lastEventId }) {
  for await (const post of posts.since(lastEventId))
    yield tracked(post.id, post);
});

client.onPost.subscribe(undefined, { lastEventId: '42' }); // resume from a known id
```

`httpLink` reconnects a dropped subscription with backoff (`reconnect: { attempts, delayMs }`). `wsLink` resends `lastEventId` after reconnecting.

While a subscription is quiet, the handler sends a `: ping` comment every 15 seconds so proxies don't close it as idle. Set `createFetchHandler({ sse: { pingMs } })`, or `false` to turn it off.

## Publisher

`Publisher` is typed publish/subscribe as an Effect service. Declare a key with its channels, then provide a layer:

```ts
import { Publisher } from 'trpcdev/server';

class Posts extends Publisher.Service<
  Posts,
  { created: Post; deleted: { id: string } }
>()('Posts') {}

const router = {
  create: t.procedure.input(PostInput).mutation(({ input }) =>
    Effect.gen(function* () {
      const post = yield* savePost(input);
      yield* Posts.publish('created', post);
      return post;
    }),
  ),
  onCreated: t.procedure.subscription(({ lastEventId }) =>
    Posts.subscribe('created', { lastEventId }),
  ),
};

createFetchHandler({ router, layer: Posts.memory({ buffer: 100 }) });
```

`subscribe()` yields `tracked()` events with the publisher's ids, so reconnects resume. `Posts.memory({ buffer })` serves one process on a `PubSub` and keeps `buffer` events per channel for resumes. For several processes, provide another layer with the same shape (`publish`, `subscribe`), for example with `Layer.succeed(Posts, { … })` over Redis or Postgres `LISTEN`.
