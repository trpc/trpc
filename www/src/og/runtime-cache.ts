/**
 * Effect's `BackingPersistence` on Vercel's Runtime Cache (`getCache()`
 * from `@vercel/functions`), which the server's instances in a region
 * share, so `Persistence` keeps what the social cards fetch across them
 * (`live.ts`). Any store with `RuntimeCache`'s shape will do: tests give
 * it a map, and another host would give it its own.
 *
 * It uses the cache's own expiry, unlike `Persistence.layerBackingKvs`,
 * which keeps an expiry inside each value and would leave entries in the
 * cache for good. A call that fails or takes over `callTimeout` is a miss
 * or is dropped, so a card never waits on, or fails with, the cache.
 */
import { Duration, Effect, Layer } from 'effect';
import { Persistence } from 'effect/persistence';

/** What this needs of a cache: Vercel's `RuntimeCache` has it. */
export interface RuntimeCacheStore {
  readonly get: (key: string) => Promise<unknown>;
  readonly set: (
    key: string,
    value: unknown,
    options: { readonly tags: Array<string>; readonly ttl?: number },
  ) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly expireTag: (tag: string) => Promise<void>;
}

/** How long a call to the cache may take before it's a miss or dropped. */
const callTimeout = '1 second';

const attempt = <A>(call: () => Promise<A>) =>
  Effect.tryPromise(call).pipe(Effect.timeout(callTimeout), Effect.option);

/**
 * `BackingPersistence` on `cache`: each store's entries under its id and
 * tagged with it, so clearing a store expires its tag.
 */
export const layerBackingRuntimeCache = (cache: RuntimeCacheStore) =>
  Layer.succeed(
    Persistence.BackingPersistence,
    Persistence.BackingPersistence.of({
      make: (storeId) =>
        Effect.sync(() => {
          const keyOf = (key: string) => `${storeId}\n${key}`;
          const get = (key: string) =>
            attempt(() => cache.get(keyOf(key))).pipe(
              Effect.map((found) =>
                found._tag === 'Some' &&
                typeof found.value === 'object' &&
                found.value !== null
                  ? found.value
                  : undefined,
              ),
            );
          const set = (
            key: string,
            value: object,
            ttl: Duration.Duration | undefined,
          ) => {
            // The cache takes whole seconds, and may take 0 as no expiry.
            const seconds =
              ttl === undefined
                ? undefined
                : Math.floor(Duration.toSeconds(ttl));
            if (seconds !== undefined && seconds < 1) {
              return Effect.void;
            }
            return attempt(() =>
              cache.set(keyOf(key), value, {
                tags: [storeId],
                ...(seconds === undefined ? {} : { ttl: seconds }),
              }),
            ).pipe(Effect.asVoid);
          };
          return {
            clear: attempt(() => cache.expireTag(storeId)).pipe(Effect.asVoid),
            get,
            getMany: (keys) =>
              Effect.forEach(keys, get, { concurrency: 'unbounded' }),
            remove: (key) =>
              attempt(() => cache.delete(keyOf(key))).pipe(Effect.asVoid),
            set,
            setMany: (entries) =>
              Effect.forEach(
                entries,
                ([key, value, ttl]) => set(key, value, ttl),
                {
                  concurrency: 'unbounded',
                  discard: true,
                },
              ),
          };
        }),
    }),
  );
