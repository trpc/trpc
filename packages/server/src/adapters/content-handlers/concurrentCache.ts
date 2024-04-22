/**
 * A simple concurrent cache that ensures that only one promise is created for a given key.
 */
export function createConcurrentCache() {
  const cache = new Map<string, any>();

  return {
    concurrentSafeGet<TValue>(key: string, setter: () => TValue): TValue {
      if (!cache.has(key)) {
        cache.set(key, setter());
      }

      return cache.get(key) as TValue;
    },
  };
}
