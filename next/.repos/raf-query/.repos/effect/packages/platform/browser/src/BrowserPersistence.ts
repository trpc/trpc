/**
 * IndexedDB-backed persistence layers for browser Effect programs.
 *
 * This module provides a low-level `BackingPersistence` layer and a higher-level
 * `Persistence` layer that store object values in IndexedDB. Values are stored
 * by persistence store id and key, and reads check TTL expiration before
 * returning stored data. The database name can be customized and defaults to
 * `"effect_persistence"`.
 *
 * @since 4.0.0
 */
import type * as Arr from "effect/Array"
import * as Clock from "effect/Clock"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Persistence from "effect/persistence/Persistence"

/**
 * Creates a `BackingPersistence` layer backed by IndexedDB, optionally using the provided database name.
 *
 * **When to use**
 *
 * Use when composing persistence manually and the lower-level
 * `BackingPersistence` service should be backed by browser IndexedDB.
 *
 * **Details**
 *
 * The database name defaults to `"effect_persistence"`. Entries are stored by
 * persistence store id and key in a shared object store, and TTL expiration is
 * checked when values are read.
 *
 * **Gotchas**
 *
 * Opening the database is defected during layer acquisition if IndexedDB is
 * unavailable or cannot be opened. Store operations report `PersistenceError`
 * for IndexedDB request, transaction, quota, and structured-clone failures.
 *
 * @see {@link layerIndexedDb} for providing the higher-level `Persistence` service
 *
 * @category layers
 * @since 4.0.0
 */
export const layerBackingIndexedDb = (options?: {
  readonly database?: string | undefined
}): Layer.Layer<Persistence.BackingPersistence> =>
  Layer.effect(Persistence.BackingPersistence)(Effect.gen(function*() {
    const db = yield* Effect.acquireRelease(
      openDatabase(options?.database ?? defaultDatabase),
      (db) => Effect.sync(() => db.close())
    ).pipe(Effect.orDie)

    return Persistence.BackingPersistence.of({
      make: Effect.fnUntraced(function*(storeId) {
        const clock = yield* Clock.Clock
        return {
          get: (key) => get(db, clock, storeId, key),
          getMany: (keys) => getMany(db, clock, storeId, keys),
          set: (key, value, ttl) => set(db, clock, storeId, key, value, ttl),
          setMany: (entries) => setMany(db, clock, storeId, entries),
          remove: (key) => remove(db, storeId, key),
          clear: clear(db, storeId)
        }
      })
    })
  }))

const defaultDatabase = "effect_persistence"
const databaseVersion = 1
const entriesStoreName = "entries"
const storeIdIndexName = "storeId"

