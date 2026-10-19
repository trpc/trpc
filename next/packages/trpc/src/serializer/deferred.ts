/**
 * Deferred values (`Promise`, `AsyncIterable`, `ReadableStream`) on the
 * wire: a head frame, then chunks as each settles. Kept apart from the
 * `Serializer` so a client imports only the side it uses: the handler
 * encodes, the links that stream decode.
 *
 * @module
 */
import { Cause, Deferred, Effect, Exit, Queue, Stream } from 'effect';
import { isPlainObject } from './framed.ts';
import type { AnySerializer } from './index.ts';
import {
  deferredBuilders,
  deferredChunks,
  isAsyncIterable,
  isPromiseLike,
  serializeDeferred as dansonSerializeDeferred,
  sourceOf,
  streamErrorsOf,
  toDansonError,
  toDeserializeError,
  type Chunk,
  type ChunkQueue,
  DansonError,
  type Frame,
  type PendingSource,
  type SerializedDeferred,
  type SerializeReturn,
  type Status,
} from './danson/index.ts';

/**
 * Options for {@link serializeDeferred}.
 * @since 0.1.0
 * @stability stable
 */
export interface SerializeDeferredOptions {
  /** What a rejected promise or a failed stream sends, from its cause. */
  coerceError?: (cause: unknown) => unknown;
}

/**
 * Options for {@link deserializeStream}.
 * @since 0.1.0
 * @stability stable
 */
export interface DeserializeStreamOptions {
  /** Rebuilds an error chunk's value: what the deferred value rejects with. */
  reviveError?: (value: unknown) => unknown;
  /** What open deferred values reject with when the frames die. */
  streamFailed?: (cause: unknown) => unknown;
  /** What open deferred values reject with when the frames end early. */
  streamInterrupted?: () => unknown;
}

/**
 * Serializes a value that may hold deferred parts: the head now, and the
 * deferred parts as chunks once they settle. `chunks` is `undefined` when
 * there are none, and is single-use.
 *
 * @example
 * ```ts
 * const serialized = serializeDeferred(jsonSerializer, { post, comments: loadComments() });
 * send(serialized.head);
 * if (serialized.chunks) yield* Stream.runForEach(serialized.chunks, send);
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
  return framedEncode(serializer, value, opts);
}

/**
 * Rebuilds a value from its head frame and chunks, with each deferred part
 * a live `Promise` or `AsyncIterable` fed by the chunks that follow.
 *
 * @example
 * ```ts
 * const value = yield* deserializeStream(jsonSerializer, frames);
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
  return own
    ? own.deserializeStream(frames, opts)
    : framedDecode(serializer, frames, opts);
}

type Kind = 'Promise' | 'AsyncIterable' | 'ReadableStream';

/** Where a deferred value sat: its path in the value, chunk index and kind. */
type Slot = [path: Array<string | number>, index: number, kind: Kind];

/** A framed value: the serializer's JSON, plus the deferred values it held. */
interface FramedPayload extends SerializeReturn {
  d?: Slot[];
}

const kindOf = (v: unknown): Kind | undefined =>
  v instanceof ReadableStream
    ? 'ReadableStream'
    : isAsyncIterable(v)
      ? 'AsyncIterable'
      : isPromiseLike(v)
        ? 'Promise'
        : undefined;

/**
 * Takes the deferred values out of plain objects and arrays, leaving `null`
 * in their place, and lists where they were. Only the containers on a path to
 * a deferred value are copied. Other objects (a `Map`, a class instance) are
 * the serializer's to handle.
 */
function holes(
  value: unknown,
  register: (deferred: Parameters<typeof sourceOf>[0]) => number,
): { value: unknown; slots: Slot[] } {
  const slots: Slot[] = [];
  const path: Array<string | number> = [];
  const open = new Set<object>();
  const walk = (v: unknown): unknown => {
    const kind = kindOf(v);
    if (kind) {
      slots.push([[...path], register(v as never), kind]);
      return null;
    }
    const array = Array.isArray(v);
    if (!array && !isPlainObject(v)) return v;
    if (open.has(v as object)) return v;
    open.add(v as object);
    let copy: Record<string | number, unknown> | undefined;
    const keys: Array<string | number> = array
      ? Array.from((v as unknown[]).keys())
      : Object.keys(v as object);
    for (const key of keys) {
      const item = (v as Record<string | number, unknown>)[key];
      path.push(key);
      const next = walk(item);
      path.pop();
      if (next !== item) {
        copy ??= (
          array ? [...(v as unknown[])] : { ...(v as object) }
        ) as never;
        copy![key] = next;
      }
    }
    open.delete(v as object);
    return copy ?? v;
  };
  return { value: walk(value), slots };
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

/** The transport's framing, for serializers without their own. */
function framedEncode(
  serializer: AnySerializer,
  value: unknown,
  opts: SerializeDeferredOptions,
): SerializedDeferred {
  const pending: PendingSource[] = [];
  let next = 0;
  const register = (v: Parameters<typeof sourceOf>[0]) => {
    if (isPromiseLike(v)) Promise.resolve(v).catch(() => {});
    const idx = next++;
    pending.push([idx, sourceOf(v)]);
    return idx;
  };
  const payload = (v: unknown): FramedPayload => {
    const holed = holes(v, register);
    const out = serializer.serialize(holed.value);
    return holed.slots.length > 0 ? { ...out, d: holed.slots } : out;
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

function framedDecode<T, E>(
  serializer: AnySerializer,
  frames: Stream.Stream<Frame, E>,
  opts: DeserializeStreamOptions,
): Effect.Effect<T, E | DansonError> {
  const errors = streamErrorsOf(opts);
  return Effect.gen(function* () {
    const head = yield* Deferred.make<T, E | DansonError>();
    const queues = new Map<number, ChunkQueue>();
    const queueFor = (idx: number) => {
      let q = queues.get(idx);
      if (!q) {
        q = Effect.runSync(Queue.unbounded<[Status, unknown], unknown>());
        queues.set(idx, q);
      }
      return q;
    };
    const take = (idx: number) =>
      Stream.fromQueue(queueFor(idx)).pipe(
        Stream.ensuring(Effect.sync(() => queues.delete(idx))),
      );
    const builders = deferredBuilders(take, errors.revive);
    const revivePayload = (p: FramedPayload): unknown => {
      let v: unknown = serializer.deserialize(p);
      for (const [path, idx, kind] of p.d ?? []) {
        queueFor(idx);
        v = setAt(v, path, builders[kind](idx));
      }
      return v;
    };
    let first = true;
    yield* frames.pipe(
      Stream.runForEach((frame) =>
        Effect.try({
          try: () => {
            if (first) {
              first = false;
              Deferred.doneUnsafe(
                head,
                Effect.succeed(revivePayload(frame as FramedPayload) as T),
              );
              return;
            }
            const [idx, status, json] = frame as Chunk;
            Queue.offerUnsafe(queueFor(idx), [
              status,
              revivePayload(json as FramedPayload),
            ]);
          },
          catch: toDeserializeError,
        }),
      ),
      Effect.onExit((exit) =>
        Effect.sync(() => {
          const error = errors.ended(exit);
          // A no-op once the head is out; a head frame that failed to read leaves it open.
          Deferred.doneUnsafe(
            head,
            Exit.isFailure(exit)
              ? Effect.failCause(exit.cause)
              : Effect.fail(errors.interrupted() as never),
          );
          for (const q of queues.values()) {
            Queue.failCauseUnsafe(q, Cause.fail(error));
          }
        }),
      ),
      Effect.forkDetach,
    );
    return yield* Deferred.await(head);
  });
}
