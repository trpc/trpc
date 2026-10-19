import type { JsonForm, SyncForm } from '../internal/types.ts';
import type { Serializer } from './index.ts';
import {
  DansonError,
  type JsonValue,
  type SerializeReturn,
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

/** @internal */
export const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

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
  const serialize = (value: unknown): SerializeReturn => {
    if (holdsBlob(value)) {
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
