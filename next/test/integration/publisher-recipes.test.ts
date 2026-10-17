// The recipes in docs/subscriptions.md ("Publisher backends"), kept in sync by hand.
import { PgClient } from '@effect/sql-pg';
import { NodeRedis } from '@effect/platform-node';
import { Effect, Layer, Redacted, Stream } from 'effect';
import type { SqlError } from 'effect/sql/SqlError';
import { Redis } from 'effect/persistence';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  initTrpc,
  Publisher,
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from '@trpc12/trpc/server';
import { createTestServer } from '../../packages/trpc/src/fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

// --- recipe: shared ---------------------------------------------------------

const danson = createSerializer();
const encode = (data: unknown) => JSON.stringify(danson.serialize(data));
const decode = (text: string) => danson.deserialize(JSON.parse(text));

/** Kept events after `lastEventId`, then live ones not already replayed. */
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

// --- recipe: Redis ----------------------------------------------------------

/** Redis stream ids are `<ms>-<seq>`. */
const redisNewer = (a: string, b: string) => {
  const [am = 0, as = 0] = a.split('-').map(Number);
  const [bm = 0, bs = 0] = b.split('-').map(Number);
  return am !== bm ? am > bm : as > bs;
};

/** Each channel is a Redis stream (history and ids) plus a pub/sub channel (live). */
const redisPublisher = <TEvents extends PublisherEvents>(opts: {
  prefix: string;
  maxLen?: number;
}) =>
  Effect.gen(function* () {
    const redis = yield* Redis.Redis;
    const key = (channel: string) => `${opts.prefix}:${channel}`;
    return {
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
            // Subscribe before reading history, so nothing falls in between.
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
    } as PublisherShape<TEvents>;
  });

// --- recipe: Postgres -------------------------------------------------------

/*
 * create table trpc_events (
 *   id bigserial primary key,
 *   channel text not null,
 *   payload text not null,
 *   created_at timestamptz not null default now()
 * );
 */
const pgPublisher = <TEvents extends PublisherEvents>() =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    return {
      publish: (channel: string, data: unknown) =>
        Effect.gen(function* () {
          const payload = encode(data);
          const [row] = yield* sql<{ id: string }>`
            insert into trpc_events (channel, payload)
            values (${channel}, ${payload})
            returning id::text`;
          // NOTIFY payloads are capped at 8000 bytes; send the id and read
          // the row instead if events can be bigger.
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
                where channel = ${channel} and id > ${o?.lastEventId ?? '0'}
                order by id`.pipe(
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
    } as PublisherShape<TEvents>;
  });

// --- tests ------------------------------------------------------------------

interface Post {
  id: string;
  at: Date;
}
class Posts extends Publisher.Service<Posts, { created: Post }>()('Posts') {}

/** Just enough of XADD, XRANGE and PUBLISH. */
const fakeRedis = Layer.effect(Redis.Redis)(
  Effect.gen(function* () {
    const streams = new Map<string, [string, [string, string]][]>();
    const listeners = new Map<string, Set<(m: Redis.RedisMessage) => void>>();
    let ms = 1;
    return yield* Redis.make({
      send: <A>(command: string, ...args: ReadonlyArray<string>) =>
        Effect.sync(() => {
          const [key = ''] = args;
          const list = streams.get(key) ?? [];
          streams.set(key, list);
          if (command === 'XADD') {
            const id = `${ms++}-0`;
            list.push([id, ['data', args.at(-1)!]]);
            return id as A;
          }
          if (command === 'XRANGE') {
            const after = args[1]!.slice(1);
            return list.filter(([id]) => redisNewer(id, after)) as A;
          }
          if (command === 'PUBLISH') {
            for (const l of listeners.get(key) ?? []) {
              l({ channel: key, message: args[1]! });
            }
            return 1 as A;
          }
          throw new Error(`fake redis: ${command}`);
        }),
      subscribe: (channel, onMessage) =>
        Effect.gen(function* () {
          const set = listeners.get(channel) ?? new Set();
          listeners.set(channel, set);
          set.add(onMessage);
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => set.delete(onMessage)),
          );
          return Effect.never;
        }),
    });
  }),
);

test('the Redis publisher recipe delivers live events and resumes from lastEventId', async () => {
  const t = initTrpc();
  const router = {
    create: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation((opts) =>
        Posts.publish('created', { id: opts.input.id, at: new Date(0) }),
      ),
    onCreated: t.procedure.subscription((opts) =>
      Posts.subscribe('created', { lastEventId: opts.lastEventId }),
    ),
  };
  const layer = Layer.effect(Posts)(
    redisPublisher<{ created: Post }>({ prefix: 'posts' }),
  ).pipe(Layer.provide(fakeRedis));
  await using server = await createTestServer({
    router,
    layer,
    serializer: danson,
  });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, serializer: danson })],
  });

  const first = await client.create.mutate({ id: 'a' });
  await client.create.mutate({ id: 'b' });

  const seen: { id: string; data: Post }[] = [];
  const done = (async () => {
    for await (const event of client.onCreated.subscribe(undefined, {
      lastEventId: first,
    })) {
      seen.push(event);
      if (seen.length === 2) break;
    }
  })();
  await expect.poll(() => seen.length).toBe(1);
  await client.create.mutate({ id: 'c' });
  await done;
  expect(seen.map((e) => [e.id, e.data.id])).toEqual([
    ['2-0', 'b'],
    ['3-0', 'c'],
  ]);
  expect(seen[0]!.data.at).toBeInstanceOf(Date);
});

test('the Postgres publisher recipe types as a Posts layer that needs a PgClient', () => {
  const layer = Layer.effect(Posts)(pgPublisher<{ created: Post }>());
  expectTypeOf(layer).toEqualTypeOf<
    Layer.Layer<Posts, never, PgClient.PgClient>
  >();
  const live = layer.pipe(
    Layer.provide(
      PgClient.layer({ url: Redacted.make('postgres://localhost') }),
    ),
  );
  expectTypeOf(live).toEqualTypeOf<Layer.Layer<Posts, SqlError>>();
  const redis = Layer.effect(Posts)(
    redisPublisher<{ created: Post }>({ prefix: 'posts' }),
  ).pipe(Layer.provide(NodeRedis.layer({ url: 'redis://localhost' })));
  expectTypeOf(redis).toEqualTypeOf<Layer.Layer<Posts, Redis.RedisError>>();
});
