import { Cause, Deferred, Effect, Exit, Queue, Stream } from 'effect';
import type { JsonForm, SyncForm } from '../internal/types.ts';
import type { Serializer } from './index.ts';
import {
  deferredBuilders,
  deferredChunks,
  isAsyncIterable,
  isPromiseLike,
  sourceOf,
  streamErrorsOf,
  toDansonError,
  toDeserializeError,
  type Chunk,
  type ChunkQueue,
  type PendingSource,
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
 * @since 0.1.0
 * @stability stable
 */
export interface SyncTransformer {
  serialize(value: unknown): unknown;
  deserialize(value: any): unknown;
}

type Kind = 'Promise' | 'AsyncIterable' | 'ReadableStream';

/** Where a deferred value sat: its path in the value, chunk index and kind. */
type Slot = [path: Array<string | number>, index: number, kind: Kind];

/** A framed value: the transformer's JSON, plus the deferred values it held. */
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

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Takes the deferred values out of plain objects and arrays, leaving `null`
 * in their place, and lists where they were. Only the containers on a path to
 * a deferred value are copied. Other objects (a `Map`, a class instance) are
 * the transformer's to handle.
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

function framedSerializer(
  name: string,
  kind: 'sync' | 'none',
  transformer: SyncTransformer,
): Serializer<any> {
  const serialize = (value: unknown): SerializeReturn => {
    if (value instanceof Blob) {
      throw new DansonError(
        'A File or Blob needs a streaming serializer such as createSerializer(); a root file output can be a raw response instead',
      );
    }
    const json = transformer.serialize(value);
    return json === undefined ? {} : { json: json as JsonValue };
  };
  const deserialize = (value: SerializeReturn): any =>
    value.json === undefined ? undefined : transformer.deserialize(value.json);

  return {
    name,
    kind,
    serialize,
    deserialize,
    serializeDeferred: (value, opts) => {
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
        const out = serialize(holed.value);
        return holed.slots.length > 0 ? { ...out, d: holed.slots } : out;
      };
      const head = payload(value);
      if (pending.length === 0) return { head, chunks: undefined };
      const chunks = deferredChunks(
        pending,
        (v) => Effect.try({ try: () => payload(v), catch: toDansonError }),
        opts?.coerceError,
      );
      return { head, chunks };
    },
    deserializeStream: <T, E>(
      frames: Stream.Stream<SerializeReturn | Chunk, E>,
      opts: Parameters<Serializer['deserializeStream']>[1] = {},
    ): Effect.Effect<T, E | DansonError> => {
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
          let v: unknown = deserialize(p);
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
    },
  };
}

/**
 * Options for {@link createSyncSerializer}.
 * @since 0.1.0
 * @stability stable
 */
export interface SyncSerializerOptions {
  /**
   * Names the format in the `trpc-serializer` header, so a link with another
   * serializer fails clearly.
   * @default 'sync'
   */
  name?: string;
}

/**
 * A serializer from a sync transformer (superjson, devalue). `TKeeps` lists
 * the types it rebuilds, so client types show the rest in JSON form.
 *
 * The transport streams promises and async iterables in plain objects and
 * arrays, at any depth. `File`/`Blob` values need `createSerializer()`. GET
 * inputs are sent as `?input=<serialized JSON>`. Inputs are deserialized by
 * the transformer as they are; it decides what is safe to accept.
 *
 * @example
 * ```ts
 * import superjson from 'superjson';
 * export const serializer = createSyncSerializer<Date | Map<any, any> | Set<any> | bigint | undefined>(superjson, { name: 'superjson' });
 * createFetchHandler({ router, serializer });
 * httpLink({ url, serializer }); // client types keep Date, Map, Set, bigint
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createSyncSerializer<TKeeps = never>(
  transformer: SyncTransformer,
  opts: SyncSerializerOptions = {},
): Serializer<SyncForm<TKeeps>> {
  return framedSerializer(opts.name ?? 'sync', 'sync', transformer);
}

/**
 * Plain `JSON`, the default serializer. Client types show outputs in JSON
 * form (`Date` → `string`, `undefined` keys dropped); promises and async
 * iterables nested in plain objects and arrays still stream.
 *
 * @example
 * ```ts
 * createFetchHandler({ router }); // jsonSerializer
 * httpLink({ url }); // jsonSerializer
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const jsonSerializer: Serializer<JsonForm> = framedSerializer(
  'json',
  'none',
  {
    serialize: (value) => {
      const text = JSON.stringify(value);
      return text === undefined ? undefined : JSON.parse(text);
    },
    deserialize: (value) => value,
  },
);
