/**
 * Deferred values (`Promise`, `AsyncIterable`, `ReadableStream`) on the wire:
 * a head frame, then a chunk per item as each settles. Kept apart from the
 * `Serializer` so a client imports only the side it uses: the handler
 * encodes, the links that stream decode.
 *
 * @module
 */
import { Deferred, Effect, Exit, Stream } from 'effect';
import { scan, type FramedPayload, type Scanned } from './framed.ts';
import type { AnySerializer } from './index.ts';
import {
  deferredChunks,
  makeChunkQueues,
  serializeDeferred as dansonSerializeDeferred,
  sourceOf,
  streamErrorsOf,
  toDansonError,
  toDeserializeError,
  type Chunk,
  type Frame,
  type PendingSource,
  type SerializedDeferred,
  DansonError,
} from './danson/index.ts';

/**
 * Options for {@link serializeDeferred}.
 * @since 0.1.0
 * @stability stable
 */
export interface SerializeDeferredOptions {
  /**
   * Turns what a deferred value rejected with into what goes on the wire.
   * Without it, a rejection that can't be serialized fails every chunk.
   */
  coerceError?: ((cause: unknown) => unknown) | undefined;
}

/**
 * Options for {@link deserializeStream}.
 * @since 0.1.0
 * @stability stable
 */
export interface DeserializeStreamOptions {
  /** Rebuilds an error a deferred value rejected with. */
  reviveError?: (value: unknown) => unknown;
  /** What open deferred values reject with when the frames die. */
  streamFailed?: (cause: unknown) => unknown;
  /** What open deferred values reject with when the frames end early. */
  streamInterrupted?: () => unknown;
}

/**
 * Serializes a value that may hold deferred parts: the head now, and the
 * chunks as each part settles (`undefined` when it holds none). The chunk
 * stream is single-use.
 *
 * @example
 * ```ts
 * const { head, chunks } = serializeDeferred(serializer, {
 *   user: Promise.resolve({ id: 1 }),
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function serializeDeferred(
  serializer: AnySerializer,
  value: unknown,
  opts: SerializeDeferredOptions = {},
): SerializedDeferred {
  const own = serializer['~deferred'];
  if (own) {
    return dansonSerializeDeferred(value, {
      serializers: own.serializers,
      coerceError: opts.coerceError,
    });
  }
  const encode =
    serializer['~encode'] ??
    ((scanned: Scanned) => serializer.serialize(scanned.value));
  const pending: PendingSource[] = [];
  let next = 0;
  const register = (v: Parameters<typeof sourceOf>[0]) => {
    const idx = next++;
    pending.push([idx, sourceOf(v)]);
    return idx;
  };
  const payload = (v: unknown): FramedPayload => {
    const scanned = scan(v, register);
    const out = encode(scanned);
    return scanned.slots.length > 0 ? { ...out, d: scanned.slots } : out;
  };
  const head = payload(value);
  if (pending.length === 0) return { head, chunks: undefined };
  const chunks = deferredChunks(
    pending,
    (v) => Effect.try({ try: () => payload(v), catch: toDansonError }),
    opts.coerceError,
  );
  return { head, chunks };
}

/**
 * Rebuilds a value from its head frame and chunks. It succeeds once the head
 * is read; the frames are read on for as long as the deferred values in it
 * are.
 *
 * @example
 * ```ts
 * const value = yield* deserializeStream<{ user: Promise<User> }, never>(
 *   serializer,
 *   frames,
 * );
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function deserializeStream<T, E>(
  serializer: AnySerializer,
  frames: Stream.Stream<Frame, E>,
  opts: DeserializeStreamOptions = {},
): Effect.Effect<T, E | DansonError> {
  const own = serializer['~deferred'];
  if (own) return own.deserializeStream(frames, opts);
  const errors = streamErrorsOf(opts);
  return Effect.gen(function* () {
    const head = yield* Deferred.make<T, E | DansonError>();
    const chunks = yield* makeChunkQueues(errors.revive);
    const revivePayload = (p: FramedPayload): unknown => {
      let v: unknown = serializer.deserialize(p);
      for (const [path, idx, kind] of p.d ?? []) {
        v = setAt(v, path, chunks.builders[kind](idx));
      }
      return v;
    };
    const read = (frame: FramedPayload) =>
      Effect.try({
        try: () => revivePayload(frame),
        catch: toDeserializeError,
      });
    let first = true;
    yield* frames.pipe(
      Stream.runForEach((frame) => {
        if (first) {
          first = false;
          return Effect.flatMap(read(frame as FramedPayload), (value) =>
            Deferred.succeed(head, value as T),
          );
        }
        const [idx, status, json] = frame as Chunk;
        return Effect.flatMap(read(json as FramedPayload), (value) =>
          chunks.offer(idx, [status, value]),
        );
      }),
      Effect.onExit((exit) =>
        Effect.andThen(
          // A no-op once the head is out; a head frame that failed to read leaves it open.
          Deferred.done(
            head,
            Exit.isFailure(exit)
              ? Exit.failCause(exit.cause)
              : Exit.fail(errors.interrupted() as never),
          ),
          chunks.end(errors.ended(exit)),
        ),
      ),
      // The frames are read for as long as the deferred values they
      // feed, past the caller's fiber.
      Effect.forkDetach,
    );
    return yield* Deferred.await(head);
  });
}

function setAt(
  target: unknown,
  path: ReadonlyArray<string | number>,
  value: unknown,
): unknown {
  if (path.length === 0) return value;
  let parent = target as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    parent = parent?.[key] as Record<string | number, unknown>;
  }
  if (parent === null || typeof parent !== 'object') {
    throw new DansonError('A deferred value has no place in the result');
  }
  parent[path[path.length - 1]!] = value;
  return target;
}
