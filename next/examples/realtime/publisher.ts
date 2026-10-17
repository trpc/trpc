/**
 * A Redis-backed publisher: the recipe from docs/subscriptions.md
 * ("Publisher backends"). Each channel is a Redis stream (history and ids)
 * plus a pub/sub channel (live events), so every server sharing the Redis
 * sees every event, and `lastEventId` resumes from the stream.
 */
import { createSerializer } from '@trpc12/trpc/serializer';
import {
  tracked,
  type PublisherEvents,
  type PublisherShape,
} from '@trpc12/trpc/server';
import { Effect, Stream } from 'effect';
import { Redis } from 'effect/persistence';

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
