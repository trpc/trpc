/**
 * danSON's async format (head chunk, then `[index, status, { json, refs? }]`
 * chunks) reimplemented on Effect `Stream`. The wire format matches danSON
 * 0.13.1 `serializeAsync` / `deserializeAsync`.
 *
 * Deserialized deferred values are plain `Promise` / `AsyncIterable` /
 * `ReadableStream`, so Promise users never see Effect.
 *
 * @internal
 */
import { Cause, Deferred, Effect, Exit, Queue, Scope, Stream } from 'effect';
import {
  deserializeSync,
  instancesOnly,
  objectsOnly,
  serializeSync,
  type DeserializeOptions,
  type SerializeOptions,
  type SerializeRecord,
  type SerializeReturn,
} from './sync.ts';
import {
  forEachSeq,
  toAsyncIterable,
  toReadableStream,
} from '../internal/effects.ts';
import { fromBase64, JsonBytes } from '../internal/frames.ts';
import { counter, DansonError } from './utils.ts';

export const VALUE = 0;
export const ERROR = 1;
export const RETURN = 2;
export type Status = typeof VALUE | typeof ERROR | typeof RETURN;

/**
 * One streamed chunk of a deferred value: its index, status and serialized value.
 * @since 0.1.0
 * @stability stable
 */
export type Chunk = [index: number, status: Status, value: SerializeReturn];
/**
 * A JSONL line of a deferred stream: the head or a chunk.
 * @since 0.1.0
 * @stability stable
 */
export type Frame = SerializeReturn | Chunk;

export const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
  typeof v === 'object' && v !== null && Symbol.asyncIterator in v;
export const isPromiseLike = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { then?: unknown }).then === 'function';

/** Every deferred value becomes a stream of `[status, value]` pairs. */
export function sourceOf(
  value:
    | ReadableStream<unknown>
    | AsyncIterable<unknown>
    | PromiseLike<unknown>,
): Stream.Stream<[Status, unknown]> {
  if (value instanceof ReadableStream || isAsyncIterable(value)) {
    const iterable =
      value instanceof ReadableStream
        ? (value as ReadableStream<unknown> & AsyncIterable<unknown>)
        : value;
    return Stream.callback<[Status, unknown]>((queue) =>
      Effect.gen(function* () {
        const iterator = iterable[Symbol.asyncIterator]();
        yield* Effect.addFinalizer(() =>
          Effect.promise(async () => {
            await iterator.return?.();
          }),
        );
        while (true) {
          const next = yield* Effect.tryPromise({
            try: () => iterator.next(),
            catch: (cause) => cause,
          }).pipe(Effect.exit);
          if (Exit.isFailure(next)) {
            Queue.offerUnsafe(queue, [ERROR, Cause.squash(next.cause)]);
            break;
          }
          if (next.value.done) {
            Queue.offerUnsafe(queue, [RETURN, next.value.value]);
            break;
          }
          Queue.offerUnsafe(queue, [VALUE, next.value.value]);
        }
        Queue.endUnsafe(queue);
      }),
    );
  }
  return Stream.fromEffect(
    Effect.tryPromise({ try: () => value, catch: (cause) => cause }).pipe(
      Effect.match({
        onSuccess: (v): [Status, unknown] => [VALUE, v],
        onFailure: (e): [Status, unknown] => [ERROR, e],
      }),
    ),
  );
}

const isFile = (v: unknown): v is File =>
  typeof File !== 'undefined' && v instanceof File;

