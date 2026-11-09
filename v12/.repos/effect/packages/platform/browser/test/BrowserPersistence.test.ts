import * as BrowserPersistence from "@effect/platform-browser/BrowserPersistence"
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Persistence from "effect/persistence/Persistence"
import { TestClock } from "effect/testing"
import { indexedDB as fakeIndexedDb } from "fake-indexeddb"

const defaultDatabase = "effect_persistence"
const customDatabase = "effect_persistence_custom"

interface EntryRow {
  readonly storeId: string
  readonly id: string
  readonly value: object
  readonly expires: number | null
}

let previousIndexedDb: unknown

beforeEach(() => {
  previousIndexedDb = Reflect.get(globalThis, "indexedDB")
  Reflect.set(globalThis, "indexedDB", fakeIndexedDb)
})

afterEach(() => {
  fakeIndexedDb.deleteDatabase(defaultDatabase)
  fakeIndexedDb.deleteDatabase(customDatabase)
  if (previousIndexedDb === undefined) {
    Reflect.deleteProperty(globalThis, "indexedDB")
    return
  }
  Reflect.set(globalThis, "indexedDB", previousIndexedDb)
})

describe("BrowserPersistence", { concurrent: false }, () => {
  it.effect("set + get", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const store = yield* backing.make("users")

      yield* store.set("key1", { name: "Alice" }, undefined)

      const value = yield* store.get("key1")
      assert.deepStrictEqual(value, { name: "Alice" })
    }).pipe(
      Effect.provide(BrowserPersistence.layerBackingIndexedDb())
    ))

  it.effect("setMany + getMany preserves order, missing keys, and duplicates", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const store = yield* backing.make("users")

      yield* store.setMany([
        ["key1", { name: "Alice" }, undefined],
        ["key2", { name: "Bob" }, undefined],
        ["key3", { name: "Charlie" }, undefined]
      ])

      const values = yield* store.getMany(["key3", "missing", "key1", "key1", "key2"])
      assert.deepStrictEqual(values, [
        { name: "Charlie" },
        undefined,
        { name: "Alice" },
        { name: "Alice" },
        { name: "Bob" }
      ])
    }).pipe(
      Effect.provide(BrowserPersistence.layerBackingIndexedDb())
    ))

  it.effect("remove", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const store = yield* backing.make("users")

      yield* store.setMany([
        ["key1", { name: "Alice" }, undefined],
        ["key2", { name: "Bob" }, undefined]
      ])

      yield* store.remove("key1")

      const values = yield* store.getMany(["key1", "key2"])
      assert.deepStrictEqual(values, [undefined, { name: "Bob" }])
    }).pipe(
      Effect.provide(BrowserPersistence.layerBackingIndexedDb())
    ))

  it.effect("clear only affects the current storeId", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const storeA = yield* backing.make("store-a")
      const storeB = yield* backing.make("store-b")

      yield* storeA.set("shared", { owner: "A" }, undefined)
      yield* storeA.set("only-a", { owner: "A" }, undefined)
      yield* storeB.set("shared", { owner: "B" }, undefined)

      yield* storeA.clear

      assert.deepStrictEqual(yield* storeA.get("shared"), undefined)
      assert.deepStrictEqual(yield* storeA.get("only-a"), undefined)
      assert.deepStrictEqual(yield* storeB.get("shared"), { owner: "B" })
    }).pipe(
      Effect.provide(BrowserPersistence.layerBackingIndexedDb())
    ))

  it.effect("TTL expiry performs lazy deletion", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const store = yield* backing.make("users")

      yield* store.set("ttl-key", { name: "expiring" }, Duration.seconds(10))

      const rowBefore = yield* getRawEntry(defaultDatabase, "users", "ttl-key").pipe(Effect.orDie)
      assert.isTrue(rowBefore !== undefined)

      yield* TestClock.adjust(Duration.seconds(11))

      const expired = yield* store.get("ttl-key")
      assert.deepStrictEqual(expired, undefined)

      const rowAfter = yield* getRawEntry(defaultDatabase, "users", "ttl-key").pipe(Effect.orDie)
      assert.deepStrictEqual(rowAfter, undefined)
    }).pipe(
      Effect.provide(BrowserPersistence.layerBackingIndexedDb())
    ))

  it.effect("store isolation across storeIds", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const storeA = yield* backing.make("store-a")
      const storeB = yield* backing.make("store-b")

      yield* storeA.set("same-key", { value: "A" }, undefined)
      yield* storeB.set("same-key", { value: "B" }, undefined)

      yield* storeA.remove("same-key")

      assert.deepStrictEqual(yield* storeA.get("same-key"), undefined)
      assert.deepStrictEqual(yield* storeB.get("same-key"), { value: "B" })
    }).pipe(
      Effect.provide(BrowserPersistence.layerBackingIndexedDb())
    ))

  it.effect("custom database option", () =>
    Effect.gen(function*() {
      yield* withStore("users", undefined, (store) => store.set("shared", { database: "default" }, undefined))

      yield* withStore("users", { database: customDatabase }, (store) =>
        store.set("shared", { database: "custom" }, undefined))

      const fromDefault = yield* withStore("users", undefined, (store) =>
        store.get("shared"))
      const fromCustom = yield* withStore("users", { database: customDatabase }, (store) =>
        store.get("shared"))

      assert.deepStrictEqual(fromDefault, { database: "default" })
      assert.deepStrictEqual(fromCustom, { database: "custom" })
    }))
})

const withStore = <A>(
  storeId: string,
  options: {
    readonly database?: string | undefined
  } | undefined,
  f: (store: Persistence.BackingPersistenceStore) => Effect.Effect<A, Persistence.PersistenceError>
) =>
  Effect.gen(function*() {
    const backing = yield* Persistence.BackingPersistence
    const store = yield* backing.make(storeId)
    return yield* f(store)
  }).pipe(Effect.provide(BrowserPersistence.layerBackingIndexedDb(options)))

const withDatabase = <A>(
  database: string,
  f: (db: IDBDatabase) => Effect.Effect<A, unknown>
): Effect.Effect<A, unknown> =>
  Effect.acquireUseRelease(
    idbRequest(() => globalThis.indexedDB.open(database, 1)),
    f,
    (db) => Effect.sync(() => db.close())
  )

const getRawEntry = (database: string, storeId: string, id: string): Effect.Effect<EntryRow | undefined, unknown> =>
  withDatabase(
    database,
    (db) => idbRequest(() => db.transaction("entries", "readonly").objectStore("entries").get([storeId, id]))
  )

const idbRequest = <A>(evaluate: () => IDBRequest<A>): Effect.Effect<A, unknown> =>
  Effect.flatMap(
    Effect.try({
      try: evaluate,
      catch: (cause) => cause
    }),
    (request) =>
      Effect.callback<A, unknown>((resume) => {
        if (request.readyState === "done") {
          resume(Effect.succeed(request.result))
          return
        }
        request.onsuccess = () => resume(Effect.succeed(request.result))
        request.onerror = () => resume(Effect.fail(request.error))
      })
  )