/**
 * Creates a `Persistence` layer backed by IndexedDB, optionally using the provided database name.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerIndexedDb = (options?: {
  readonly database?: string | undefined
}): Layer.Layer<Persistence.Persistence> =>
  Persistence.layer.pipe(
    Layer.provide(layerBackingIndexedDb(options))
  )

const openDatabase = (database: string): Effect.Effect<IDBDatabase, Persistence.PersistenceError> =>
  Effect.gen(function*() {
    const openRequest = yield* Effect.try({
      try: () => globalThis.indexedDB.open(database, databaseVersion),
      catch: (cause) =>
        new Persistence.PersistenceError({
          message: "Failed to open backing store database",
          cause
        })
    })

    openRequest.onupgradeneeded = () => {
      const db = openRequest.result
      const entries = db.objectStoreNames.contains(entriesStoreName)
        ? openRequest.transaction?.objectStore(entriesStoreName)
        : db.createObjectStore(entriesStoreName, { keyPath: ["storeId", "id"] })
      if (entries && !entries.indexNames.contains(storeIdIndexName)) {
        entries.createIndex(storeIdIndexName, storeIdIndexName, { unique: false })
      }
    }

    return yield* idbRequest("Failed to open backing store database", () => openRequest)
  })

interface EntryRow {
  readonly storeId: string
  readonly id: string
  readonly value: object
  readonly expires: number | null
}

const isExpired = (row: EntryRow, now: number): boolean => row.expires !== null && row.expires <= now

const get = (
  db: IDBDatabase,
  clock: Clock.Clock,
  storeId: string,
  key: string
): Effect.Effect<object | undefined, Persistence.PersistenceError> =>
  withEntriesTransaction<object | undefined>(
    db,
    "readwrite",
    `Failed to get key ${key} from backing store`,
    (
      entries,
      setResult,
      fail
    ) => {
      const now = clock.currentTimeMillisUnsafe()
      const id: [string, string] = [storeId, key]
      const request = entries.get(id)
      request.onerror = () => fail(request.error)
      request.onsuccess = () => {
        const row = request.result as EntryRow | undefined
        if (!row || !isExpired(row, now)) {
          setResult(row?.value)
          return
        }

        const deleteRequest = entries.delete(id)
        deleteRequest.onerror = () => fail(deleteRequest.error)
        deleteRequest.onsuccess = () => setResult(undefined)
      }
    }
  )

const getMany = (
  db: IDBDatabase,
  clock: Clock.Clock,
  storeId: string,
  keys: Arr.NonEmptyArray<string>
): Effect.Effect<Arr.NonEmptyArray<object | undefined>, Persistence.PersistenceError> =>
  withEntriesTransaction(
    db,
    "readwrite",
    "Failed to getMany from backing store",
    (entries, setResult, fail) => {
      const now = clock.currentTimeMillisUnsafe()
      const results = new Array<object | undefined>(keys.length)
      setResult(results as any)

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const keyPath = [storeId, key]
        const request = entries.get(keyPath)
        request.onerror = () => fail(request.error)
        request.onsuccess = () => {
          const row = request.result as EntryRow | undefined
          if (!row) return
          else if (!isExpired(row, now)) {
            results[i] = row.value
            return
          }
          const deleteRequest = entries.delete(keyPath)
          deleteRequest.onerror = () => fail(deleteRequest.error)
        }
      }
    }
  )

const set = (
  db: IDBDatabase,
  clock: Clock.Clock,
  storeId: string,
  key: string,
  value: object,
  ttl: Duration.Duration | undefined
): Effect.Effect<void, Persistence.PersistenceError> =>
  withEntriesTransaction(
    db,
    "readwrite",
    `Failed to set key ${key} in backing store`,
    (entries, setResult, fail) => {
      const request = entries.put(
        {
          storeId,
          id: key,
          value,
          expires: Persistence.unsafeTtlToExpires(clock, ttl)
        } satisfies EntryRow
      )
      request.onerror = () => fail(request.error)
      request.onsuccess = () => setResult(undefined)
    }
  )

const setMany = (
  db: IDBDatabase,
  clock: Clock.Clock,
  storeId: string,
  entries: Arr.NonEmptyArray<readonly [key: string, value: object, ttl: Duration.Duration | undefined]>
): Effect.Effect<void, Persistence.PersistenceError> =>
  withEntriesTransaction(
    db,
    "readwrite",
    "Failed to setMany in backing store",
    (store, setResult, fail) => {
      for (const [key, value, ttl] of entries) {
        const request = store.put(
          {
            storeId,
            id: key,
            value,
            expires: Persistence.unsafeTtlToExpires(clock, ttl)
          } satisfies EntryRow
        )
        request.onerror = () => fail(request.error)
        request.onsuccess = () => setResult(undefined)
      }
    }
  )

const remove = (
  db: IDBDatabase,
  storeId: string,
  key: string
): Effect.Effect<void, Persistence.PersistenceError> =>
  withEntriesTransaction(
    db,
    "readwrite",
    `Failed to remove key ${key} from backing store`,
    (entries, setResult, fail) => {
      const request = entries.delete([storeId, key])
      request.onerror = () => fail(request.error)
      request.onsuccess = () => setResult(undefined)
    }
  )

const clear = (db: IDBDatabase, storeId: string): Effect.Effect<void, Persistence.PersistenceError> =>
  withEntriesTransaction(db, "readwrite", "Failed to clear backing store", (entries, setResult, fail) => {
    const index = entries.index(storeIdIndexName)
    const cursorRequest = index.openCursor(storeId)
    cursorRequest.onerror = () => fail(cursorRequest.error)
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        setResult(undefined)
        return
      }
      const deleteRequest = cursor.delete()
      deleteRequest.onerror = () => fail(deleteRequest.error)
      deleteRequest.onsuccess = () => cursor.continue()
    }
  })

const withEntriesTransaction = <A>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  message: string,
  run: (
    entries: IDBObjectStore,
    onResult: (result: A) => void,
    fail: (cause: unknown) => void
  ) => void
): Effect.Effect<A, Persistence.PersistenceError> =>
  Effect.callback<A, Persistence.PersistenceError>((resume) => {
    const tx = db.transaction(entriesStoreName, mode)
    const entries = tx.objectStore(entriesStoreName)

    let result: A | undefined
    let setResult = false
    let done = false

    const fail = (cause: unknown) => {
      done = true
      resume(Effect.fail(new Persistence.PersistenceError({ message, cause })))
    }

    tx.oncomplete = () => {
      done = true
      if (setResult) resume(Effect.succeed(result!))
    }
    tx.onerror = () => {
      done = true
      fail(tx.error)
    }
    tx.onabort = () => {
      done = true
      fail(tx.error)
    }

    run(entries, (next) => {
      if (done) return resume(Effect.succeed(next))
      setResult = true
      result = next
    }, fail)

    return Effect.sync(() => {
      tx.abort()
    })
  })

const idbRequest = <A>(
  message: string,
  evaluate: () => IDBRequest<A>
): Effect.Effect<A, Persistence.PersistenceError> =>
  Effect.callback<A, Persistence.PersistenceError>((resume) => {
    const request = evaluate()
    const fail = (cause: unknown) => {
      resume(Effect.fail(new Persistence.PersistenceError({ message, cause })))
    }
    if (request.readyState === "done") {
      resume(Effect.succeed(request.result))
    }
    request.onsuccess = () => {
      resume(Effect.succeed(request.result))
    }
    request.onerror = () => fail(request.error)
  })
