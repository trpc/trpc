/**
 * Effect's `BackingPersistence` on a Durable Object's storage, so
 * `experimental_durable()` keeps results and streamed frames in the object
 * and they outlive an eviction.
 */
import { Effect, Layer } from 'effect';
import { KeyValueStore, Persistence } from 'effect/persistence';

const attempt = <A>(method: string, run: () => Promise<A>, key?: string) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new KeyValueStore.KeyValueStoreError({
        message: `Durable Object storage ${method} failed`,
        method,
        ...(key === undefined ? {} : { key }),
        cause,
      }),
  });

/** `makeStringOnly()`'s options with `keys` and `clearPrefix`, which effect 4.1 added. */
type StoreOptions = KeyValueStore.MakeStringOptions & {
  readonly keys: Effect.Effect<
    ReadonlyArray<string>,
    KeyValueStore.KeyValueStoreError
  >;
  readonly clearPrefix: (
    prefix: string,
  ) => Effect.Effect<void, KeyValueStore.KeyValueStoreError>;
};

/** A `KeyValueStore` on `storage`, every key under `prefix`. */
export const durableObjectStore = (
  storage: DurableObjectStorage,
  prefix = 'kv:',
): KeyValueStore.KeyValueStore => {
  const list = async (under = '') => [
    ...(await storage.list({ prefix: prefix + under })).keys(),
  ];
  const deleteUnder = async (under = '') => {
    const keys = await list(under);
    for (let i = 0; i < keys.length; i += 128) {
      await storage.delete(keys.slice(i, i + 128));
    }
  };
  const options: StoreOptions = {
    get: (key) => attempt('get', () => storage.get<string>(prefix + key), key),
    set: (key, value) =>
      attempt('set', () => storage.put(prefix + key, value), key),
    remove: (key) =>
      attempt('remove', () => storage.delete(prefix + key).then(() => {}), key),
    clear: attempt('clear', () => deleteUnder()),
    clearPrefix: (under) => attempt('clearPrefix', () => deleteUnder(under)),
    size: attempt('size', async () => (await list()).length),
    keys: attempt('keys', async () =>
      (await list()).map((key) => key.slice(prefix.length)),
    ),
  };
  return KeyValueStore.makeStringOnly(options);
};

/** `BackingPersistence` for `experimental_durable()` on `storage`. */
export const durableObjectPersistence = (
  storage: DurableObjectStorage,
): Layer.Layer<Persistence.BackingPersistence> =>
  Persistence.layerBackingKvs.pipe(
    Layer.provide(
      Layer.succeed(KeyValueStore.KeyValueStore, durableObjectStore(storage)),
    ),
  );
