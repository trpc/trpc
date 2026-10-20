/**
 * The Redis and Postgres publishers: the recipes from
 * https://v12.trpc.io/v12/docs/subscriptions/backends ("Publisher backends"). Every server
 * sharing the Redis or the database sees every event, and `lastEventId`
 * resumes from the backend's history.
 */
import { PgClient } from '@effect/sql-pg';
import { Effect, Stream } from 'effect';
import { Redis } from 'effect/persistence';
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from '@trpc12/trpc/server';

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
export const redisPublisher = <TEvents extends PublisherEvents>(opts: {
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

/**
 * The table `pgPublisher` keeps history in; ids order the events. Servers
 * starting together take turns: `if not exists` alone races on a new
 * database.
 */
export const createEventsTable = Effect.gen(function* () {
  const sql = yield* PgClient.PgClient;
  yield* sql.withTransaction(
    Effect.andThen(
      sql`select pg_advisory_xact_lock(hashtext('trpc_events'))`,
      sql`create table if not exists trpc_events (id bigserial primary key,
        channel text not null, payload text not null,
        created_at timestamptz not null default now())`,
    ),
  );
});

/**
 * Each event is a row (history and ids), and `NOTIFY` on the channel carries
 * new ones. `NOTIFY` payloads are capped at 8000 bytes; for bigger events,
 * send only the id and read the row.
 */
export const pgPublisher = <TEvents extends PublisherEvents>() =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    return {
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
            // `listen` returns once Postgres confirms `LISTEN`, so reading
            // history after it misses nothing.
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
    } as PublisherShape<TEvents>;
  });
