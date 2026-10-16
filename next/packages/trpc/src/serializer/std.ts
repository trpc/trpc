/** Port of danSON 0.13.1 `std.ts`: built-in types, same names and shapes. */
import type {
  DeserializeRecord,
  PlaceholderTransformer,
  SerializeRecord,
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
] as const;

const placeholder = <T>(name: string, value: T): PlaceholderTransformer<T> => ({
  placeholder: name,
  value,
});
const undefinedValue = placeholder('undefined', undefined);
const infinity = placeholder('Infinity', Infinity);
const negativeInfinity = placeholder('-Infinity', -Infinity);
const negativeZero = placeholder('-0', -0);
const nan = placeholder('NaN', NaN);

export const serializers: SerializeRecord = {
  BigInt: (v) => (typeof v === 'bigint' ? v.toString() : false),
  Date: (v) => (v instanceof Date ? v.toJSON() : false),
  Headers: (v) => (v instanceof Headers ? Array.from(v.entries()) : false),
  infinity,
  Map: (v) => (v instanceof Map ? Array.from(v.entries()) : false),
  NaN: nan,
  negativeInfinity,
  negativeZero,
  RegExp: (v) => (v instanceof RegExp ? [v.source, v.flags] : false),
  Set: (v) => (v instanceof Set ? Array.from(v.values()) : false),
  TypedArray: (v) => {
    for (const Ctor of typedArrays) {
      if (v instanceof Ctor) return [Ctor.name, Array.from(v as never)];
    }
    return false;
  },
  undefined: undefinedValue,
  URL: (v) => (v instanceof URL ? v.href : false),
  URLSearchParams: (v) => (v instanceof URLSearchParams ? v.toString() : false),
};

export const deserializers: DeserializeRecord = {
  BigInt: (v: string) => BigInt(v),
  Date: (v: string) => new Date(v),
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
