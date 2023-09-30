export type PlainObject = Record<string, unknown>;

export const isPlainObject = (payload: unknown): payload is PlainObject => {
  if (typeof payload !== 'object' || payload === null) return false;
  if (payload === Object.prototype) return false;
  if (Object.getPrototypeOf(payload) === null) return true;

  return Object.getPrototypeOf(payload) === Object.prototype;
};

export const isPlainObjectOrArray = (
  payload: unknown,
): payload is PlainObject | unknown[] => {
  return Array.isArray(payload) || isPlainObject(payload);
};

export function map(
  objOrArray: PlainObject | unknown[],
  fn: (val: unknown, key: number | string) => unknown,
): PlainObject | unknown[] {
  if (Array.isArray(objOrArray)) {
    return objOrArray.map(fn);
  }
  const result: PlainObject = {};
  for (const [key, value] of Object.entries(objOrArray)) {
    result[key] = fn(value, key);
  }
  return result;
}
