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
import {
  Array as Arr,
  Cause,
  Channel,
  type Context,
  Deferred,
  Effect,
  Exit,
  identity,
  Queue,
  Result,
  type Scope,
  Stream,
} from 'effect';
import { Base64 } from 'effect/encoding';
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
import { backpressure, returnUnawaited } from '../../internal/effects.ts';
import { JsonBytes } from '../../internal/frames.ts';
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

/**
 * A channel's items as VALUE pairs, then its done value as RETURN, or its
 * failure as ERROR. It pulls one item per item read.
 */
const statusesOf = <D>(
  channel: Channel.Channel<Arr.NonEmptyReadonlyArray<unknown>, unknown, D>,
): Stream.Stream<[Status, unknown]> =>
  Stream.fromChannel(
    channel.pipe(
      Channel.map(Arr.map((v): [Status, unknown] => [VALUE, v])),
      Channel.concatWith((done) =>
        Channel.succeed(Arr.of<[Status, unknown]>([RETURN, done])),
      ),
      Channel.catch((error) =>
        Channel.succeed(Arr.of<[Status, unknown]>([ERROR, error])),
      ),
    ),
  );

/**
 * Every deferred value becomes a stream of `[status, value]` pairs. A
 * promise is listened to at once, so its rejection is handled before the
 * stream starts.
 */
