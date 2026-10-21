/**
 * A value could not be serialized or deserialized.
 * @since 0.1.0
 * @stability stable
 */
export class DansonError extends Error {
  override name = 'DansonError';
}

export type JsonPrimitive = boolean | null | number | string;
export type JsonArray = JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
/**
 * Any JSON value.
 * @since 0.1.0
 * @stability stable
 */
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  const type = typeof value;
  return (
    type === 'boolean' ||
    type === 'number' ||
    type === 'string' ||
    value === null
  );
}

export function isPlainObject(o: unknown): o is Record<string, unknown> {
  if (typeof o !== 'object' || o === null) return false;
  const proto = Object.getPrototypeOf(o) as unknown;
  return (
    (proto === null || proto === Object.prototype) &&
    Object.prototype.toString.call(o) === '[object Object]'
  );
}

export function counter(): () => number {
  let i = 0;
  return () => ++i;
}
