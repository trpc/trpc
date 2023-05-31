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
