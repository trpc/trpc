/**
 * Port of danSON 0.13.1 `sync.ts` (KATT/danson, MIT). Same wire format:
 * `{ json, refs? }`, inline `{ _: '$', type, value }` custom values,
 * `$name` placeholders, `$`-prefixed strings escaped as type `string`.
 *
 * Added (proposal 11 (e)): forbidden keys and a depth limit on deserialize.
 */
import {
  counter,
  createObject,
  DansonError,
  isJsonPrimitive,
  isPlainObject,
  type JsonObject,
  type JsonValue,
} from './utils.ts';

const PREFIX = '$';

export type SerializeFn = (value: unknown) => unknown;
export interface PlaceholderTransformer<T = unknown> {
  placeholder: string;
  value: T;
}
/**
 * Custom serializers by type name.
 * @since 0.1.0
 * @stability stable
 */
export type SerializeRecord = Record<
  string,
  SerializeFn | PlaceholderTransformer
>;

export type DeserializeFn = (value: any) => unknown;
export interface DeserializeRecursive {
  create: () => unknown;
  set: (target: any, value: any) => void;
}
/**
 * Custom deserializers by type name.
 * @since 0.1.0
 * @stability stable
 */
export type DeserializeRecord = Record<
  string,
  DeserializeFn | DeserializeRecursive | PlaceholderTransformer
>;

/**
 * The serialized form of a value: its JSON and the references it shares.
 * @since 0.1.0
 * @stability stable
 */
export interface SerializeReturn {
  json?: JsonValue;
  refs?: Record<string, JsonValue>;
}

export interface CustomValue {
  _: string;
  type: string;
  value?: JsonValue;
}

/** Shared between chunks of one async serialization so refs stay unique. */
export interface SerializeState {
  indexCounter: () => number;
  refCounter: () => number;
}

export interface SerializeOptions {
  serializers?: SerializeRecord;
  dedupe?: boolean;
  state?: SerializeState;
}

type Path = (number | string)[];
type Location = [parent: JsonValue[] | JsonObject, key: number | string] | null;

function isSubPath(path: Path, sub: Path): boolean {
  if (path.length < sub.length) return false;
  for (let i = 0; i < sub.length; i++) if (path[i] !== sub[i]) return false;
  return true;
}

const placeholderOf = (v: number | string) => `${PREFIX}${v}`;

/**
 * The output is plain objects, so it passes anywhere JSON does (React Server
 * Components refuse null-prototype objects); a `__proto__` key stays an own
 * property instead of setting the prototype.
 */
function setOwn(
  target: Record<string | number, JsonValue>,
  key: string | number,
  value: JsonValue,
): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    target[key] = value;
  }
}

export function serializeSync(
  value: unknown,
  options: SerializeOptions = {},
): SerializeReturn {
  if (value === undefined) return {};

  const state = options.state ?? {
    indexCounter: counter(),
    refCounter: counter(),
  };
  const seen = new Map<unknown, [index: number, Location, Path]>();
  const refs: Record<string, JsonValue> = {};
  const replace = new Map<string, Location>();
  const indexToRef = new Map<number, string>();

  const placeholders = new Map<unknown, PlaceholderTransformer>();
  const serializers: [string, SerializeFn][] = [];
  for (const [name, s] of Object.entries(options.serializers ?? {})) {
    if (name === 'string') throw new DansonError('string is reserved');
    if (typeof s === 'function') serializers.push([name, s]);
    else placeholders.set(s.value, s);
  }

  function refFor(index: number): string {
    if (index === 1) return placeholderOf(0);
    let ref = indexToRef.get(index);
    if (!ref) {
      ref = placeholderOf(state.refCounter());
      indexToRef.set(index, ref);
    }
    return ref;
  }

  function toJson(thing: unknown, location: Location, path: Path): JsonValue {
    const existing = seen.get(thing);
    if (existing) {
      const [index, loc, existingPath] = existing;
      if (options.dedupe || isSubPath(path, existingPath)) {
        const ref = refFor(index);
        replace.set(ref, loc);
        return ref;
      }
    }
    const index = state.indexCounter();
    seen.set(thing, [index, location, path]);

    const placeholder = placeholders.get(thing);
    if (placeholder && Object.is(placeholder.value, thing)) {
      return PREFIX + placeholder.placeholder;
    }

    for (const [name, fn] of serializers) {
      const out = fn(thing);
      if (out === false) continue;
      const custom: CustomValue = { _: PREFIX, type: name };
      if (out !== undefined) {
        custom.value = toJson(
          out,
          [custom as unknown as JsonObject, 'value'],
          [...path, 'value'],
        );
      }
      return custom as unknown as JsonObject;
    }

    if (isJsonPrimitive(thing)) {
      if (typeof thing === 'string' && thing.startsWith(PREFIX)) {
        return { _: PREFIX, type: 'string', value: thing };
      }
      return thing;
    }
    if (isPlainObject(thing)) {
      const result: JsonObject = {};
      for (const key in thing) {
        setOwn(result, key, toJson(thing[key], [result, key], [...path, key]));
      }
      return result;
    }
    if (Array.isArray(thing)) {
      const result: JsonValue[] = [];
      thing.forEach((it, i) => {
        result.push(toJson(it, [result, i], [...path, i]));
      });
      return result;
    }
    throw new DansonError(
      `Do not know how to serialize ${Object.prototype.toString.call(thing)}`,
    );
  }

  const json = toJson(value, null, []);
  for (const [ref, location] of replace) {
    if (!location) continue;
    const [parent, key] = location;
    const original = (parent as Record<string | number, JsonValue>)[key]!;
    setOwn(parent as Record<string | number, JsonValue>, key, ref);
    refs[ref] = original;
  }
  const result: SerializeReturn = { json };
  if (Object.keys(refs).length > 0) result.refs = refs;
  return result;
}

