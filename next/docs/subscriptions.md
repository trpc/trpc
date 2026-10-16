# Subscriptions

A subscription returns an async generator, an `AsyncIterable` or an Effect `Stream`. Clients iterate it with `for await`. Breaking out of the loop, or aborting `signal`, closes the connection.

```ts
const onPost = t.procedure.subscription(async function* ({ signal }) {
  for await (const post of posts.watch({ signal })) yield post;
});

for await (const post of client.onPost.subscribe()) render(post);
```

`.output(Event)` validates each event (the `data` of `tracked()` events); `.output(stream(Event))` does the same, matching streamed queries.

## Resuming

Yield `tracked(id, data)` to give events ids. SSE sends them as `id:`, and on reconnect the resolver gets `lastEventId` in its options (not in its input):

```ts
const onPost = t.procedure.subscription(async function* ({ lastEventId }) {
  for await (const post of posts.since(lastEventId))
    yield tracked(post.id, post);
});

client.onPost.subscribe(undefined, { lastEventId: '42' }); // resume from a known id
```

`httpLink` reconnects a dropped subscription with backoff (`reconnect: { attempts, delayMs }`). `wsLink` resends `lastEventId` after reconnecting. A subscription whose resolver has side effects that must not rerun can opt out with `subscribe(input, { reconnect: false })`; a dropped connection then ends it with `NETWORK_ERROR`.

While a subscription is quiet, the handler sends a `: ping` comment every 15 seconds so proxies don't close it as idle. Set `createFetchHandler({ sse: { pingMs } })`, or `false` to turn it off.

The stream is standard SSE, so a browser `EventSource` (or `curl`) can read a subscription without the client. Input goes in the query string in the form `httpLink` sends (`/trpc/onPost?channel=news`). Each `message` event's `data` is a serialized value. An `EventSource` reconnects with `Last-Event-ID` by itself, so close it on the `done` event, or it reconnects when the stream ends. Failures arrive as `error` events with `data`:

```ts
const source = new EventSource('/trpc/onPost');
source.onmessage = (event) => render(JSON.parse(event.data));
source.addEventListener('done', () => source.close());
```

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

`subscribe()` yields `tracked()` events with the publisher's ids, so reconnects resume. `Posts.memory({ buffer })` serves one process on a `PubSub` and keeps `buffer` events per channel for resumes. For several processes, provide another layer with the same shape (`publish`, `subscribe`), built on the clients Effect already ships.

## Publisher backends

No backend packages ship; these recipes are yours to copy and adapt. Both serialize events with danSON (so `Date`s survive) and share one helper that replays kept events after `lastEventId`, then follows live ones:

```ts
import { Effect, Layer, Stream } from 'effect';
import { defaultSerializer } from 'trpcdev/serializer';
import {
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from 'trpcdev/server';

const encode = (data: unknown) =>
  JSON.stringify(defaultSerializer.serialize(data));
const decode = (text: string) =>
  defaultSerializer.deserialize(JSON.parse(text));

const resume = <TId>(opts: {
  live: Stream.Stream<[TId, string]>;
  replay: Effect.Effect<[TId, string][]>;
  after: TId | undefined;
  newer: (a: TId, b: TId) => boolean;
  key: (id: TId) => string;
}) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const replay = opts.after === undefined ? [] : yield* opts.replay;
      const seen = replay.at(-1)?.[0] ?? opts.after;
      const live = opts.live.pipe(
        Stream.filter(([id]) => seen === undefined || opts.newer(id, seen)),
      );
      return Stream.concat(Stream.fromIterable(replay), live).pipe(
        Stream.map(([id, payload]) => tracked(opts.key(id), decode(payload))),
      );
    }),
  );
```

### Redis

Effect's `Redis` service (`effect/persistence`) with `NodeRedis.layer` from `@effect/platform-node`. Each channel is a Redis stream, which keeps history and assigns ids, plus a pub/sub channel for live delivery. Subscribing before reading history means no event falls in between.

