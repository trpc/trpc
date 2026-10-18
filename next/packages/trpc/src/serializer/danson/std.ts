/** Port of danSON 0.13.1 `std.ts`: built-in types, same names and shapes. */
import {
  instancesOnly,
  type DeserializeRecord,
  type PlaceholderTransformer,
  type SerializeRecord,
} from './sync.ts';

const typedArrays = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  (globalThis as unknown as { Float16Array?: Float32ArrayConstructor })
    .Float16Array,
].filter((c) => c !== undefined);

const placeholder = <T>(name: string, value: T): PlaceholderTransformer<T> => ({
  placeholder: name,
  value,
});
const undefinedValue = placeholder('undefined', undefined);
const infinity = placeholder('Infinity', Infinity);
const negativeInfinity = placeholder('-Infinity', -Infinity);
const negativeZero = placeholder('-0', -0);
const nan = placeholder('NaN', NaN);

const dateToJson: unknown = Object.getOwnPropertyDescriptor(
  Date.prototype,
  'toJSON',
)?.value;
// Same result as `toJSON` (null when invalid) without its generic lookups.
const dateToString = (v: Date) =>
  v.toJSON !== dateToJson
    ? v.toJSON()
    : Number.isFinite(v.getTime())
      ? v.toISOString()
      : null;

export const serializers: SerializeRecord = {
  BigInt: (v) => (typeof v === 'bigint' ? v.toString() : false),
  Date: instancesOnly((v) => (v instanceof Date ? dateToString(v) : false)),
  Headers: instancesOnly((v) =>
    v instanceof Headers ? Array.from(v.entries()) : false,
  ),
  infinity,
  Map: instancesOnly((v) =>
    v instanceof Map ? Array.from(v.entries()) : false,
  ),
  NaN: nan,
  negativeInfinity,
  negativeZero,
  RegExp: instancesOnly((v) =>
    v instanceof RegExp ? [v.source, v.flags] : false,
  ),
  Set: instancesOnly((v) =>
    v instanceof Set ? Array.from(v.values()) : false,
  ),
  TypedArray: instancesOnly((v) => {
    if (!ArrayBuffer.isView(v)) return false;
    for (const Ctor of typedArrays) {
      if (v instanceof Ctor) return [Ctor.name, Array.from(v as never)];
    }
    return false;
  }),
  undefined: undefinedValue,
  URL: instancesOnly((v) => (v instanceof URL ? v.href : false)),
  URLSearchParams: instancesOnly((v) =>
    v instanceof URLSearchParams ? v.toString() : false,
  ),
};

export const deserializers: DeserializeRecord = {
  BigInt: (v: string) => BigInt(v),
  // `null` is an invalid date, as `toJSON` sent it.
  Date: (v: string | null) => new Date(v ?? NaN),
  Headers: {
    create: () => new Headers(),
    set: (h: Headers, entries: [string, string][]) => {
      for (const [k, v] of entries) h.append(k, v);
    },
  },
  infinity,
  Map: {
    create: () => new Map(),
    set: (m: Map<unknown, unknown>, entries: [unknown, unknown][]) => {
      for (const [k, v] of entries) m.set(k, v);
    },
  },
  NaN: nan,
  negativeInfinity,
  negativeZero,
  RegExp: ([source, flags]: [string, string]) => new RegExp(source, flags),
  Set: {
    create: () => new Set(),
    set: (s: Set<unknown>, values: unknown[]) => {
      for (const v of values) s.add(v);
    },
  },
  TypedArray: ([name, data]: [string, number[]]) => {
    const Ctor = typedArrays.find((c) => c.name === name);
    if (!Ctor) throw new Error(`Unknown typed array: ${name}`);
    return new Ctor(data as never);
  },
  undefined: undefinedValue,
  URL: (v: string) => new URL(v),
  URLSearchParams: (v: string) => new URLSearchParams(v),
};

/** Proposal 11 (e): `RegExp` is output-only by default (ReDoS). */
export const inputDeserializers: DeserializeRecord = Object.fromEntries(
  Object.entries(deserializers).filter(([name]) => name !== 'RegExp'),
);
