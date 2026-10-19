import { Cause, Effect, FiberSet, Queue, Stream } from 'effect';
import { backpressure, returnUnawaited } from '../../internal/effects.ts';
import {
  isAsyncIterable,
  isPromiseLike,
  isPlainObject,
} from '../../serializer/danson/index.ts';

const PROMISE = 0;
const ITERABLE = 1;
const FULFILLED = 0;
const REJECTED = 1;
const RETURN = 0;
const YIELD = 1;
const ERROR = 2;

type Path = ReadonlyArray<string | number>;
type Encoded = [[unknown] | [], ...Array<[string | null, number, number]>];

/** What `jsonlLines` needs from the handler. @internal */
export interface JsonlOptions {
  /** The transformer's `serialize`, applied to every line. */
  readonly serialize: (value: unknown) => unknown;
  /** The v11 shape of a deferred value's failure at `path` (`path[0]` is the call's index). */
  readonly formatError: (cause: Cause.Cause<unknown>, path: Path) => unknown;
}

const isDeferred = (value: unknown) =>
  Effect.isEffect(value) ||
  isPromiseLike(value) ||
  isAsyncIterable(value) ||
  Stream.isStream(value);

/**
 * v11's JSON Lines (`httpBatchStreamLink`): a head line maps each key of
 * `data` to its value, with deferred values (an `Effect`, a `Promise`, an
 * `AsyncIterable` or a `Stream`) at the root or at a top-level key as
 * placeholders; `[id, status, value]` lines follow as each one settles.
 * @internal
 */
export const jsonlLines = (
  data: Record<string, unknown>,
  opts: JsonlOptions,
): Stream.Stream<string> =>
  Stream.callback<string>(
    (queue) =>
      Effect.gen(function* () {
        const fibers = yield* FiberSet.make<void, never>();
        const fork = yield* FiberSet.runtime(fibers)<never>();
        let counter = 0;
        const emit = (line: unknown) =>
          Effect.asVoid(
            Queue.offer(queue, `${JSON.stringify(opts.serialize(line))}\n`),
          );

        /** Emits `line(encoded)`, then starts the deferred values it holds. */
        const send = (
          value: unknown,
          path: Path,
          line: (encoded: Encoded) => unknown,
        ) =>
          Effect.suspend(() => {
            const started: Array<() => void> = [];
            return Effect.andThen(
              emit(line(encode(value, path, started))),
              Effect.sync(() => {
                for (const start of started) start();
              }),
            );
          });

        const register = (
          value: unknown,
          path: Path,
          started: Array<() => void>,
        ): [number, number] => {
          const id = counter++;
          const failed = (status: number) => (cause: Cause.Cause<unknown>) =>
            emit([id, status, opts.formatError(cause, path)]);
          if (isAsyncIterable(value) || Stream.isStream(value)) {
            const stream = Stream.isStream(value)
              ? (value as Stream.Stream<unknown, unknown>)
              : Stream.fromAsyncIterable(
                  returnUnawaited(value),
                  (cause) => cause,
                );
            started.push(() =>
              fork(
                Stream.runForEach(stream, (item) =>
                  send(item, path, (encoded) => [id, YIELD, encoded]),
                ).pipe(
                  Effect.matchCauseEffect({
                    onSuccess: () => emit([id, RETURN, [[]]]),
                    onFailure: failed(ERROR),
                  }),
                ),
              ),
            );
            return [ITERABLE, id];
          }
          const settle = Effect.isEffect(value)
            ? (value as Effect.Effect<unknown, unknown>)
            : Effect.tryPromise({
                try: () => Promise.resolve(value),
                catch: (cause) => cause,
              });
          started.push(() =>
            fork(
              settle.pipe(
                Effect.matchCauseEffect({
                  onSuccess: (resolved) =>
                    send(resolved, path, (encoded) => [id, FULFILLED, encoded]),
                  onFailure: failed(REJECTED),
                }),
              ),
            ),
          );
          return [PROMISE, id];
        };

        const encode = (
          value: unknown,
          path: Path,
          started: Array<() => void>,
        ): Encoded => {
          if (value === undefined) return [[]];
          if (isDeferred(value)) {
            return [[0], [null, ...register(value, path, started)]];
          }
          if (!isPlainObject(value)) return [[value]];
          const shallow: Record<string, unknown> = {};
          const defs: Array<[string, number, number]> = [];
          for (const [key, item] of Object.entries(value)) {
            if (!isDeferred(item)) {
              shallow[key] = item;
              continue;
            }
            shallow[key] = 0;
            defs.push([key, ...register(item, [...path, key], started)]);
          }
          return [[shallow], ...defs];
        };

        const started: Array<() => void> = [];
        const head: Record<string, Encoded> = {};
        for (const [key, value] of Object.entries(data)) {
          head[key] = encode(value, [key], started);
        }
        yield* emit(head);
        for (const start of started) start();
        yield* FiberSet.awaitEmpty(fibers);
        yield* Queue.end(queue);
      }),
    backpressure,
  );
