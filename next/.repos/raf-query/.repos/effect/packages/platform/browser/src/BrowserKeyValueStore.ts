/**
 * Browser-backed `KeyValueStore` layers for client-side Effect programs.
 *
 * This module provides browser implementations of the unstable persistence
 * `KeyValueStore` service. Use {@link layerLocalStorage} for small
 * origin-scoped values that should survive reloads and browser restarts, use
 * {@link layerSessionStorage} for tab / page-session state, and use
 * {@link layerIndexedDb} when the store should be asynchronous and backed by
 * IndexedDB. The IndexedDB layer requires the browser `IndexedDb` service and
 * accepts an optional database name.
 *
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import { IndexedDb } from "./IndexedDb.ts"

/**
 * Creates a `KeyValueStore` layer that uses the browser's `localStorage` API and stores values between browser sessions.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerLocalStorage: Layer.Layer<KeyValueStore.KeyValueStore> = KeyValueStore.layerStorage(() =>
  globalThis.localStorage
)

/**
 * Creates a `KeyValueStore` layer that uses the browser's `sessionStorage` API and stores values only for the current session.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerSessionStorage: Layer.Layer<KeyValueStore.KeyValueStore> = KeyValueStore.layerStorage(() =>
  globalThis.sessionStorage
)

/**
 * Creates a `KeyValueStore` layer backed by IndexedDB.
 *
 * **When to use**
 *
 * Use when you need persistent asynchronous IndexedDB storage for a browser
 * `KeyValueStore` instead of the synchronous Web Storage APIs.
 *
 * **Details**
 *
 * The database name defaults to `"effect_key_value_store"`. The layer requires
 * the `IndexedDb` service and stores string and `Uint8Array` values in the same
 * backing object store.
 *
 * **Gotchas**
 *
 * IndexedDB may be unavailable or blocked by browser settings, private browsing,
 * quota limits, or restricted contexts. The string and `Uint8Array` accessors do
 * not coerce values stored with the other representation.
 *
 * @see {@link layerLocalStorage} for synchronous persistent Web Storage
 * @see {@link layerSessionStorage} for synchronous tab-session Web Storage
 *
 * @category layers
 * @since 4.0.0
 */
export const layerIndexedDb = (options?: {
  readonly database?: string | undefined
}): Layer.Layer<KeyValueStore.KeyValueStore, never, IndexedDb> =>
  Layer.effect(KeyValueStore.KeyValueStore)(
    Effect.gen(function*() {
      const db = yield* Effect.acquireRelease(
        openDatabase(options?.database ?? "effect_key_value_store"),
        (db) => Effect.sync(() => db.close())
      ).pipe(Effect.orDie)

      return KeyValueStore.make({
        clear: Effect.suspend(() => {
          return idbWriteRequest(
            db,
            { method: "clear", message: "Failed to clear backing store" },
            (store) => store.clear()
          )
        }),
        get: (key: string) =>
          Effect.map(
            Effect.suspend(() => {
              const store = getKvsEntriesStore(db, "readonly")
              return idbRequest<{ key: string; value: string } | undefined>({
                method: "get",
                message: "Failed to get value from backing store",
                key
              }, () => store.get(key))
            }),
            (found) => typeof found?.value === "string" ? found.value : undefined
          ),
        getUint8Array: (key: string) =>
          Effect.map(
            Effect.suspend(() => {
              const store = getKvsEntriesStore(db, "readonly")
              return idbRequest<{ key: string; value: Uint8Array } | undefined>({
                method: "getUint8Array",
                message: "Failed to get value from backing store",
                key
              }, () => store.get(key))
            }),
            (found) => found?.value && found.value instanceof Uint8Array ? found.value : undefined
          ),
        has: (key: string) =>
          Effect.map(
            Effect.suspend(() => {
              const store = getKvsEntriesStore(db, "readonly")
              return idbRequest<number>({
                method: "has",
                message: "Failed to check key in backing store",
                key
              }, () => store.count(key))
            }),
            (count) => count > 0
          ),
        set: (key: string, value: string | Uint8Array) =>
          Effect.asVoid(Effect.suspend(() => {
            return idbWriteRequest(
              db,
              { method: "set", message: "Failed to set value in backing store", key },
              (store) => store.put({ key, value })
            )
          })),
        size: Effect.suspend(() => {
          const store = getKvsEntriesStore(db, "readonly")
          return idbRequest<number>(
            { method: "size", message: "Failed to get backing store size" },
            () => store.count()
          )
        }),
        remove: (key: string) =>
          Effect.asVoid(Effect.suspend(() => {
            return idbWriteRequest(
              db,
              { method: "remove", message: "Failed to remove value from backing store", key },
              (store) => store.delete(key)
            )
          }))
      })
    })
  )

const databaseVersion = 1
const entriesStoreName = "entries"
const openDatabase = Effect.fnUntraced(function*(database: string) {
  const idb = (yield* IndexedDb).indexedDB
  const openRequest = yield* Effect.try({
    try: () => idb.open(database, databaseVersion),
    catch: (cause) =>
      new KeyValueStore.KeyValueStoreError({
        method: "open",
        message: "Failed to open backing store database",
        cause
      })
  })
  openRequest.onupgradeneeded = () => {
    const db = openRequest.result
    if (!db.objectStoreNames.contains(entriesStoreName)) {
      db.createObjectStore(entriesStoreName, { keyPath: "key" })
    }
  }
  return yield* idbRequest({ method: "open", message: "Failed to open backing store database" }, () => openRequest)
})

const idbRequest = <A>(
  failArgs: { method: string; message: string; key?: string },
  evaluate: () => IDBRequest<A>
): Effect.Effect<A, KeyValueStore.KeyValueStoreError> =>
  Effect.callback<A, KeyValueStore.KeyValueStoreError>((resume) => {
    const request = evaluate()
    if (request.readyState === "done") {
      return resume(Effect.succeed(request.result))
    }
    request.onsuccess = () => {
      resume(Effect.succeed(request.result))
    }
    request.onerror = () =>
      resume(Effect.fail(
        new KeyValueStore.KeyValueStoreError({
          ...failArgs,
          cause: request.error
        })
      ))
  })

const idbWriteRequest = <A>(
  db: IDBDatabase,
  failArgs: { method: string; message: string; key?: string },
  evaluate: (store: IDBObjectStore) => IDBRequest<A>
): Effect.Effect<A, KeyValueStore.KeyValueStoreError> =>
  Effect.callback<A, KeyValueStore.KeyValueStoreError>((resume) => {
    const transaction = db.transaction(entriesStoreName, "readwrite")
    const request = evaluate(transaction.objectStore(entriesStoreName))
    let result: A
    let done = false

    const fail = (cause: unknown) => {
      if (done) return
      done = true
      resume(Effect.fail(new KeyValueStore.KeyValueStoreError({ ...failArgs, cause })))
    }

    if (request.readyState === "done") {
      result = request.result
    } else {
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => fail(request.error)
    }

    transaction.oncomplete = () => {
      if (done) return
      done = true
      resume(Effect.succeed(result!))
    }
    transaction.onerror = () => fail(transaction.error)
    transaction.onabort = () => fail(transaction.error)

    return Effect.sync(() => {
      if (!done) transaction.abort()
    })
  })

const getKvsEntriesStore = (db: IDBDatabase, mode: IDBTransactionMode) => {
  const transaction = db.transaction(entriesStoreName, mode)
  return transaction.objectStore(entriesStoreName)
}
