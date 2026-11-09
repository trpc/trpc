/**
 * Spike (decision durable-calls): resuming a durable call's streamed output
 * mid-stream, on any instance.
 *
 * The output is serialized once, in a fiber detached from the request, into
 * frames (the head, then a chunk per settled deferred value, at any depth).
 * Each frame is kept in Effect's `BackingPersistence` under its index, with a
 * `meta` entry counting them. A reader, on this instance or another, reads
 * the frames from an index on, polling until the last one. A client that
 * loses its connection after `n` frames asks again from `n` and feeds the
 * rest into the same deserializer.
 */
import { Duration, Effect, Stream } from 'effect';
import { Persistence } from 'effect/persistence';
import type { AnyTransformer, Frame } from '@trpc12/trpc/transformer';

interface Meta {
  readonly count: number;
  readonly done: boolean;
}

export interface StreamLogOptions {
  /** How long frames are kept. @default '10 minutes' */
  readonly ttl?: Duration.Input;
  /** How often a reader checks for new frames. @default '20 millis' */
  readonly pollInterval?: Duration.Input;
}

export interface StreamLog {
  /**
   * Serializes `run()`'s output into the log under `key`, detached from the
   * caller. Returns `false` (and runs nothing) when the key already has a log.
   */
  readonly start: (
    key: string,
    transformer: AnyTransformer,
    run: () => unknown,
  ) => Effect.Effect<boolean>;
  /** The frames from index `from` on, until the last. */
  readonly read: (key: string, from?: number) => Stream.Stream<Frame>;
}

export const makeStreamLog = (opts: StreamLogOptions = {}) =>
  Effect.gen(function* () {
    const ttl = Duration.fromInputUnsafe(opts.ttl ?? '10 minutes');
    const poll = Duration.fromInputUnsafe(opts.pollInterval ?? '20 millis');
    const backing = yield* Persistence.BackingPersistence;
    const store = yield* backing.make('spike/durable-frames');
    const metaOf = (key: string) =>
      store.get(`${key}:meta`).pipe(Effect.orDie) as Effect.Effect<
        Meta | undefined
      >;

    const start: StreamLog['start'] = (key, transformer, run) =>
      Effect.gen(function* () {
        if (yield* metaOf(key)) return false;
        yield* store
          .set(`${key}:meta`, { count: 0, done: false }, ttl)
          .pipe(Effect.orDie);
        const { head, chunks } = transformer.serializeDeferred(run());
        const frames = Stream.concat(
          Stream.make(head as Frame),
          chunks ? Stream.orDie(chunks) : Stream.empty,
        );
        yield* frames.pipe(
          Stream.zipWithIndex,
          Stream.runForEach(([frame, i]) =>
            store
              .setMany([
                [`${key}:${i}`, { frame }, ttl],
                [`${key}:meta`, { count: i + 1, done: false }, ttl],
              ])
              .pipe(Effect.orDie),
          ),
          Effect.flatMap(() =>
            Effect.flatMap(metaOf(key), (meta) =>
              store.set(
                `${key}:meta`,
                { count: meta?.count ?? 0, done: true },
                ttl,
              ),
            ),
          ),
          Effect.orDie,
          // The output keeps streaming into the log when the caller goes away.
          Effect.forkDetach,
        );
        return true;
      });

    const read: StreamLog['read'] = (key, from = 0) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const meta = yield* metaOf(key);
          if (!meta) return yield* Effect.die(new Error(`no log for "${key}"`));
          const keys = Array.from(
            { length: Math.max(0, meta.count - from) },
            (_, i) => `${key}:${from + i}`,
          );
          const entries = keys.length
            ? yield* store
                .getMany(keys as [string, ...string[]])
                .pipe(Effect.orDie)
            : [];
          const frames = Stream.fromIterable(
            entries.map((entry) => (entry as { frame: Frame }).frame),
          );
          const next = from + entries.length;
          if (meta.done && next >= meta.count) return frames;
          return Stream.concat(
            frames,
            Stream.unwrap(Effect.as(Effect.sleep(poll), read(key, next))),
          );
        }),
      );

    return { start, read } satisfies StreamLog;
  });
