/**
 * A value could not be serialized or deserialized.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
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
  if (Object.prototype.toString.call(o) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(o) as unknown;
  return proto === null || proto === Object.prototype;
}

export function createObject<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function counter(): () => number {
  let i = 0;
  return () => ++i;
}
