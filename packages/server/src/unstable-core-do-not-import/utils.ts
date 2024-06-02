/** @internal */
export const unsetMarker = Symbol('unsetMarker');
export type UnsetMarker = typeof unsetMarker;

/**
 * Ensures there are no duplicate keys when building a procedure.
 * @internal
 */
export function mergeWithoutOverrides<TType extends Record<string, unknown>>(
  obj1: TType,
  ...objs: Partial<TType>[]
): TType {
  const newObj: TType = Object.assign(Object.create(null), obj1);

  for (const overrides of objs) {
    for (const key in overrides) {
      if (key in newObj && newObj[key] !== overrides[key]) {
        throw new Error(`Duplicate key ${key}`);
      }
      newObj[key as keyof TType] = overrides[key] as TType[keyof TType];
    }
  }
  return newObj;
}

/**
 * Check that value is object
 * @internal
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

type AnyFn = ((...args: any[]) => unknown) & Record<keyof any, unknown>;
export function isFunction(fn: unknown): fn is AnyFn {
  return typeof fn === 'function';
}

/**
 * Create an object without inheriting anything from `Object.prototype`
 * @internal
 */
export function omitPrototype<TObj extends Record<string, unknown>>(
  obj: TObj,
): TObj {
  return Object.assign(Object.create(null), obj);
}

const asyncIteratorsSupported =
  typeof Symbol === 'function' && !!Symbol.asyncIterator;

export function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return (
    asyncIteratorsSupported && isObject(value) && Symbol.asyncIterator in value
  );
}

/**
 * Run an IIFE
 */
export const run = <TValue>(fn: () => TValue): TValue => fn();
