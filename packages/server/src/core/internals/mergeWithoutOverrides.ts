/**
 * Ensures there are no duplicate keys when building a procedure.
 */
export function mergeWithoutOverrides<T extends Record<string, unknown>>(
  obj1: T,
  obj2: Partial<T>,
): T {
  for (const key in obj2) {
    if (key in obj1 && obj1[key] !== obj2[key]) {
      throw new Error(`Duplicate key ${key}`);
    }
  }
  return {
    ...obj1,
    ...obj2,
  };
}