export function sourceOf(
  value:
    | ReadableStream<unknown>
    | AsyncIterable<unknown>
    | PromiseLike<unknown>,
): Stream.Stream<[Status, unknown]> {
  if (value instanceof ReadableStream || isAsyncIterable(value)) {
    const iterable =
      value instanceof ReadableStream
        ? (value as ReadableStream<unknown> & AsyncIterable<unknown, unknown>)
        : (value as AsyncIterable<unknown, unknown>);
    return statusesOf(
      Channel.fromAsyncIterableArray(returnUnawaited(iterable), identity),
    );
  }
  const settled = Deferred.makeUnsafe<unknown, unknown>();
  Promise.resolve(value).then(
    (v) => Deferred.doneUnsafe(settled, Exit.succeed(v)),
    (e) => Deferred.doneUnsafe(settled, Exit.fail(e)),
  );
  return Stream.fromEffect(
    Deferred.await(settled).pipe(
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
const byteChunks = (blob: Blob): Stream.Stream<[Status, unknown]> =>
  statusesOf(
    Channel.fromReadableStream({
      evaluate: () => blob.stream(),
      onError: identity,
      releaseLockOnEnd: true,
    }).pipe(Channel.map(Arr.map((chunk) => JsonBytes.wrap(chunk)))),
  );

/** Chunks arrive as bytes over binary transports, base64 over JSON ones. */
function toBytes(chunks: unknown[]): Uint8Array<ArrayBuffer>[] {
  return chunks.map((chunk) => {
    if (chunk instanceof Uint8Array) return chunk as Uint8Array<ArrayBuffer>;
    const decoded = Base64.decode(String(chunk));
    if (Result.isFailure(decoded))
      throw new DansonError('Malformed file bytes');
    return decoded.success as Uint8Array<ArrayBuffer>;
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
      else for (const child of Object.values(o)) walk(child);
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
  ReadableStream: /* @__PURE__ */ instancesOnly((v, ctx: DeferredContext) =>
    v instanceof ReadableStream ? ctx.register(v) : false,
  ),
  AsyncIterable: /* @__PURE__ */ objectsOnly((v, ctx: DeferredContext) =>
    isAsyncIterable(v) ? ctx.register(v) : false,
  ),
  Promise: /* @__PURE__ */ objectsOnly((v, ctx: DeferredContext) =>
    isPromiseLike(v) ? ctx.register(v) : false,
  ),
  File: /* @__PURE__ */ instancesOnly((v, ctx: DeferredContext) =>
    isFile(v)
      ? ({
          stream: ctx.registerBlob(v),
          name: v.name,
          type: v.type,
          lastModified: v.lastModified,
        } satisfies BlobRef)
      : false,
  ),
  Blob: /* @__PURE__ */ instancesOnly((v, ctx: DeferredContext) =>
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
      register: (v: Parameters<typeof sourceOf>[0]) => register(sourceOf(v)),
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
  function register(source: Stream.Stream<[Status, unknown]>): number {
    const idx = nextIndex();
    pending.push([idx, source]);
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
  return Stream.callback<Chunk, DansonError>(
    (queue) =>
      Effect.gen(function* () {
        let active = 0;
        const finishOne = Effect.sync(() => {
          active--;
          if (active === 0 && pending.length === 0) Queue.endUnsafe(queue);
        });

        // Serializing a chunk may register more sources; start them too.
        const startPending: Effect.Effect<unknown, never, Scope.Scope> =
          Effect.suspend(() =>
            Effect.forEach(
              pending.splice(0),
              ([idx, source]) => {
                active++;
                return source.pipe(
                  Stream.mapEffect(([status, v]) => chunk(status, v)),
                  Stream.takeUntil(([status]) => status === ERROR),
                  Stream.runForEach(([status, json]) =>
                    Effect.andThen(
                      Queue.offer(queue, [idx, status, json]),
                      startPending,
                    ),
                  ),
                  Effect.catchCause((cause) =>
                    Effect.sync(() => Queue.failCauseUnsafe(queue, cause)),
                  ),
                  Effect.ensuring(finishOne),
                  Effect.forkScoped,
                );
              },
              { discard: true },
            ),
          );

        yield* startPending;
      }),
    backpressure,
  );
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

/** An async iterable whose `return` value is the stream's RETURN chunk. */
const iterateWithReturn = (
  source: Stream.Stream<[Status, unknown], unknown>,
  revive: (value: unknown) => unknown,
  context: Context.Context<never>,
): AsyncIterable<unknown, unknown> => {
  const results = source.pipe(
    Stream.takeUntil(([status]) => status !== VALUE),
    Stream.mapEffect(([status, v]) =>
      status === ERROR
        ? Effect.fail(revive(v))
        : Effect.succeed<IteratorResult<unknown, unknown>>({
            done: status === RETURN,
            value: v,
          }),
    ),
  );
  return {
    [Symbol.asyncIterator]() {
      const iterator = Stream.toAsyncIterableWith(results, context)[
        Symbol.asyncIterator
      ]() as Required<AsyncIterator<IteratorResult<unknown, unknown>>>;
      return {
        next: () =>
          iterator.next().then((next) => {
            if (next.done) return next;
            const result = next.value;
            return result.done ? iterator.return().then(() => result) : result;
          }),
        return: (value?: unknown) =>
          iterator.return().then(() => ({ done: true, value })),
      };
    },
  };
};

/**
 * The chunk queues of one deserialization, one per deferred value, made
 * in Effect by whichever comes first: a chunk for the value or its reader.
 * The values it builds run on the context of the fiber that made it, as
 * `Stream.toReadableStreamEffect`'s do.
 */
export interface ChunkQueues {
  readonly offer: (idx: number, item: [Status, unknown]) => Effect.Effect<void>;
  /** Fails one value with `error`, after the chunks it holds. */
  readonly fail: (idx: number, error: unknown) => Effect.Effect<void>;
  /** Fails every value with `error`, those read later too: the frames ended. */
  readonly end: (error: unknown) => Effect.Effect<void>;
  readonly builders: DeferredBuilders;
}

export type ChunkQueue = Queue.Queue<[Status, unknown], unknown>;

export const makeChunkQueues: (
  revive: (value: unknown) => unknown,
) => Effect.Effect<ChunkQueues> = Effect.fnUntraced(function* (revive) {
  const context = yield* Effect.context<never>();
  const queues = new Map<number, ChunkQueue>();
  let ended: Cause.Cause<unknown> | undefined;
  const queueFor = (idx: number): Effect.Effect<ChunkQueue> =>
    Effect.suspend(() => {
      const known = queues.get(idx);
      if (known) return Effect.succeed(known);
      return Effect.map(
        Queue.unbounded<[Status, unknown], unknown>(),
        (made) => {
          // Another fiber may have made it while this one yielded.
          const raced = queues.get(idx);
          if (raced) return raced;
          queues.set(idx, made);
          if (ended) Queue.failCauseUnsafe(made, ended);
          return made;
        },
      );
    });
  const take = (idx: number) =>
    Stream.unwrap(Effect.map(queueFor(idx), Stream.fromQueue)).pipe(
      Stream.ensuring(Effect.sync(() => queues.delete(idx))),
    );
  const iterate = (idx: number) =>
    take(idx).pipe(
      Stream.takeWhile(([status]) => status !== RETURN),
      Stream.mapEffect(([status, v]) =>
        status === VALUE ? Effect.succeed(v) : Effect.fail(revive(v)),
      ),
    );
  const runPromise = Effect.runPromiseWith(context);
  const builders: DeferredBuilders = {
    iterate,
    // Chunk queues fail, never end, so a promise always gets its chunk.
    Promise: (idx) => {
      const p = runPromise(
        iterate(idx).pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map(([v]) => v),
        ),
      );
      p.catch(() => {});
      return p;
    },
    AsyncIterable: (idx) => iterateWithReturn(take(idx), revive, context),
    // Nothing queued ahead of a read: a failure errors the stream, which
    // drops what's queued, so items before it would be lost.
    ReadableStream: (idx) =>
      Stream.toReadableStreamWith(iterate(idx), context, {
        strategy: { highWaterMark: 0 },
      }),
  };
  return {
    offer: (idx, item) =>
      Effect.flatMap(queueFor(idx), (queue) =>
        Effect.asVoid(Queue.offer(queue, item)),
      ),
    fail: (idx, error) =>
      Effect.flatMap(queueFor(idx), (queue) =>
        Effect.asVoid(Queue.failCause(queue, Cause.fail(error))),
      ),
    end: (error) =>
      Effect.sync(() => {
        const cause = (ended = Cause.fail(error));
        for (const queue of queues.values()) {
          Queue.failCauseUnsafe(queue, cause);
        }
      }),
    builders,
  };
});

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

export function deserializeStream<T, E>(
  source: Stream.Stream<Frame, E>,
  options: DeserializeStreamOptions,
): Effect.Effect<T, E | DansonError> {
  const errors = streamErrorsOf(options);
  return Effect.gen(function* () {
    const head = yield* Deferred.make<T, E | DansonError>();
    const chunks = yield* makeChunkQueues(errors.revive);
    const { iterate, ...builders } = chunks.builders;
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
          Effect.forkChild,
          Effect.as(done),
        );
      });
    const HEAD = -1;
    /** The last frame waiting for bytes, per target. */
    const tails = new Map<number, Deferred.Deferred<void, unknown>>();
    // A frame that can't be read fails its own target: the head as it is
    // (the link names it), a deferred value as a failed stream would.
    const fail = (target: number, error: unknown): Effect.Effect<void> =>
      target === HEAD
        ? Effect.asVoid(Deferred.fail(head, error as DansonError))
        : chunks.fail(target, errors.unreadable(error));
    const settle = (target: number, frame: Frame): Effect.Effect<void> =>
      target === HEAD
        ? Effect.try({
            try: () => deserializeSync<T>(frame as SerializeReturn, opts),
            catch: toDeserializeError,
          }).pipe(Deferred.into(head), Effect.asVoid)
        : Effect.try({
            try: (): [Status, unknown] => {
              const [, status, json] = frame as Chunk;
              return [
                status,
                json.json instanceof Uint8Array
                  ? json.json
                  : deserializeSync(json, opts),
              ];
            },
            catch: toDeserializeError,
          }).pipe(
            Effect.matchEffect({
              onSuccess: (item) => chunks.offer(target, item),
              onFailure: (error) => fail(target, error),
            }),
          );

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
          const waits = yield* Effect.forEach(refs, (idx) => collect(idx));
          const tail = tails.get(target);
          if (waits.length === 0 && !tail) return yield* settle(target, frame);
          const settled = Deferred.makeUnsafe<void, unknown>();
          tails.set(target, settled);
          const ready: ReadonlyArray<Deferred.Deferred<void, unknown>> = tail
            ? [tail, ...waits]
            : waits;
          yield* Effect.forEach(ready, (d) => Deferred.await(d), {
            discard: true,
          }).pipe(
            Effect.matchCauseEffect({
              onFailure: (cause) => fail(target, Cause.squash(cause)),
              onSuccess: () => settle(target, frame),
            }),
            Effect.ensuring(
              Effect.sync(() => {
                Deferred.doneUnsafe(settled, Effect.void);
                if (tails.get(target) === settled) tails.delete(target);
              }),
            ),
            Effect.forkChild,
          );
        }),
      ),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const error = errors.ended(exit);
          // Bytes already received still drain; then waiting frames settle.
          yield* Effect.forEach(
            [...bytes.keys()],
            (idx) => chunks.fail(idx, error),
            { discard: true },
          );
          yield* Effect.forEach([...tails.values()], (d) => Deferred.await(d), {
            discard: true,
          });
          // A no-op once the head is out; a head frame that failed to read leaves it open.
          yield* Deferred.done(
            head,
            Exit.isFailure(exit)
              ? Exit.failCause(exit.cause)
              : Exit.fail(errors.interrupted() as never),
          );
          yield* chunks.end(error);
        }),
      ),
      // The frames are read for as long as the deferred values they feed,
      // past the caller's fiber. Its forks are its children.
      Effect.forkDetach,
    );
    return yield* Deferred.await(head);
  });
}