/** A blob's bytes, one chunk per read. */
async function* byteChunks(blob: Blob): AsyncGenerator<JsonBytes> {
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return;
      yield JsonBytes.wrap(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
}

/** Chunks arrive as bytes over binary transports, base64 over JSON ones. */
function toBytes(chunks: unknown[]): Uint8Array<ArrayBuffer>[] {
  return chunks.map((chunk) => {
    if (chunk instanceof Uint8Array) return chunk as Uint8Array<ArrayBuffer>;
    const decoded = fromBase64(String(chunk));
    if (!decoded) throw new DansonError('Malformed file bytes');
    return decoded;
  });
}

/** How a `File` or `Blob` in a streamed value points at its bytes' chunks. */
interface BlobRef {
  stream: number;
  type: string;
  name?: string;
  lastModified?: number;
}

const isBlobMarker = (v: Record<string, unknown>) =>
  v['_'] === '$' &&
  (v['type'] === 'File' || v['type'] === 'Blob') &&
  typeof (v['value'] as BlobRef | undefined)?.stream === 'number';

/** The chunk indexes of every `File` or `Blob` a frame holds. */
function blobStreams(frame: SerializeReturn): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
    } else if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      if (isBlobMarker(o)) out.push((o['value'] as BlobRef).stream);
      else for (const key in o) walk(o[key]);
    }
  };
  walk(frame.json);
  if (frame.refs) walk(frame.refs);
  return out;
}

interface DeferredContext {
  register(v: Parameters<typeof sourceOf>[0]): number;
  registerBlob(blob: Blob): number;
}

/** Registers deferred values with the serialization's `DeferredContext`. */
const deferredSerializers: SerializeRecord = {
  ReadableStream: instancesOnly((v, ctx: DeferredContext) =>
    v instanceof ReadableStream ? ctx.register(v) : false,
  ),
  AsyncIterable: objectsOnly((v, ctx: DeferredContext) =>
    isAsyncIterable(v) ? ctx.register(v) : false,
  ),
  Promise: objectsOnly((v, ctx: DeferredContext) =>
    isPromiseLike(v) ? ctx.register(v) : false,
  ),
  File: instancesOnly((v, ctx: DeferredContext) =>
    isFile(v)
      ? ({
          stream: ctx.registerBlob(v),
          name: v.name,
          type: v.type,
          lastModified: v.lastModified,
        } satisfies BlobRef)
      : false,
  ),
  Blob: instancesOnly((v, ctx: DeferredContext) =>
    v instanceof Blob
      ? ({
          stream: ctx.registerBlob(v),
          type: v.type,
        } satisfies BlobRef)
      : false,
  ),
};

const withDeferredCache = new WeakMap<SerializeRecord, SerializeRecord>();
const withDeferred = (serializers: SerializeRecord): SerializeRecord => {
  let merged = withDeferredCache.get(serializers);
  if (!merged) {
    merged = { ...serializers, ...deferredSerializers };
    withDeferredCache.set(serializers, merged);
  }
  return merged;
};

export interface SerializeStreamOptions extends SerializeOptions {
  /** Turn a failure (rejected promise, thrown iterator) into something serializable. */
  coerceError?: ((cause: unknown) => unknown) | undefined;
}

export const toDansonError = (cause: unknown): DansonError =>
  cause instanceof DansonError
    ? cause
    : new DansonError('serialize failed', { cause });

export const toDeserializeError = (cause: unknown): DansonError =>
  cause instanceof DansonError
    ? cause
    : new DansonError('deserialize failed', { cause });

/**
 * A serialized value: the head, plus a stream of chunks when it holds deferred values.
 * @since 0.1.0
 * @stability stable
 */
export interface SerializedDeferred {
  readonly head: SerializeReturn;
  /** `undefined` when the value has no `Promise`, `AsyncIterable` or `ReadableStream` in it. */
  readonly chunks: Stream.Stream<Chunk, DansonError> | undefined;
}

/**
 * Serializes the head eagerly, so every deferred value is registered (and its
 * rejection handled) before any Effect scheduling. The chunk stream is
 * single-use.
 */
