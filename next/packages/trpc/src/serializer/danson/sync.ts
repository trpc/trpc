/**
 * Port of danSON 0.13.1 `sync.ts` (KATT/danson, MIT). Same wire format:
 * `{ json, refs? }`, inline `{ _: '$', type, value }` custom values,
 * `$name` placeholders, `$`-prefixed strings escaped as type `string`.
 *
 * Added (proposal 11 (e)): forbidden keys and a depth limit on deserialize.
 * Changed for speed, same output: a record's serializers are sorted once, and
 * values skip the ones marked `objectsOnly` / `instancesOnly` that can't match.
 */
import {
  counter,
  DansonError,
  isJsonPrimitive,
  isPlainObject,
  type JsonObject,
  type JsonValue,
} from './utils.ts';

const PREFIX = '$';

/**
 * Returns `false` for values it doesn't handle. `context` is what the
 * serialization was given as `context`, for serializers that need state.
 */
export type SerializeFn = (value: unknown, context?: any) => unknown;
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
  serializers: SerializeRecord;
  dedupe?: boolean | undefined;
  state?: SerializeState;
  /** Passed to every serializer as its second argument. */
  context?: unknown;
}

type Location = [parent: JsonValue[] | JsonObject, key: number | string] | null;

const placeholderOf = (v: number | string) => `${PREFIX}${v}`;

const PRIMITIVE = 0;
const PLAIN = 1;
const ARRAY = 2;
const INSTANCE = 3;

const objectOnly = new WeakSet<SerializeFn>();
const instanceOnly = new WeakSet<SerializeFn>();

/**
 * Marks a serializer that returns `false` for every value that isn't an
 * object, so strings, numbers, booleans and `null` skip it.
 */
export function objectsOnly<F extends SerializeFn>(fn: F): F {
  objectOnly.add(fn);
  return fn;
}

/**
 * Marks a serializer that returns `false` for everything but class
 * instances (`instanceof` checks), so primitives, plain objects and arrays
 * skip it.
 */
export function instancesOnly<F extends SerializeFn>(fn: F): F {
  instanceOnly.add(fn);
  return fn;
}

type Serializers = ReadonlyArray<readonly [string, SerializeFn]>;
interface CompiledSerializers {
  readonly all: Serializers;
  /** For plain objects and arrays. */
  readonly plain: Serializers;
  readonly primitive: Serializers;
  readonly placeholders: ReadonlyMap<unknown, PlaceholderTransformer>;
}

const compiledSerializers = new WeakMap<SerializeRecord, CompiledSerializers>();

/** A record's serializers, sorted once; records are not changed after use. */
function compileSerializers(record: SerializeRecord): CompiledSerializers {
  const cached = compiledSerializers.get(record);
  if (cached) return cached;
  const all: [string, SerializeFn][] = [];
  const plain: [string, SerializeFn][] = [];
  const primitive: [string, SerializeFn][] = [];
  const placeholders = new Map<unknown, PlaceholderTransformer>();
  for (const [name, s] of Object.entries(record)) {
    if (name === 'string') throw new DansonError('string is reserved');
    if (typeof s === 'function') {
      all.push([name, s]);
      if (instanceOnly.has(s)) continue;
      plain.push([name, s]);
      if (!objectOnly.has(s)) primitive.push([name, s]);
    } else {
      placeholders.set(s.value, s);
    }
  }
  const compiled: CompiledSerializers = { all, plain, primitive, placeholders };
  compiledSerializers.set(record, compiled);
  return compiled;
}

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
  options: SerializeOptions,
): SerializeReturn {
  if (value === undefined) return {};

  const state = options.state ?? {
    indexCounter: counter(),
    refCounter: counter(),
  };
  const dedupe = options.dedupe === true;
  const context = options.context;
  const serializers = compileSerializers(options.serializers);
  const seen = new Map<unknown, [index: number, Location]>();
  /** The values being serialized around the current one; a repeat is a cycle. */
  const ancestors = new Set<unknown>();
  let replace: Map<string, Location> | undefined;
  let indexToRef: Map<number, string> | undefined;

  function refFor(index: number): string {
    if (index === 1) return placeholderOf(0);
    indexToRef ??= new Map();
    let ref = indexToRef.get(index);
    if (!ref) {
      ref = placeholderOf(state.refCounter());
      indexToRef.set(index, ref);
    }
    return ref;
  }

  function toJson(thing: unknown, location: Location): JsonValue {
    const isObject =
      thing !== null &&
      (typeof thing === 'object' || typeof thing === 'function');
    // Only objects can be their own ancestors; dedupe shares primitives too.
    const tracked = isObject || dedupe;
    if (tracked) {
      const existing = seen.get(thing);
      if (existing && (dedupe || ancestors.has(thing))) {
        const ref = refFor(existing[0]);
        (replace ??= new Map()).set(ref, existing[1]);
        return ref;
      }
    }
    const index = state.indexCounter();
    if (tracked) seen.set(thing, [index, location]);

    const placeholder = serializers.placeholders.get(thing);
    if (placeholder && Object.is(placeholder.value, thing)) {
      return PREFIX + placeholder.placeholder;
    }

    const shape = !isObject
      ? PRIMITIVE
      : Array.isArray(thing)
        ? ARRAY
        : isPlainObject(thing)
          ? PLAIN
          : INSTANCE;
    for (const [name, fn] of shape === INSTANCE
      ? serializers.all
      : shape === PRIMITIVE
        ? serializers.primitive
        : serializers.plain) {
      const out = fn(thing, context);
      if (out === false) continue;
      const custom: CustomValue = { _: PREFIX, type: name };
      if (out !== undefined) {
        ancestors.add(thing);
        custom.value = toJson(out, [custom as unknown as JsonObject, 'value']);
        ancestors.delete(thing);
      }
      return custom as unknown as JsonObject;
    }

    if (shape === PRIMITIVE) {
      if (isJsonPrimitive(thing)) {
        if (typeof thing === 'string' && thing.startsWith(PREFIX)) {
          return { _: PREFIX, type: 'string', value: thing };
        }
        return thing;
      }
    } else if (shape === PLAIN) {
      const result: JsonObject = {};
      ancestors.add(thing);
      const object = thing as Record<string, unknown>;
      for (const key in object) {
        setOwn(result, key, toJson(object[key], [result, key]));
      }
      ancestors.delete(thing);
      return result;
    } else if (shape === ARRAY) {
      const result: JsonValue[] = [];
      ancestors.add(thing);
      (thing as unknown[]).forEach((it, i) => {
        result.push(toJson(it, [result, i]));
      });
      ancestors.delete(thing);
      return result;
    }
    throw new DansonError(
      `Do not know how to serialize ${Object.prototype.toString.call(thing)}`,
    );
  }

  const json = toJson(value, null);
  const result: SerializeReturn = { json };
  if (replace) {
    const refs: Record<string, JsonValue> = {};
    let any = false;
    for (const [ref, location] of replace) {
      if (!location) {
        // The root of a chunk after the head: it isn't `$0`, so it moves to `refs`.
        if (ref === placeholderOf(0)) continue;
        refs[ref] = json;
        result.json = ref;
        any = true;
        continue;
      }
      const [parent, key] = location;
      const original = (parent as Record<string | number, JsonValue>)[key]!;
      setOwn(parent as Record<string | number, JsonValue>, key, ref);
      refs[ref] = original;
      any = true;
    }
    if (any) result.refs = refs;
  }
  return result;
}

