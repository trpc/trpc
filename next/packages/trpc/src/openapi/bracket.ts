/**
 * Bracket notation (18 (b)) for query strings and form bodies:
 * `user[name]=ada&tags[]=a&tags[]=b&items[0][id]=1`. Leaves stay strings
 * (or `Blob`s in forms); the handler coerces them from the input's JSON
 * Schema.
 */

type Leaf = string | Blob;
type Tree = { [key: string]: Node } | Node[];
type Node = Leaf | Tree;

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
const isIndex = (s: string) => /^(0|[1-9]\d{0,5})$/.test(s);

function segmentsOf(key: string): string[] {
  const match = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(key);
  if (!match) return [key];
  const segments = [match[1]!];
  for (const s of match[2]!.matchAll(/\[([^[\]]*)\]/g)) segments.push(s[1]!);
  return segments;
}

/**
 * Parses bracket-notation entries into nested objects and arrays. A key
 * repeated without brackets (`tag=a&tag=b`) becomes an array.
 *
 * @example
 * ```ts
 * parseBracketNotation(new URLSearchParams('a[b]=1&tags[]=x&tags[]=y'));
 * // { a: { b: '1' }, tags: ['x', 'y'] }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function parseBracketNotation(
  entries: Iterable<[string, Leaf]>,
): Record<string, unknown> {
  const root: Record<string, Node> = {};
  for (const [key, value] of entries) {
    const segments = segmentsOf(key);
    if (segments.some((s) => UNSAFE.has(s))) continue;
    let container: Tree = root;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const last = i === segments.length - 1;
      const next = segments[i + 1];
      const make = (): Node =>
        last ? value : next === '' || isIndex(next!) ? [] : {};
      if (Array.isArray(container)) {
        const index =
          segment !== '' &&
          isIndex(segment) &&
          Number(segment) <= container.length
            ? Number(segment)
            : container.length;
        if (last || container[index] === undefined) container[index] = make();
        if (last) break;
        container = container[index] as Tree;
      } else {
        const existing = container[segment];
        if (last) {
          if (existing === undefined) container[segment] = value;
          else if (Array.isArray(existing)) existing.push(value);
          else container[segment] = [existing as Leaf, value];
          break;
        }
        if (
          existing === undefined ||
          typeof existing === 'string' ||
          existing instanceof Blob
        ) {
          container[segment] = make();
        }
        container = container[segment] as Tree;
      }
    }
  }
  return root;
}

/**
 * Turns a value into bracket-notation entries: the inverse of
 * {@link parseBracketNotation}. `undefined` is skipped, `null` is `''`,
 * dates are ISO strings and `Blob`s stay as they are.
 *
 * @example
 * ```ts
 * new URLSearchParams(toBracketNotation({ a: { b: 1 }, tags: ['x', 'y'] }) as string[][]);
 * // a[b]=1&tags[]=x&tags[]=y
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function toBracketNotation(
  value: unknown,
  prefix = '',
): Array<[string, Leaf]> {
  const out: Array<[string, Leaf]> = [];
  const visit = (v: unknown, key: string) => {
    if (v === undefined) return;
    if (v === null) out.push([key, '']);
    else if (v instanceof Blob) out.push([key, v]);
    else if (v instanceof Date) out.push([key, v.toISOString()]);
    else if (Array.isArray(v)) {
      const flat = v.every((item) => typeof item !== 'object' || item === null);
      v.forEach((item, i) => visit(item, flat ? `${key}[]` : `${key}[${i}]`));
    } else if (typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        visit(child, key ? `${key}[${k}]` : k);
      }
    } else out.push([key, String(v as string | number | boolean | bigint)]);
  };
  visit(value, prefix);
  return out;
}