export function serializeDeferred(
  value: unknown,
  options: SerializeStreamOptions,
): SerializedDeferred {
  const nextIndex = counter();
  const pending: PendingSource[] = [];
  const opts: SerializeOptions = {
    state: { indexCounter: counter(), refCounter: counter() },
    serializers: withDeferred(options.serializers),
    dedupe: options.dedupe,
    context: {
      register: (v: Parameters<typeof sourceOf>[0]) => register(v),
      registerBlob: (blob: Blob) => registerBlob(blob),
    } satisfies DeferredContext,
  };
  const blobs = new Map<Blob, number>();
  /** A blob that appears twice sends its bytes once. */
  function registerBlob(blob: Blob): number {
    let idx = blobs.get(blob);
    if (idx === undefined) {
      idx = register(byteChunks(blob));
      blobs.set(blob, idx);
    }
    return idx;
  }
  function register(v: Parameters<typeof sourceOf>[0]): number {
    if (isPromiseLike(v)) {
      // Rejections surface as ERROR chunks once the source starts.
      Promise.resolve(v).catch(() => {});
    }
    const idx = nextIndex();
    pending.push([idx, sourceOf(v)]);
    return idx;
  }
  const serialize = (v: unknown) =>
    v instanceof JsonBytes
      ? Effect.succeed<SerializeReturn>({ json: v as never })
      : Effect.try({
          try: () => serializeSync(v, opts),
          catch: toDansonError,
        });

  const head = serializeSync(value, opts);
  if (pending.length === 0) return { head, chunks: undefined };

  const chunks = deferredChunks(pending, serialize, options.coerceError);
  return { head, chunks };
}

/** A deferred source waiting to start, under its chunk index. */
export type PendingSource = [number, Stream.Stream<[Status, unknown]>];

/**
 * Runs every pending source concurrently, serializing each item into a chunk.
 * Serializing an item may push more sources onto `pending` (a promise inside
 * a yielded value); they start too, and the stream ends when all have.
 *
 * Failures go through `coerceError`. With it, an item that can't be
 * serialized fails its own deferred value and stops its source; without it,
 * the whole stream fails.
 */
export function deferredChunks(
  pending: PendingSource[],
  serialize: (value: unknown) => Effect.Effect<SerializeReturn, DansonError>,
  coerceError: ((cause: unknown) => unknown) | undefined,
): Stream.Stream<Chunk, DansonError> {
  const failure = (cause: unknown) =>
    Effect.map(
      serialize(coerceError ? coerceError(cause) : cause),
      (json): [Status, SerializeReturn] => [ERROR, json],
    );
  const chunk = (
    status: Status,
    v: unknown,
  ): Effect.Effect<[Status, SerializeReturn], DansonError> =>
    status === ERROR
      ? failure(v)
      : serialize(v).pipe(
          Effect.map((json): [Status, SerializeReturn] => [status, json]),
          Effect.catch((cause) =>
            coerceError ? failure(cause) : Effect.fail(cause),
          ),
        );
  return Stream.callback<Chunk, DansonError>((queue) =>
    Effect.gen(function* () {
      let active = 0;
      const finishOne = Effect.sync(() => {
        active--;
        if (active === 0 && pending.length === 0) Queue.endUnsafe(queue);
      });

      // Serializing a chunk may register more sources; start them too.
      const startPending: Effect.Effect<unknown, never, Scope.Scope> =
        Effect.suspend(() =>
          forEachSeq(pending.splice(0), ([idx, source]) => {
            active++;
            return source.pipe(
              Stream.mapEffect(([status, v]) => chunk(status, v)),
              Stream.takeUntil(([status]) => status === ERROR),
              Stream.runForEach(([status, json]) => {
                Queue.offerUnsafe(queue, [idx, status, json]);
                return startPending;
              }),
              Effect.catchCause((cause) =>
                Effect.sync(() => Queue.failCauseUnsafe(queue, cause)),
              ),
              Effect.ensuring(finishOne),
              Effect.forkScoped,
            );
          }),
        );

      yield* startPending;
    }),
  );
}

/** An async iterable whose `return` value is the stream's RETURN chunk. */
export function iterateWithReturn(
  source: Stream.Stream<[Status, unknown], unknown>,
  revive: (value: unknown) => unknown,
): AsyncIterable<unknown, unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for await (const [status, v] of toAsyncIterable(source)) {
        if (status === VALUE) yield v;
        else if (status === RETURN) return v;
        else throw revive(v);
      }
      return undefined;
    },
  };
}

