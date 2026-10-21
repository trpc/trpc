import { Deferred, Effect, Exit, Stream } from 'effect';
import type { JsonForm, SyncForm } from '../internal/types.ts';
import type { Transformer } from './index.ts';
import {
  deferredChunks,
  isAsyncIterable,
  isPromiseLike,
  makeChunkQueues,
  sourceOf,
  streamErrorsOf,
  toTransformerError,
  toDeserializeError,
  type Chunk,
  type PendingSource,
  type SerializeReturn,
  TransformerError,
  type JsonValue,
} from './progressive-json/index.ts';

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

/** What one walk over a value found. */
interface Scanned {
  /** The value, with its deferred values replaced by `null`. */
  readonly value: unknown;
  readonly slots: Slot[];
  /** A `File` or `Blob` sits in it. */
  readonly blob: boolean;
  /**
   * It is JSON already: `JSON.parse(JSON.stringify(value))` would give an
   * equal value, so plain JSON can skip that copy.
   */
  readonly json: boolean;
}

/**
 * Takes the deferred values out of plain objects and arrays, leaving `null`
 * in their place, and lists where they were (with no `register`, they stay).
 * Only the containers on a path to a deferred value are copied. Other
 * objects (a `Map`, a class instance) are the transformer's to handle. One
 * walk also finds `File`s and `Blob`s and whether the value is JSON as is.
 */
function scan(
  value: unknown,
  register?: (deferred: Parameters<typeof sourceOf>[0]) => number,
): Scanned {
  const slots: Slot[] = [];
  const path: Array<string | number> = [];
  // Containers being walked; shallow, so a list beats a `Set`.
  const open: object[] = [];
  let blob = false;
  let json = true;
  const walk = (v: unknown): unknown => {
    if (typeof v !== 'object' || v === null) {
      if (
        json &&
        v !== null &&
        typeof v !== 'string' &&
        typeof v !== 'boolean' &&
        !(typeof v === 'number' && Number.isFinite(v))
      ) {
        json = false;
      }
      return v;
    }
    const kind = register && kindOf(v);
    if (kind) {
      slots.push([[...path], register(v as never), kind]);
      return null;
    }
    const array = Array.isArray(v);
    if (!array && !isPlainObject(v)) {
      json = false;
      if (v instanceof Blob) blob = true;
      else if (!blob && (v instanceof Map || v instanceof Set)) {
        blob = holdsBlob(v);
      }
      return v;
    }
    if (open.includes(v)) {
      json = false;
      return v;
    }
    if (json && 'toJSON' in v) json = false;
    open.push(v);
    let copy: Record<string | number, unknown> | undefined;
    const replace = (key: string | number, item: unknown) => {
      path.push(key);
      const next = walk(item);
      path.pop();
      if (next !== item) {
        copy ??= (
          array ? [...(v as unknown[])] : { ...(v as object) }
        ) as never;
        copy![key] = next;
      }
    };
    if (array) {
      const items = v as unknown[];
      for (let i = 0; i < items.length; i++) replace(i, items[i]);
    } else {
      for (const key of Object.keys(v)) replace(key, v[key]);
    }
    open.pop();
    return copy ?? v;
  };
  const out = walk(value);
  return { value: out, slots, blob, json };
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
    throw new TransformerError('A deferred value has no place in the result');
  }
  parent[path[path.length - 1]!] = value;
  return target;
}

/**
 * Whether a `File` or `Blob` sits in `value`, or in the containers a
 * transformer walks (plain objects, arrays, `Map`s and `Set`s): it would turn
 * one into `{}` instead of failing.
 */
function holdsBlob(value: unknown, seen = new Set<object>()): boolean {
  if (value instanceof Blob) return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);
  const children: Iterable<unknown> = Array.isArray(value)
    ? value
    : value instanceof Map
      ? [...value.keys(), ...value.values()]
      : value instanceof Set
        ? value
        : isPlainObject(value)
          ? Object.values(value)
          : [];
  for (const child of children) {
    if (holdsBlob(child, seen)) return true;
  }
  return false;
}

function framedTransformer(
  name: string,
  kind: 'sync' | 'none',
  transformer: SyncTransformer,
): Transformer<any> {
  const encode = (scanned: Scanned): SerializeReturn => {
    if (scanned.blob) {
      throw new TransformerError(
        'A File or Blob needs a streaming transformer such as experimental_createProgressiveJson(); a root file output can be a raw response instead',
      );
    }
    if (kind === 'none' && scanned.json) {
      return { json: scanned.value as JsonValue };
    }
    const json = transformer.serialize(scanned.value);
    return json === undefined ? {} : { json: json as JsonValue };
  };
  const serialize = (value: unknown): SerializeReturn => encode(scan(value));
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
        (v) => Effect.try({ try: () => payload(v), catch: toTransformerError }),
        opts?.coerceError,
      );
      return { head, chunks };
    },
    deserializeStream: <T, E>(
      frames: Stream.Stream<SerializeReturn | Chunk, E>,
      opts: Parameters<Transformer['deserializeStream']>[1] = {},
    ): Effect.Effect<T, E | TransformerError> => {
      const errors = streamErrorsOf(opts);
      return Effect.gen(function* () {
        const head = yield* Deferred.make<T, E | TransformerError>();
        const chunks = yield* makeChunkQueues(errors.revive);
        const revivePayload = (p: FramedPayload): unknown => {
          let v: unknown = deserialize(p);
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
    },
  };
}

/**
 * Options for {@link createSyncTransformer}.
 * @since 0.1.0
 * @stability stable
 */
export interface SyncTransformerOptions {
  /**
   * Names the format in the `trpc-transformer` header, so a link with another
   * transformer fails clearly.
   * @default 'sync'
   */
  name?: string;
}

/**
 * A transformer from a sync transformer (superjson, devalue). `TKeeps` lists
 * the types it rebuilds, so client types show the rest in JSON form.
 *
 * The transport streams promises and async iterables in plain objects and
 * arrays, at any depth. `File`/`Blob` values need `experimental_createProgressiveJson()`. GET
 * inputs are sent as `?input=<serialized JSON>`. Inputs are deserialized by
 * the transformer as they are; it decides what is safe to accept.
 *
 * @example
 * ```ts
 * import superjson from 'superjson';
 * export const transformer = createSyncTransformer<Date | Map<any, any> | Set<any> | bigint | undefined>(superjson, { name: 'superjson' });
 * createFetchHandler({ router, transformer });
 * httpLink({ url, transformer }); // client types keep Date, Map, Set, bigint
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createSyncTransformer<TKeeps = never>(
  transformer: SyncTransformer,
  opts: SyncTransformerOptions = {},
): Transformer<SyncForm<TKeeps>> {
  return framedTransformer(opts.name ?? 'sync', 'sync', transformer);
}

/**
 * Plain `JSON`, the default transformer. Client types show outputs in JSON
 * form (`Date` → `string`, `undefined` keys dropped); promises and async
 * iterables nested in plain objects and arrays still stream.
 *
 * @example
 * ```ts
 * createFetchHandler({ router }); // jsonTransformer
 * httpLink({ url }); // jsonTransformer
 * ```
 * @since 0.1.0
 * @stability stable
 */
export const jsonTransformer: Transformer<JsonForm> =
  /* @__PURE__ */ framedTransformer('json', 'none', {
    serialize: (value) => {
      const text = JSON.stringify(value);
      return text === undefined ? undefined : JSON.parse(text);
    },
    deserialize: (value) => value,
  });
