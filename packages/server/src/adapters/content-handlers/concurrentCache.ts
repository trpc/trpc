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