```ts
import { NodeRedis } from '@effect/platform-node';
import { Redis } from 'effect/persistence';

const redisNewer = (a: string, b: string) => {
  const [am = 0, as = 0] = a.split('-').map(Number);
  const [bm = 0, bs = 0] = b.split('-').map(Number);
  return am !== bm ? am > bm : as > bs;
};

const redisPublisher = <TEvents extends PublisherEvents>(opts: {
  prefix: string;
  maxLen?: number;
}) =>
  Effect.gen(function* () {
    const redis = yield* Redis.Redis;
    const key = (channel: string) => `${opts.prefix}:${channel}`;
    const shape = {
      publish: (channel: string, data: unknown) =>
        Effect.gen(function* () {
          const payload = encode(data);
          const id = yield* redis.send<string>(
            'XADD',
            key(channel),
            'MAXLEN',
            '~',
            String(opts.maxLen ?? 1000),
            '*',
            'data',
            payload,
          );
          yield* redis.send(
            'PUBLISH',
            key(channel),
            JSON.stringify([id, payload]),
          );
          return id;
        }).pipe(Effect.orDie),
      subscribe: (
        channel: string,
        o?: { readonly lastEventId?: string | undefined },
      ) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const messages = yield* redis.subscribe(key(channel));
            return resume({
              live: Stream.fromQueue(messages).pipe(
                Stream.map((m) => JSON.parse(m.message) as [string, string]),
                Stream.orDie,
              ),
              replay: redis
                .send<[string, [string, string]][]>(
                  'XRANGE',
                  key(channel),
                  `(${o?.lastEventId}`,
                  '+',
                )
                .pipe(
                  Effect.map((entries) =>
                    entries.map(([id, [, payload]]): [string, string] => [
                      id,
                      payload,
                    ]),
                  ),
                  Effect.orDie,
                ),
              after: o?.lastEventId,
              newer: redisNewer,
              key: (id) => id,
            });
          }),
        ),
    };
    return shape as PublisherShape<TEvents>;
  });

const layer = Layer.effect(Posts)(
  redisPublisher<PostEvents>({ prefix: 'posts' }),
).pipe(Layer.provide(NodeRedis.layer({ url: process.env.REDIS_URL })));
```

### Postgres

`@effect/sql-pg`'s `PgClient` has `listen` and `notify`. Events go into a table for history; `NOTIFY` carries new ones. `NOTIFY` payloads are capped at 8000 bytes, so for bigger events send only the id and read the row.

```ts
import { PgClient } from '@effect/sql-pg';
import { Redacted } from 'effect';

// create table trpc_events (id bigserial primary key, channel text not null,
//   payload text not null, created_at timestamptz not null default now());

const pgPublisher = <TEvents extends PublisherEvents>() =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    const shape = {
      publish: (channel: string, data: unknown) =>
        Effect.gen(function* () {
          const payload = encode(data);
          const [row] = yield* sql<{ id: string }>`
            insert into trpc_events (channel, payload) values (${channel}, ${payload})
            returning id::text`;
          yield* sql.notify(channel, JSON.stringify([row!.id, payload]));
          return row!.id;
        }).pipe(Effect.orDie),
      subscribe: (
        channel: string,
        o?: { readonly lastEventId?: string | undefined },
      ) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const notifications = yield* sql.listen(channel);
            return resume({
              live: Stream.fromQueue(notifications).pipe(
                Stream.map((n) => {
                  const [id, payload] = JSON.parse(n.payload) as [
                    string,
                    string,
                  ];
                  return [BigInt(id), payload] as [bigint, string];
                }),
                Stream.orDie,
              ),
              replay: sql<{ id: string; payload: string }>`
                select id::text, payload from trpc_events
                where channel = ${channel} and id > ${o?.lastEventId ?? '0'} order by id`.pipe(
                Effect.map((rows) =>
                  rows.map((r): [bigint, string] => [BigInt(r.id), r.payload]),
                ),
                Effect.orDie,
              ),
              after:
                o?.lastEventId === undefined
                  ? undefined
                  : BigInt(o.lastEventId),
              newer: (a, b) => a > b,
              key: String,
            });
          }).pipe(Effect.orDie),
        ),
    };
    return shape as PublisherShape<TEvents>;
  });

const layer = Layer.effect(Posts)(pgPublisher<PostEvents>()).pipe(
  Layer.provide(
    PgClient.layer({ url: Redacted.make(process.env.DATABASE_URL!) }),
  ),
);
```

### Cloudflare Durable Objects

A Durable Object is one process that every request for its name reaches, so `Posts.memory()` is enough inside it. Route the endpoint to the object and serve the router there:

```ts
import { DurableObject } from 'cloudflare:workers';

export class PostsRoom extends DurableObject {
  handler = createFetchHandler({
    router,
    layer: Posts.memory({ buffer: 100 }),
  });
  fetch(request: Request) {
    return this.handler.fetch(request);
  }
}

export default {
  fetch: (request: Request, env: Env) =>
    env.POSTS_ROOM.getByName('posts').fetch(request),
} satisfies ExportedHandler<Env>;
```

Open SSE streams keep the object in memory; kept events are lost when it's evicted. To let it sleep between events, serve WebSockets with the [hibernation adapter](./platforms.md#cloudflare-durable-objects) and provide `hibernatingPublisher(Posts, { state: this.ctx })` from `trpcdev/cloudflare` instead of `Posts.memory()` ([subscriptions that hibernate](./platforms.md#subscriptions-that-hibernate)).
