/**
 * danSON's async format (head chunk, then `[index, status, { json, refs? }]`
 * chunks) reimplemented on Effect `Stream`. The wire format matches danSON
 * 0.13.1 `serializeAsync` / `deserializeAsync`.
 *
 * Deserialized deferred values are plain `Promise` / `AsyncIterable` /
 * `ReadableStream`, so Promise users never see Effect.
 */
import { Cause, Deferred, Effect, Exit, Queue, Scope, Stream } from 'effect';
import {
  deserializeSync,
  serializeSync,
  type DeserializeOptions,
  type SerializeOptions,
  type SerializeReturn,
} from './sync.ts';
import { counter, DansonError } from './utils.ts';

const VALUE = 0;
const ERROR = 1;
const RETURN = 2;
type Status = typeof VALUE | typeof ERROR | typeof RETURN;

export type Chunk = [index: number, status: Status, value: SerializeReturn];
export type Frame = SerializeReturn | Chunk;

const isAsyncIterable = (v: unknown): v is AsyncIterable<unknown> =>
  typeof v === 'object' && v !== null && Symbol.asyncIterator in v;
const isPromiseLike = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { then?: unknown }).then === 'function';

/** Every deferred value becomes a stream of `[status, value]` pairs. */
function sourceOf(
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

export interface SerializeStreamOptions extends SerializeOptions {
  /** Turn a failure (rejected promise, thrown iterator) into something serializable. */
  coerceError?: (cause: unknown) => unknown;
}

const toDansonError = (cause: unknown) =>
  cause instanceof DansonError
    ? cause
    : new DansonError('serialize failed', { cause });

/**
 * The head is serialized eagerly, when this is called, so every deferred value
 * is registered (and its rejection handled) before any Effect scheduling.
 * The returned stream is single-use.
 */
export function serializeStream(
  value: unknown,
  options: SerializeStreamOptions = {},
): Stream.Stream<Frame, DansonError> {
  const nextIndex = counter();
  const pending: [number, Stream.Stream<[Status, unknown]>][] = [];
  const opts: SerializeOptions = {
    ...options,
    state: { indexCounter: counter(), refCounter: counter() },
    serializers: {
      ...options.serializers,
      ReadableStream: (v) =>
        v instanceof ReadableStream ? register(v) : false,
      AsyncIterable: (v) => (isAsyncIterable(v) ? register(v) : false),
      Promise: (v) => (isPromiseLike(v) ? register(v) : false),
    },
  };
  function register(v: Parameters<typeof sourceOf>[0]): number {
    if (isPromiseLike(v)) {
      // Rejections surface as ERROR chunks once the source starts.
      Promise.resolve(v).catch(() => {});
    }
    const idx = nextIndex();
    pending.push([idx, sourceOf(v)]);
    return idx;
  }
  const serialize = (v: unknown, status: Status) =>
    Effect.try({
      try: () =>
        serializeSync(
          status === ERROR && options.coerceError ? options.coerceError(v) : v,
          opts,
        ),
      catch: toDansonError,
    });

  let head: SerializeReturn;
  try {
    head = serializeSync(value, opts);
  } catch (cause) {
    return Stream.fail(toDansonError(cause));
  }

  return Stream.callback<Frame, DansonError>((queue) =>
    Effect.gen(function* () {
      let active = 0;
      const finishOne = Effect.sync(() => {
        active--;
        if (active === 0 && pending.length === 0) Queue.endUnsafe(queue);
      });

      // Serializing a chunk may register more sources; start them too.
      const startPending: Effect.Effect<void, never, Scope.Scope> =
        Effect.suspend(() =>
          Effect.forEach(
            pending.splice(0),
            ([idx, source]) => {
              active++;
              return source.pipe(
                Stream.runForEach(([status, v]) =>
                  serialize(v, status).pipe(
                    Effect.flatMap((json) => {
                      Queue.offerUnsafe(queue, [idx, status, json]);
                      return startPending;
                    }),
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

      Queue.offerUnsafe(queue, head);
      yield* startPending;
      if (active === 0) Queue.endUnsafe(queue);
    }),
  );
}

type ChunkQueue = Queue.Queue<[Status, unknown], DansonError | Cause.Done>;

export function deserializeStream<T, E>(
  source: Stream.Stream<Frame, E>,
  options: DeserializeOptions = {},
): Effect.Effect<T, E | DansonError> {
  return Effect.gen(function* () {
    const head = yield* Deferred.make<T, E | DansonError>();
    const queues = new Map<number, ChunkQueue>();
    const queueFor = (idx: number) => {
      let q = queues.get(idx);
      if (!q) {
        q = Effect.runSync(
          Queue.unbounded<[Status, unknown], DansonError | Cause.Done>(),
        );
        queues.set(idx, q);
      }
      return q;
    };
    const take = (idx: number) =>
      Stream.fromQueue(queueFor(idx)).pipe(
        Stream.ensuring(Effect.sync(() => queues.delete(idx))),
      );

    const opts: DeserializeOptions = {
      ...options,
      cache: new Map(),
      deserializers: {
        ...options.deserializers,
        Promise: (idx: number) => {
          const p = Effect.runPromise(
            take(idx).pipe(
              Stream.runHead,
              Effect.flatMap((first) => {
                if (first._tag === 'None') {
                  return Effect.fail(new DansonError('Stream interrupted'));
                }
                const [status, v] = first.value;
                return status === VALUE ? Effect.succeed(v) : Effect.fail(v);
              }),
            ),
          );
          p.catch(() => {});
          return p;
        },
        AsyncIterable: (idx: number) => Stream.toAsyncIterable(iterate(idx)),
        ReadableStream: (idx: number) => Stream.toReadableStream(iterate(idx)),
      },
    };
    const iterate = (idx: number) =>
      take(idx).pipe(
        Stream.takeWhile(([status]) => status !== RETURN),
        Stream.mapEffect(([status, v]) =>
          status === VALUE ? Effect.succeed(v) : Effect.fail(v),
        ),
      );

    let first = true;
    yield* source.pipe(
      Stream.runForEach((frame) =>
        Effect.try({
          try: () => {
            if (first) {
              first = false;
              Deferred.doneUnsafe(
                head,
                Effect.succeed(
                  deserializeSync<T>(frame as SerializeReturn, opts),
                ),
              );
              return;
            }
            const [idx, status, json] = frame as Chunk;
            Queue.offerUnsafe(queueFor(idx), [
              status,
              deserializeSync(json, opts),
            ]);
          },
          catch: (cause) =>
            cause instanceof DansonError
              ? cause
              : new DansonError('deserialize failed', { cause }),
        }),
      ),
      Effect.onExit((exit) =>
        Effect.sync(() => {
          const error = Exit.isFailure(exit)
            ? Cause.squash(exit.cause)
            : new DansonError('Stream interrupted');
          if (first) {
            Deferred.doneUnsafe(
              head,
              Exit.isFailure(exit)
                ? Effect.failCause(exit.cause)
                : Effect.fail(new DansonError('Empty stream')),
            );
          }
          for (const q of queues.values()) {
            Queue.failCauseUnsafe(
              q,
              Cause.fail(
                error instanceof DansonError
                  ? error
                  : new DansonError('Stream failed', { cause: error }),
              ),
            );
          }
        }),
      ),
      Effect.forkDetach,
    );
    return yield* Deferred.await(head);
  });
}

// --- JSONL framing + Promise surface ------------------------------------------

export function stringifyStream(
  value: unknown,
  options?: SerializeStreamOptions,
): Stream.Stream<string, DansonError> {
  return serializeStream(value, options).pipe(
    Stream.map((frame) => `${JSON.stringify(frame)}\n`),
  );
}

export function parseStream<T, E>(
  lines: Stream.Stream<string, E>,
  options?: DeserializeOptions,
): Effect.Effect<T, E | DansonError> {
  return deserializeStream<T, E>(
    lines.pipe(
      Stream.splitLines,
      Stream.filter((line) => line.length > 0),
      Stream.map((line) => JSON.parse(line) as Frame),
    ),
    options,
  );
}

/** Promise surface: same shape as danSON's `stringifyAsync`. */
export function stringifyAsync(
  value: unknown,
  options?: SerializeStreamOptions,
): AsyncIterable<string> {
  return Stream.toAsyncIterable(stringifyStream(value, options));
}

/** Promise surface: same shape as danSON's `parseAsync`. */
export function parseAsync<T>(
  iterable: AsyncIterable<string>,
  options?: DeserializeOptions,
): Promise<T> {
  return Effect.runPromise(
    parseStream<T, DansonError>(
      Stream.fromAsyncIterable(
        iterable,
        (cause) => new DansonError('source failed', { cause }),
      ),
      options,
    ),
  );
}
