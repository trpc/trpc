/**
 * A simple concurrent cache that ensures that only one promise is created for a given key.
 */
export function createConcurrentCache() {
  const cache = new Map<string, any>();

  return {
    concurrentSafeGet<TValue>(
      key: string,
      setter: () => TValue,
    ): TValue extends Promise<infer TInner>
      ? Promise<[TInner, null] | [null, Error]>
      : TValue {
      if (!cache.has(key)) {
        let value = setter();

        if (value instanceof Promise) {
          value = value
            .then((inner) => [inner, null])
            .catch((err) => [null, err]) as any;
        }

        cache.set(key, value);
      }

      return cache.get(key);
    },
  };
}
