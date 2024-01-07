/**
 * Check that value is object
 * @internal
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

type KeyFromValue<TValue, TType extends Record<PropertyKey, PropertyKey>> = {
  [K in keyof TType]: TValue extends TType[K] ? K : never;
}[keyof TType];

type Invert<TType extends Record<PropertyKey, PropertyKey>> = {
  [TValue in TType[keyof TType]]: KeyFromValue<TValue, TType>;
};
/**
 * @internal
 */
export function invert<TRecord extends Record<PropertyKey, PropertyKey>>(
  obj: TRecord,
): Invert<TRecord> {
  const newObj = Object.create(null);
  for (const key in obj) {
    const v = obj[key];
    newObj[v] = key;
  }
  return newObj;
}

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
 * @internal
 */
export function identity<TType>(x: TType): TType {
  return x;
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