export interface DeserializeOptions {
  deserializers: DeserializeRecord;
  /** Max nesting depth of the JSON tree. @default 64 */
  maxDepth?: number | undefined;
  /** Shared across chunks of one async deserialization. */
  cache?: Map<string, unknown>;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

interface CompiledDeserializers {
  readonly deserializers: ReadonlyMap<
    string,
    DeserializeFn | DeserializeRecursive
  >;
  readonly placeholders: ReadonlyMap<string, unknown>;
}

const compiledDeserializers = new WeakMap<
  DeserializeRecord,
  CompiledDeserializers
>();

function compileDeserializers(
  record: DeserializeRecord,
): CompiledDeserializers {
  const cached = compiledDeserializers.get(record);
  if (cached) return cached;
  const deserializers = new Map<string, DeserializeFn | DeserializeRecursive>();
  const placeholders = new Map<string, unknown>();
  for (const [name, d] of Object.entries(record)) {
    if (typeof d === 'function' || 'create' in d) deserializers.set(name, d);
    else placeholders.set(PREFIX + d.placeholder, d.value);
  }
  const compiled: CompiledDeserializers = { deserializers, placeholders };
  compiledDeserializers.set(record, compiled);
  return compiled;
}

export function deserializeSync<T = unknown>(
  obj: SerializeReturn,
  options: DeserializeOptions,
): T {
  if (obj.json === undefined) return undefined as T;
  const refs = obj.refs;
  const maxDepth = options.maxDepth ?? 64;
  let cache = options.cache;
  const compiled = compileDeserializers(options.deserializers);
  const rootRef = placeholderOf(0);
  const remember = (ref: string, value: unknown) =>
    (cache ??= new Map()).set(ref, value);

  function fromRef(ref: string, depth: number): unknown {
    if (cache?.has(ref)) return cache.get(ref);
    const result = fromJson(refs?.[ref] as JsonValue, depth, ref);
    remember(ref, result);
    return result;
  }

  function fromJson(value: JsonValue, depth: number, ref?: string): unknown {
    if (depth > maxDepth) throw new DansonError('Max depth exceeded');
    if (typeof value === 'string') {
      if (compiled.placeholders.has(value))
        return compiled.placeholders.get(value);
      if (
        value === rootRef ||
        (refs !== undefined && Object.hasOwn(refs, value))
      ) {
        return fromRef(value, depth);
      }
      return value;
    }
    if (isJsonPrimitive(value)) return value;
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      if (ref) remember(ref, result);
      for (const it of value) result.push(fromJson(it, depth + 1));
      return result;
    }
    if (isPlainObject(value)) {
      if (value['_'] === PREFIX && typeof value['type'] === 'string') {
        const custom = value as unknown as CustomValue;
        if (custom.type === 'string') return custom.value;
        const d = compiled.deserializers.get(custom.type);
        if (!d) {
          throw new DansonError(`No deserializer for type: ${custom.type}`);
        }
        const inner = () =>
          custom.value === undefined
            ? undefined
            : fromJson(custom.value, depth + 1);
        if (typeof d === 'function') return d(inner());
        const result = d.create();
        if (ref) remember(ref, result);
        d.set(result, inner());
        return result;
      }
      const result: Record<string, unknown> = {};
      if (ref) remember(ref, result);
      for (const key of Object.keys(value)) {
        if (FORBIDDEN_KEYS.has(key)) {
          throw new DansonError(`Forbidden key: ${key}`);
        }
        result[key] = fromJson(value[key]!, depth + 1);
      }
      return result;
    }
    throw new DansonError('Deserializing unknown value');
  }

  return fromJson(obj.json, 0, rootRef) as T;
}
