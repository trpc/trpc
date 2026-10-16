/**
 * Spike (decision streamed-outputs-are-jsonl): a streamed query output, with
 * deferred values at any depth, framed as SSE instead of JSONL.
 *
 * The frames are trpcdev's async format (danSON's: a head, then `[index,
 * status, value]` chunks; plain JSON uses the same frames), one SSE event
 * each, with the frame's position as its `id`. `devalue-async` writes the same
 * shape of lines, so the framing is the same for it.
 *
 * A reconnect can only resume if the server still holds the frames: deferred
 * values can't be re-created from a `Last-Event-ID`. `createReplay` keeps a
 * call's frames, so a reconnect gets the ones after the id and then the rest
 * live.
 */
import { Effect, Option, PubSub, Semaphore, Stream } from 'effect';
import type { AnySerializer, Frame } from 'trpcdev/serializer';

/** A value's frames: the head, then each chunk as its deferred parts settle. */
export const framesOf = (
  serializer: AnySerializer,
  value: unknown,
): Stream.Stream<Frame> => {
  const { head, chunks } = serializer.serializeDeferred(value);
  return Stream.concat(
    Stream.make(head as Frame),
    chunks ? Stream.orDie(chunks) : Stream.empty,
  );
};

/** One SSE event per line, numbered from 0. */
export const toSse = (
  lines: Stream.Stream<string>,
  from = 0,
): Stream.Stream<string> =>
  lines.pipe(
    Stream.mapAccum(
      () => from,
      (n, line) => [n + 1, [`id: ${n}\ndata: ${line}\n\n`]] as const,
    ),
  );

export const toJsonl = (lines: Stream.Stream<string>): Stream.Stream<string> =>
  Stream.map(lines, (line) => `${line}\n`);

export interface SseEvent {
  readonly id: string | undefined;
  readonly data: string;
}

interface Pending {
  readonly id: string | undefined;
  readonly data: ReadonlyArray<string>;
}

/** Parses an SSE body into its events (`data` and `id` fields only). */
export const parseSse = <E>(
  body: Stream.Stream<Uint8Array, E>,
): Stream.Stream<SseEvent, E> =>
  body.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.mapAccum(
      (): Pending => ({ id: undefined, data: [] }),
      (event, line): readonly [Pending, ReadonlyArray<SseEvent>] => {
        if (line === '') {
          return event.data.length
            ? [
                { id: undefined, data: [] },
                [{ id: event.id, data: event.data.join('\n') }],
              ]
            : [event, []];
        }
        if (line.startsWith('data:')) {
          return [
            { ...event, data: [...event.data, line.slice(5).trimStart()] },
            [],
          ];
        }
        if (line.startsWith('id:'))
          return [{ ...event, id: line.slice(3).trim() }, []];
        return [event, []];
      },
    ),
  );

/** Rebuilds the value from SSE events of its frames. */
export const fromSse = <T, E>(
  serializer: AnySerializer,
  events: Stream.Stream<SseEvent, E>,
): Effect.Effect<T, unknown> =>
  serializer.deserializeStream<T, E>(
    Stream.map(events, (event) => JSON.parse(event.data) as Frame),
    { streamInterrupted: () => new Error('the SSE stream ended early') },
  );

export interface Replay {
  /** Frames after `lastEventId` (all without one), then the rest live. */
  readonly from: (lastEventId?: string) => Stream.Stream<string>;
}

/**
 * Serializes a value once and keeps its frames, so connections (and
 * reconnects) read the same deferred values. Runs until the scope closes.
 */
export const createReplay = (serializer: AnySerializer, value: unknown) =>
  Effect.gen(function* () {
    let kept: ReadonlyArray<string> = [];
    let done = false;
    const live = yield* PubSub.unbounded<Option.Option<string>>();
    // Keeping a frame and publishing it is one step for readers, so a
    // reader that subscribes sees each frame once: kept or live.
    const lock = yield* Semaphore.make(1);
    yield* framesOf(serializer, value).pipe(
      Stream.map((frame) => JSON.stringify(frame)),
      Stream.runForEach((line) =>
        lock.withPermits(1)(
          Effect.suspend(() => {
            kept = [...kept, line];
            return PubSub.publish(live, Option.some(line));
          }),
        ),
      ),
      Effect.ensuring(
        lock.withPermits(1)(
          Effect.suspend(() => {
            done = true;
            return PubSub.publish(live, Option.none());
          }),
        ),
      ),
      Effect.forkScoped,
    );
    const replay: Replay = {
      from: (lastEventId) =>
        Stream.unwrap(
          lock.withPermits(1)(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(live);
              const start =
                lastEventId === undefined ? 0 : Number(lastEventId) + 1;
              const rest = done
                ? Stream.empty
                : Stream.fromSubscription(subscription).pipe(
                    Stream.takeWhile(Option.isSome),
                    Stream.map((line) => line.value),
                  );
              return toSse(
                Stream.concat(Stream.fromIterable(kept.slice(start)), rest),
                start,
              );
            }),
          ),
        ),
    };
    return replay;
  });