/**
 * Rebuilds deferred values from their chunk streams: a `Promise` settles with
 * the first chunk, an `AsyncIterable` yields until RETURN, and a
 * `ReadableStream` reads the same items.
 */
export interface DeferredBuilders {
  readonly iterate: (idx: number) => Stream.Stream<unknown, unknown>;
  readonly Promise: (idx: number) => Promise<unknown>;
  readonly AsyncIterable: (idx: number) => AsyncIterable<unknown, unknown>;
  readonly ReadableStream: (idx: number) => ReadableStream<unknown>;
}

export function deferredBuilders(
  take: (idx: number) => Stream.Stream<[Status, unknown], unknown>,
  revive: (value: unknown) => unknown,
): DeferredBuilders {
  const iterate = (idx: number) =>
    take(idx).pipe(
      Stream.takeWhile(([status]) => status !== RETURN),
      Stream.mapEffect(([status, v]) =>
        status === VALUE ? Effect.succeed(v) : Effect.fail(revive(v)),
      ),
    );
  return {
    iterate,
    // Chunk queues fail, never end, so a promise always gets its chunk.
    Promise: (idx: number): Promise<unknown> => {
      const p = Effect.runPromise(
        iterate(idx).pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map(([v]) => v),
        ),
      );
      p.catch(() => {});
      return p;
    },
    AsyncIterable: (idx: number): AsyncIterable<unknown, unknown> =>
      iterateWithReturn(take(idx), revive),
    ReadableStream: (idx: number): ReadableStream<unknown> =>
      toReadableStream(iterate(idx)),
  };
}

export interface StreamErrorOptions {
  /** Turns a deserialized ERROR chunk into the value a deferred rejects with. */
  reviveError?: (value: unknown) => unknown;
  /** What open deferred values reject with when the source dies (a defect). */
  streamFailed?: (cause: unknown) => unknown;
  /** What open deferred values reject with when the source ends early. */
  streamInterrupted?: () => unknown;
}

export interface DeserializeStreamOptions
  extends DeserializeOptions, StreamErrorOptions {}

export interface StreamErrors {
  readonly revive: (value: unknown) => unknown;
  /** What a deferred value rejects with when a frame for it can't be read. */
  readonly unreadable: (error: unknown) => unknown;
  /** What open deferred values reject with when the frames end. */
  readonly ended: (exit: Exit.Exit<unknown, unknown>) => unknown;
  readonly interrupted: () => unknown;
}

/** The stream error options, with danSON's defaults. */
export function streamErrorsOf(options: StreamErrorOptions): StreamErrors {
  const failed =
    options.streamFailed ??
    ((cause: unknown) => new DansonError('Stream failed', { cause }));
  const interrupted =
    options.streamInterrupted ?? (() => new DansonError('Stream interrupted'));
  const unreadable = (error: unknown) =>
    error instanceof DansonError ? failed(error) : error;
  return {
    revive: options.reviveError ?? ((v: unknown) => v),
    unreadable,
    // The source's own failure (a network error, an abort) reaches open
    // deferred values as it is; unreadable frames, defects and interrupts
    // are a failed stream.
    ended: (exit) => {
      if (Exit.isSuccess(exit)) return interrupted();
      const failure = exit.cause.reasons.find(Cause.isFailReason);
      return failure
        ? unreadable(failure.error)
        : failed(Cause.squash(exit.cause));
    },
    interrupted,
  };
}

export type ChunkQueue = Queue.Queue<[Status, unknown], unknown>;