export interface DeserializeOptions {
  deserializers?: DeserializeRecord;
  /** Max nesting depth of the JSON tree. @default 64 */
  maxDepth?: number;
  /** Shared across chunks of one async deserialization. */
  cache?: Map<string, unknown>;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function deserializeSync<T = unknown>(
  obj: SerializeReturn,
  options: DeserializeOptions = {},
): T {
  if (obj.json === undefined) return undefined as T;
  const refs = obj.refs ?? createObject<JsonValue>();
  const maxDepth = options.maxDepth ?? 64;
  const cache = options.cache ?? new Map<string, unknown>();
  const deserializers = new Map<string, DeserializeFn | DeserializeRecursive>();
  const placeholders = new Map<string, unknown>();
  for (const [name, d] of Object.entries(options.deserializers ?? {})) {
    if (typeof d === 'function' || 'create' in d) deserializers.set(name, d);
    else placeholders.set(PREFIX + d.placeholder, d.value);
  }
  const rootRef = placeholderOf(0);

  function fromRef(ref: string, depth: number): unknown {
    if (cache.has(ref)) return cache.get(ref);
    const result = fromJson(refs[ref]!, depth, ref);
    cache.set(ref, result);
    return result;
  }

  function fromJson(value: JsonValue, depth: number, ref?: string): unknown {
    if (depth > maxDepth) throw new DansonError('Max depth exceeded');
    if (typeof value === 'string') {
      if (placeholders.has(value)) return placeholders.get(value);
      if (Object.hasOwn(refs, value) || value === rootRef) {
        return fromRef(value, depth);
      }
    }
    if (isJsonPrimitive(value)) return value;
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      if (ref) cache.set(ref, result);
      for (const it of value) result.push(fromJson(it, depth + 1));
      return result;
    }
    if (isPlainObject(value)) {
      if (value['_'] === PREFIX && typeof value['type'] === 'string') {
        const custom = value as unknown as CustomValue;
        if (custom.type === 'string') return custom.value;
        const d = deserializers.get(custom.type);
        if (!d) {
          throw new DansonError(`No deserializer for type: ${custom.type}`);
        }
        const inner = () =>
          custom.value === undefined
            ? undefined
            : fromJson(custom.value, depth + 1);
        if (typeof d === 'function') return d(inner());
        const result = d.create();
        if (ref) cache.set(ref, result);
        d.set(result, inner());
        return result;
      }
      const result: Record<string, unknown> = {};
      if (ref) cache.set(ref, result);
      for (const [key, v] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key)) {
          throw new DansonError(`Forbidden key: ${key}`);
        }
        result[key] = fromJson(v, depth + 1);
      }
      return result;
    }
    throw new DansonError('Deserializing unknown value');
  }

  return fromJson(obj.json, 0, rootRef) as T;
}

export function stringifySync(
  value: unknown,
  options?: SerializeOptions,
): string {
  return JSON.stringify(serializeSync(value, options));
}

export function parseSync<T = unknown>(
  text: string,
  options?: DeserializeOptions,
): T {
  return deserializeSync<T>(JSON.parse(text) as SerializeReturn, options);
}
