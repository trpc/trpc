import { Cause, Deferred, Effect, Exit, Queue, Stream } from 'effect';
import type { JsonForm, SyncForm } from '../internal/types.ts';
import type { Serializer } from './index.ts';
import {
  ERROR,
  isAsyncIterable,
  isPromiseLike,
  iterateWithReturn,
  RETURN,
  sourceOf,
  VALUE,
  type Chunk,
  type Status,
} from './stream.ts';
import type { SerializeReturn } from './sync.ts';
import { DansonError, type JsonValue } from './utils.ts';

/**
 * A whole-value transformer: superjson, devalue, or your own. `serialize`
 * must return something `JSON.stringify` can carry.
 *
 * @example
 * ```ts
 * import superjson from 'superjson';
 * const transformer: SyncTransformer = superjson;
 * const devalueTransformer: SyncTransformer = { serialize: devalue.stringify, deserialize: devalue.parse };
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SyncTransformer {
  serialize(value: unknown): unknown;
  deserialize(value: any): unknown;
}

type Root = 'Promise' | 'AsyncIterable' | 'ReadableStream';

/** A framed stream's head: which deferred value the root is, if any. */
interface FramedHead extends SerializeReturn {
  root?: Root;
}

const rootOf = (v: unknown): Root | undefined =>
  v instanceof ReadableStream
    ? 'ReadableStream'
    : isAsyncIterable(v)
      ? 'AsyncIterable'
      : isPromiseLike(v)
        ? 'Promise'
        : undefined;

const toDansonError = (cause: unknown) =>
  cause instanceof DansonError
    ? cause
    : new DansonError('serialize failed', { cause });

function framedSerializer(
  kind: 'sync' | 'none',
  transformer: SyncTransformer,
): Serializer<any> {
  const serialize = (value: unknown): SerializeReturn => {
    if (value instanceof Blob) {
      throw new DansonError(
        'A File or Blob needs a streaming serializer (the default); a root file output can be a raw response instead',
      );
    }
    const json = transformer.serialize(value);
    return json === undefined ? {} : { json: json as JsonValue };
  };
  const deserialize = (value: SerializeReturn): any =>
    value.json === undefined ? undefined : transformer.deserialize(value.json);

  return {
    kind,
    serialize,
    deserialize,
    serializeDeferred: (value, opts) => {
      const root = rootOf(value);
      if (!root) return { head: serialize(value), chunks: undefined };
      if (isPromiseLike(value)) Promise.resolve(value).catch(() => {});
      const head: FramedHead = { root };
      const chunks = sourceOf(value as never).pipe(
        Stream.mapEffect(([status, v]) =>
          Effect.try({
            try: (): Chunk => [
              0,
              status,
              serialize(
                status === ERROR && opts?.coerceError ? opts.coerceError(v) : v,
              ),
            ],
            catch: toDansonError,
          }),
        ),
      );
      return { head, chunks };
    },
    deserializeStream: <T, E>(
      frames: Stream.Stream<SerializeReturn | Chunk, E>,
      opts: Parameters<Serializer['deserializeStream']>[1] = {},
    ): Effect.Effect<T, E | DansonError> => {
      const revive = opts.reviveError ?? ((v: unknown) => v);
      const failed =
        opts.streamFailed ??
        ((cause: unknown) => new DansonError('Stream failed', { cause }));
      const interrupted =
        opts.streamInterrupted ?? (() => new DansonError('Stream interrupted'));
      return Effect.gen(function* () {
        const head = yield* Deferred.make<FramedHead, E | DansonError>();
        const queue = yield* Queue.unbounded<[Status, unknown], unknown>();
        let first = true;
        yield* frames.pipe(
          Stream.runForEach((frame) =>
            Effect.try({
              try: () => {
                if (first) {
                  first = false;
                  Deferred.doneUnsafe(
                    head,
                    Effect.succeed(frame as FramedHead),
                  );
                  return;
                }
                const [, status, json] = frame as Chunk;
                Queue.offerUnsafe(queue, [status, deserialize(json)]);
              },
              catch: (cause) =>
                cause instanceof DansonError
                  ? cause
                  : new DansonError('deserialize failed', { cause }),
            }),
          ),
          Effect.onExit((exit) =>
            Effect.sync(() => {
              const failure = Exit.isFailure(exit)
                ? exit.cause.reasons.find(Cause.isFailReason)
                : undefined;
              const error = failure
                ? failure.error
                : Exit.isFailure(exit)
                  ? failed(Cause.squash(exit.cause))
                  : interrupted();
              if (first) {
                Deferred.doneUnsafe(
                  head,
                  Exit.isFailure(exit)
                    ? Effect.failCause(exit.cause)
                    : Effect.fail(interrupted() as never),
                );
              }
              Queue.failCauseUnsafe(queue, Cause.fail(error));
            }),
          ),
          Effect.forkDetach,
        );
        const h = yield* Deferred.await(head);
        if (!h.root) return deserialize(h) as T;
        const source = Stream.fromQueue(queue);
        if (h.root === 'AsyncIterable') {
          return iterateWithReturn(source, revive) as T;
        }
        const values = source.pipe(
          Stream.takeWhile(([status]) => status !== RETURN),
          Stream.mapEffect(([status, v]) =>
            status === VALUE ? Effect.succeed(v) : Effect.fail(revive(v)),
          ),
        );
        if (h.root === 'ReadableStream') {
          return Stream.toReadableStream(values) as T;
        }
        const promise = Effect.runPromise(
          values.pipe(
            Stream.runHead,
            Effect.flatMap((v) =>
              v._tag === 'None'
                ? Effect.fail(interrupted())
                : Effect.succeed(v.value),
            ),
          ),
        );
        promise.catch(() => {});
        return promise as T;
      });
    },
    toSearch: (value) =>
      `input=${encodeURIComponent(JSON.stringify(serialize(value).json ?? null))}`,
    fromSearch: (search) => {
      const raw = new URLSearchParams(search).get('input');
      if (raw === null) return undefined as never;
      return deserialize({ json: JSON.parse(raw) as JsonValue });
    },
  };
}

/**
 * A serializer from a sync transformer (superjson, devalue). `TKeeps` lists
 * the types it rebuilds, so client types show the rest in JSON form.
 *
 * The transport frames root generators, streams and promises; nested ones,
 * and `File`/`Blob` values, need a streaming serializer. GET inputs are sent
 * as `?input=<serialized JSON>`. Inputs are deserialized by the transformer
 * as they are; it decides what is safe to accept.
 *
 * @example
 * ```ts
 * import superjson from 'superjson';
 * export const serializer = createSyncSerializer<Date | Map<any, any> | Set<any> | bigint | undefined>(superjson);
 * const t = initTrpc<{ ctx: Context; serializer: typeof serializer }>();
 * createFetchHandler({ router, serializer });
 * httpLink({ url, serializer });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createSyncSerializer<TKeeps = never>(
  transformer: SyncTransformer,
): Serializer<SyncForm<TKeeps>> {
  return framedSerializer('sync', transformer);
}

/**
 * No serializer: plain `JSON`. Client types show outputs in JSON form
 * (`Date` → `string`, `undefined` keys dropped).
 *
 * @example
 * ```ts
 * const t = initTrpc<{ serializer: typeof jsonSerializer }>();
 * createFetchHandler({ router, serializer: jsonSerializer });
 * httpLink({ url, serializer: jsonSerializer });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const jsonSerializer: Serializer<JsonForm> = framedSerializer('none', {
  serialize: (value) => {
    const text = JSON.stringify(value);
    return text === undefined ? undefined : JSON.parse(text);
  },
  deserialize: (value) => value,
});