export function deserializeStream<T, E>(
  source: Stream.Stream<Frame, E>,
  options: DeserializeStreamOptions,
): Effect.Effect<T, E | DansonError> {
  const errors = streamErrorsOf(options);
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

    const { iterate, ...builders } = deferredBuilders(take, errors.revive);
    const opts: DeserializeOptions = {
      ...options,
      cache: new Map(),
      deserializers: { ...options.deserializers, ...builders },
    };

    // A frame holding a `File` or `Blob` waits for its bytes, which arrive
    // as later chunks; frames for the same target keep their order.
    const bytes = new Map<number, Deferred.Deferred<void, unknown>>();
    const collected = new Map<number, Uint8Array<ArrayBuffer>[]>();
    const blobParts = (ref: BlobRef) => {
      const parts = collected.get(ref.stream);
      if (!parts) throw new DansonError('Missing file bytes');
      return parts;
    };
    opts.deserializers = {
      ...opts.deserializers,
      File: (ref: BlobRef) =>
        new File(blobParts(ref), String(ref.name ?? 'blob'), {
          type: String(ref.type ?? ''),
          ...(ref.lastModified === undefined
            ? {}
            : { lastModified: ref.lastModified }),
        }),
      Blob: (ref: BlobRef) =>
        new Blob(blobParts(ref), { type: String(ref.type ?? '') }),
    };
    const collect = (idx: number) =>
      Effect.suspend(() => {
        const known = bytes.get(idx);
        if (known) return Effect.succeed(known);
        const done = Deferred.makeUnsafe<void, unknown>();
        bytes.set(idx, done);
        return iterate(idx).pipe(
          Stream.runCollect,
          Effect.map((chunks) => {
            collected.set(idx, toBytes(Array.from(chunks)));
          }),
          Deferred.into(done),
          Effect.forkDetach,
          Effect.as(done),
        );
      });
    const HEAD = -1;
    /** The last frame waiting for bytes, per target. */
    const tails = new Map<number, Deferred.Deferred<void, unknown>>();
    const apply = (target: number, frame: Frame) => {
      if (target === HEAD) {
        Deferred.doneUnsafe(
          head,
          Effect.succeed(deserializeSync<T>(frame as SerializeReturn, opts)),
        );
        return;
      }
      const [, status, json] = frame as Chunk;
      Queue.offerUnsafe(queueFor(target), [
        status,
        json.json instanceof Uint8Array
          ? json.json
          : deserializeSync(json, opts),
      ]);
    };
    // A frame that can't be read fails its own target: the head as it is
    // (the link names it), a deferred value as a failed stream would.
    const fail = (target: number, error: unknown) => {
      if (target === HEAD)
        Deferred.doneUnsafe(head, Effect.fail(error as never));
      else
        Queue.failCauseUnsafe(
          queueFor(target),
          Cause.fail(errors.unreadable(error)),
        );
    };
    const settle = (target: number, frame: Frame) => {
      try {
        apply(target, frame);
      } catch (cause) {
        fail(target, toDeserializeError(cause));
      }
    };

    let first = true;
    yield* source.pipe(
      Stream.runForEach((frame) =>
        Effect.gen(function* () {
          const target = first ? HEAD : (frame as Chunk)[0];
          first = false;
          const refs = yield* Effect.try({
            try: () =>
              blobStreams(
                target === HEAD
                  ? (frame as SerializeReturn)
                  : (frame as Chunk)[2],
              ),
            catch: toDeserializeError,
          });
          const waits = yield* forEachSeq(refs, collect);
          const tail = tails.get(target);
          if (waits.length === 0 && !tail) return settle(target, frame);
          const settled = Deferred.makeUnsafe<void, unknown>();
          tails.set(target, settled);
          const ready: ReadonlyArray<Deferred.Deferred<void, unknown>> = tail
            ? [tail, ...waits]
            : waits;
          yield* forEachSeq(ready, (d) => Deferred.await(d)).pipe(
            Effect.matchCause({
              onFailure: (cause) => fail(target, Cause.squash(cause)),
              onSuccess: () => settle(target, frame),
            }),
            Effect.ensuring(
              Effect.sync(() => {
                Deferred.doneUnsafe(settled, Effect.void);
                if (tails.get(target) === settled) tails.delete(target);
              }),
            ),
            Effect.forkDetach,
          );
        }),
      ),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const error = errors.ended(exit);
          // Bytes already received still drain; then waiting frames settle.
          for (const idx of bytes.keys()) {
            const q = queues.get(idx);
            if (q) Queue.failCauseUnsafe(q, Cause.fail(error));
          }
          yield* forEachSeq([...tails.values()], Deferred.await);
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
