import * as BrowserPersistence from "@effect/platform-browser/BrowserPersistence"
import { afterAll, beforeAll, describe } from "@effect/vitest"
import * as PersistedCacheTest from "effect-test/persistence/PersistedCacheTest"
import { indexedDB as fakeIndexedDb } from "fake-indexeddb"

const database = "effect_persistence_integration"

let previousIndexedDb: unknown

beforeAll(() => {
  previousIndexedDb = Reflect.get(globalThis, "indexedDB")
  Reflect.set(globalThis, "indexedDB", fakeIndexedDb)
})

afterAll(() => {
  fakeIndexedDb.deleteDatabase(database)
  if (previousIndexedDb === undefined) {
    Reflect.deleteProperty(globalThis, "indexedDB")
    return
  }
  Reflect.set(globalThis, "indexedDB", previousIndexedDb)
})

describe("BrowserPersistence / PersistedCache", { concurrent: false }, () => {
  PersistedCacheTest.suite(
    "browser-indexeddb",
    BrowserPersistence.layerIndexedDb({ database })
  )
})
