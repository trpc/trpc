import type { JsonForm, SyncForm } from '../internal/types.ts';
import type { Serializer } from './index.ts';
import {
  isAsyncIterable,
  isPromiseLike,
  type SerializeReturn,
  DansonError,
  type JsonValue,
} from './danson/index.ts';

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

/**
 * Where a deferred value sat: its path in the value, chunk index and kind.
 * @internal
 */
export type Slot = [path: Array<string | number>, index: number, kind: Kind];

/**
 * A framed value: the transformer's JSON, plus the deferred values it held.
 * @internal
 */
export interface FramedPayload extends SerializeReturn {
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
 * What one walk over a value found.
 * @internal
 */
export interface Scanned {
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
 * @internal
 */
export function scan(
  value: unknown,
  register?: (
    deferred:
      | ReadableStream<unknown>
      | AsyncIterable<unknown>
      | PromiseLike<unknown>,
  ) => number,
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

function framedSerializer(
  name: string,
  kind: 'sync' | 'none',
  transformer: SyncTransformer,
): Serializer<any> {
  const encode = (scanned: Scanned): SerializeReturn => {
    if (scanned.blob) {
      throw new DansonError(
        'A File or Blob needs a streaming serializer such as createSerializer(); a root file output can be a raw response instead',
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
    '~encode': encode,
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
export const jsonSerializer: Serializer<JsonForm> =
  /* @__PURE__ */ framedSerializer('json', 'none', {
    serialize: (value) => {
      const text = JSON.stringify(value);
      return text === undefined ? undefined : JSON.parse(text);
    },
    deserialize: (value) => value,
  });
