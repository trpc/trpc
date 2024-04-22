/**
 * A simple concurrent cache that ensures that only one promise is created for a given key.
 */
export function createConcurrentCache() {
  const cache = new Map<string, Promise<any>>();

  return {
    async concurrentSafeGet<TValue>(
      key: string,
      setter: () => Promise<TValue>,
    ): Promise<TValue> {
      if (!cache.has(key)) {
        cache.set(key, setter());
      }

      return cache.get(key);
    },
  };
}
