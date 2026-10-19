---
title: Publisher backends
description: Recipes for a Publisher on Redis streams and Postgres LISTEN/NOTIFY.
section: Subscriptions
parent: subscriptions/publisher
order: 1
experiment: publisher
---

No backend packages ship; these recipes are yours to copy and adapt ([`examples/realtime`](../../examples/realtime/publisher.ts) runs both, across servers). Both serialize events with danSON (so `Date`s survive) and share one helper that replays kept events after `lastEventId`, then follows live ones:

```ts twoslash
import { Effect, Layer, Stream } from 'effect';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from '@trpc12/trpc/server';

const danson = createSerializer();
const encode = (data: unknown) => JSON.stringify(danson.serialize(data));
const decode = (text: string) => danson.deserialize(JSON.parse(text));

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

## Redis

Effect's `Redis` service (`effect/persistence`) with `NodeRedis.layer` from `@effect/platform-node`. Each channel is a Redis stream, which keeps history and assigns ids, plus a pub/sub channel for live delivery. Subscribing before reading history means no event falls in between.

```ts twoslash
// ---cut-start---
import { Effect, Layer, Stream } from 'effect';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from '@trpc12/trpc/server';

const danson = createSerializer();
const encode = (data: unknown) => JSON.stringify(danson.serialize(data));
const decode = (text: string) => danson.deserialize(JSON.parse(text));

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
import { experimental_Publisher } from '@trpc12/trpc/server';
import type { Post } from './server.ts';
type PostEvents = { created: Post; deleted: { id: string } };
class Posts extends experimental_Publisher.Service<Posts, PostEvents>()(
  'Posts',
) {}
// ---cut-end---
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

## Postgres

`@effect/sql-pg`'s `PgClient` has `listen` and `notify`. Events go into a table for history; `NOTIFY` carries new ones. `NOTIFY` payloads are capped at 8000 bytes, so for bigger events send only the id and read the row.

```ts twoslash
// ---cut-start---
import { Effect, Layer, Stream } from 'effect';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from '@trpc12/trpc/server';

const danson = createSerializer();
const encode = (data: unknown) => JSON.stringify(danson.serialize(data));
const decode = (text: string) => danson.deserialize(JSON.parse(text));

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
import { experimental_Publisher } from '@trpc12/trpc/server';
import type { Post } from './server.ts';
type PostEvents = { created: Post; deleted: { id: string } };
class Posts extends experimental_Publisher.Service<Posts, PostEvents>()(
  'Posts',
) {}
// ---cut-end---
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

## Credits

These backends follow the adapters of [oRPC's publisher](https://orpc.dev/docs/helpers/publisher).
