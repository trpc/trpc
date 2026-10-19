/**
 * QP-C (proposal 11 (c)): legible GET params. Bracket notation for structure,
 * relaxed-JSON leaves, `$Type:value` for custom types whose serialized value
 * is a string. Built on the danSON JSON tree, so every danSON type works.
 *
 * Falls back to QP-A (`$input=<danSON JSON>`) for non-object roots, refs,
 * and object keys that bracket notation cannot represent canonically.
 */
import {
  deserializeSync,
  serializeSync,
  type DeserializeOptions,
  type SerializeOptions,
} from './sync.ts';
import { DansonError, isPlainObject, type JsonValue } from './utils.ts';

export const FALLBACK_PARAM = '$input';

type Entry = [key: string, value: string];

const isIndex = (s: string) => /^(0|[1-9]\d*)$/.test(s);
const badKey = (k: string) =>
  k === '' || isIndex(k) || /[[\]]/.test(k) || k.startsWith('$');

/** JSON-level leaf decoding; the encoder quotes any string this would not round-trip. */
function decodeLeaf(raw: string): JsonValue {
  if (raw.startsWith('$')) {
    const m = /^\$([A-Za-z_]\w*):(.*)$/s.exec(raw);
    if (m) return { _: '$', type: m[1]!, value: m[2]! };
    return raw; // danSON placeholder: $undefined, $NaN, $-0, …
  }
  if (raw === '[]') return [];
  if (raw === '{}') return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v === 'string') {
      return v.startsWith('$') ? { _: '$', type: 'string', value: v } : v;
    }
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      return v;
    }
  } catch {
    // Not JSON: keep the raw string.
  }
  return raw;
}

function encodeLeaf(v: JsonValue): string | null {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') {
    return JSON.stringify(v);
  }
  if (typeof v === 'string') {
    if (v.startsWith('$')) return v; // only danSON placeholders reach here
    return decodeLeaf(v) === v ? v : JSON.stringify(v);
  }
  if (Array.isArray(v)) return v.length === 0 ? '[]' : null;
  if (Object.keys(v).length === 0) return '{}';
  if (v['_'] === '$' && typeof v['type'] === 'string') {
    if (v['type'] === 'string') return JSON.stringify(v['value']);
    if (typeof v['value'] === 'string' && /^[A-Za-z_]\w*$/.test(v['type'])) {
      return `$${v['type']}:${v['value']}`;
    }
  }
  return null;
}

function flatten(prefix: string, v: JsonValue, out: Entry[]): boolean {
  const leaf = encodeLeaf(v);
  if (leaf !== null) {
    out.push([prefix, leaf]);
    return true;
  }
  if (Array.isArray(v)) {
    const leaves = v.map(encodeLeaf);
    if (leaves.every((l) => l !== null)) {
      for (const l of leaves) out.push([`${prefix}[]`, l]);
      return true;
    }
    return v.every((it, i) => flatten(`${prefix}[${i}]`, it, out));
  }
  const obj = v as Record<string, JsonValue>;
  return Object.keys(obj).every(
    (k) =>
      !(badKey(k) && !(k === '_' && obj['_'] === '$')) &&
      flatten(`${prefix}[${k}]`, obj[k]!, out),
  );
}

export function toQueryEntries(
  input: unknown,
  options?: SerializeOptions,
): Entry[] {
  const { json, refs } = serializeSync(input, options);
  const fallback = (): Entry[] => [
    [FALLBACK_PARAM, JSON.stringify({ json, refs })],
  ];
  if (json === undefined) return [];
  if (refs || !isPlainObject(json)) return fallback();
  const out: Entry[] = [];
  for (const [k, v] of Object.entries(json)) {
    if (badKey(k) || !flatten(k, v, out)) return fallback();
  }
  return out;
}

/** Keeps `[]`, `$` and `:` readable; everything else as `encodeURIComponent`. */
export function encodeLegible(entries: Entry[]): string {
  const enc = (s: string) =>
    encodeURIComponent(s)
      .replace(/%5B/g, '[')
      .replace(/%5D/g, ']')
      .replace(/%24/g, '$')
      .replace(/%3A/g, ':')
      .replace(/%20/g, '+');
  return entries.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
}

function parseKey(key: string): string[] {
  const m = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(key);
  if (!m) throw new DansonError(`Malformed key: ${key}`);
  const segments = [m[1]!];
  for (const s of m[2]!.matchAll(/\[([^[\]]*)\]/g)) segments.push(s[1]!);
  return segments;
}

export function fromQueryEntries<T = unknown>(
  entries: Iterable<Entry>,
  options?: DeserializeOptions,
): T {
  const list = [...entries];
  const fallback = list.find(([k]) => k === FALLBACK_PARAM);
  if (fallback) return deserializeSync<T>(JSON.parse(fallback[1]), options);
  if (list.length === 0) return undefined as T;

  const root: Record<string, JsonValue> = Object.create(null);
  for (const [key, raw] of list) {
    const segments = parseKey(key);
    let container: Record<string, JsonValue> | JsonValue[] = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const last = i === segments.length - 1;
      const nextSeg = segments[i + 1];
      const make = (): JsonValue =>
        last
          ? decodeLeaf(raw)
          : nextSeg === '' || isIndex(nextSeg!)
            ? []
            : Object.create(null);
      if (Array.isArray(container)) {
        if (seg !== '' && !isIndex(seg)) {
          throw new DansonError(`Expected array index in ${key}`);
        }
        const idx = seg === '' ? container.length : Number(seg);
        if (idx > container.length) {
          throw new DansonError(`Non-contiguous index in ${key}`);
        }
        if (last || container[idx] === undefined) container[idx] = make();
        if (!last) container = container[idx] as typeof container;
      } else {
        if (
          seg === '' ||
          ['__proto__', 'constructor', 'prototype'].includes(seg)
        ) {
          throw new DansonError(`Bad key segment in ${key}`);
        }
        if (last || !(seg in container)) container[seg] = make();
        if (!last) container = container[seg] as typeof container;
      }
      if (!last && (container === null || typeof container !== 'object')) {
        throw new DansonError(`Conflicting key ${key}`);
      }
    }
  }
  return deserializeSync<T>({ json: root }, options);
}

export function toSearch(input: unknown, options?: SerializeOptions): string {
  return encodeLegible(toQueryEntries(input, options));
}

export function fromSearch<T = unknown>(
  search: string,
  options?: DeserializeOptions,
): T {
  return fromQueryEntries<T>(new URLSearchParams(search), options);
}
