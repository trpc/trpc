import type { JsonSchema } from '../internal/json-schema.ts';

type Schema = Exclude<JsonSchema, boolean>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  !(v instanceof Blob);

const asSchema = (s: unknown): Schema | undefined =>
  typeof s === 'object' && s !== null ? (s as Schema) : undefined;

function resolve(schema: Schema, root: Schema): Schema {
  const ref = schema['$ref'];
  if (typeof ref !== 'string') return schema;
  const match = /^#\/(\$defs|definitions)\/(.+)$/.exec(ref);
  const target = match
    ? asSchema(asSchema(root[match[1]!])?.[decodeURIComponent(match[2]!)])
    : undefined;
  return target ? resolve(target, root) : schema;
}

const typesOf = (schema: Schema): string[] => {
  const type = schema['type'];
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type as string[];
  if (schema['properties']) return ['object'];
  if (schema['items']) return ['array'];
  return [];
};

const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function coerceString(value: string, types: string[]): unknown {
  if (types.includes('string')) return value;
  for (const type of types) {
    if (type === 'number' && NUMBER.test(value)) return Number(value);
    if (type === 'integer' && /^-?\d+$/.test(value)) return Number(value);
    if (type === 'boolean') {
      if (value === 'true' || value === 'on') return true;
      if (value === 'false' || value === 'off') return false;
    }
    if (type === 'null' && (value === '' || value === 'null')) return null;
  }
  return value;
}

const matches = (value: unknown, schema: Schema): boolean => {
  const types = typesOf(schema);
  if ('const' in schema) return Object.is(schema['const'], value);
  if (types.length === 0) return true;
  return types.some((type) => {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      case 'array':
        return Array.isArray(value);
      case 'object':
        return isObject(value);
      default:
        return true;
    }
  });
};

/**
 * Coerces the strings of a query string, path params or a form to what the
 * input's JSON Schema expects (18 (b)): numbers, integers, booleans, `null`,
 * enum and const values, single values into arrays. Values the schema does
 * not describe are left alone, so validation still reports them.
 *
 * @example
 * ```ts
 * coerceBySchema({ limit: '10', tags: 'a' }, {
 *   type: 'object',
 *   properties: { limit: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } },
 * });
 * // { limit: 10, tags: ['a'] }
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function coerceBySchema(
  value: unknown,
  schema: JsonSchema | undefined,
  root: JsonSchema | undefined = schema,
): unknown {
  const s = asSchema(schema);
  const r = asSchema(root);
  if (!s || !r || value === undefined) return value;
  const current = resolve(s, r);

  for (const part of (current['allOf'] as JsonSchema[] | undefined) ?? []) {
    value = coerceBySchema(value, part, r);
  }
  const branches = (current['anyOf'] ?? current['oneOf']) as
    JsonSchema[] | undefined;
  if (branches) {
    for (const branch of branches) {
      const b = asSchema(branch);
      if (!b) continue;
      const candidate = coerceBySchema(value, b, r);
      if (matches(candidate, resolve(b, r))) return candidate;
    }
    return value;
  }

  const types = typesOf(current);
  if (typeof value === 'string') {
    const options = [
      ...((current['enum'] as unknown[] | undefined) ?? []),
      ...('const' in current ? [current['const']] : []),
    ];
    const option = options.find(
      (o) =>
        (typeof o === 'number' || typeof o === 'boolean' || o === null) &&
        String(o) === value,
    );
    if (option !== undefined) return option;
    if (types.includes('array') && !types.includes('string')) {
      return [coerceBySchema(value, asSchema(current['items']), r)];
    }
    return coerceString(value, types);
  }
  if (Array.isArray(value)) {
    const prefixItems = current['prefixItems'] as JsonSchema[] | undefined;
    return value.map((item, i) =>
      coerceBySchema(item, prefixItems?.[i] ?? asSchema(current['items']), r),
    );
  }
  if (isObject(value)) {
    const properties = asSchema(current['properties']) ?? {};
    const additional = asSchema(current['additionalProperties']);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        coerceBySchema(child, asSchema(properties[key]) ?? additional, r),
      ]),
    );
  }
  return value;
}

/** The schema of `key` in an object schema, looking through `allOf`. @internal */
export function propertySchema(
  schema: JsonSchema | undefined,
  key: string,
): JsonSchema | undefined {
  const s = asSchema(schema);
  if (!s) return undefined;
  const own = asSchema(s['properties'])?.[key] as JsonSchema | undefined;
  if (own !== undefined) return own;
  for (const part of (s['allOf'] as JsonSchema[] | undefined) ?? []) {
    const found = propertySchema(part, key);
    if (found !== undefined) return found;
  }
  return undefined;
}
