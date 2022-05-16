/**
 * Ensures there are no duplicate keys when building a procedure.
 */
export function mergeWithoutOverrides<T extends Record<string, unknown>>(
  obj1: T,
  ...objs: Partial<T>[]
): T {
  const newObj: T = Object.assign(Object.create(null), obj1);

  for (const overrides of objs) {
    for (const key in overrides) {
      if (key in newObj && newObj[key] !== overrides[key]) {
        throw new Error(`Duplicate key ${key}`);
      }
      newObj[key as keyof T] = overrides[key] as T[keyof T];
    }
  }
  return newObj;
}
