import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import * as IndexedDb from "@effect/platform-browser/IndexedDb"
import { assert, describe, it } from "@effect/vitest"
import { Layer } from "effect"
import { testLayer } from "effect-test/persistence/KeyValueStore.test"
import * as Effect from "effect/Effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Result from "effect/Result"
import { IDBKeyRange, indexedDB } from "fake-indexeddb"

describe("KeyValueStore / layerLocalStorage", () => testLayer(BrowserKeyValueStore.layerLocalStorage))

describe("KeyValueStore / layerSessionStorage", () => testLayer(BrowserKeyValueStore.layerSessionStorage))

describe("KeyValueStore / layerIndexedDb", () => {
  const layerFakeIndexedDb = Layer.succeed(
    IndexedDb.IndexedDb,
    IndexedDb.make({ indexedDB, IDBKeyRange })
  )

  testLayer(
    BrowserKeyValueStore.layerIndexedDb({ database: "kvs_test_db" }).pipe(
      Layer.provide(layerFakeIndexedDb)
    )
  )

  it.effect("reports a key containing bytes as present", () => {
    const layer = BrowserKeyValueStore.layerIndexedDb({
      database: `kvs_binary_has_${crypto.randomUUID()}`
    }).pipe(Layer.provide(layerFakeIndexedDb))

    return Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      yield* store.set("binary", new Uint8Array([0, 127, 255]))
      assert.isTrue(yield* store.has("binary"))
    }).pipe(Effect.provide(layer))
  })

  it.effect("does not report a write before its transaction commits", () => {
    const db = {
      objectStoreNames: { contains: () => true },
      close() {},
      transaction() {
        const transaction = {
          error: null as unknown,
          onabort: null as null | (() => void),
          objectStore() {
            return {
              put() {
                const request = {
                  readyState: "pending",
                  result: undefined,
                  error: null,
                  onsuccess: null as null | (() => void),
                  onerror: null as null | (() => void)
                }
                queueMicrotask(() => {
                  request.readyState = "done"
                  request.onsuccess?.()
                  transaction.error = new DOMException("Commit failed", "AbortError")
                  transaction.onabort?.()
                })
                return request
              }
            }
          }
        }
        return transaction
      }
    }
    const failingIndexedDb = {
      open() {
        const request = {
          readyState: "pending",
          result: undefined as unknown,
          error: null,
          onsuccess: null as null | (() => void),
          onerror: null as null | (() => void),
          onupgradeneeded: null as null | (() => void)
        }
        queueMicrotask(() => {
          request.readyState = "done"
          request.result = db
          request.onsuccess?.()
        })
        return request
      }
    }
    const layer = BrowserKeyValueStore.layerIndexedDb({ database: "transaction_repro" }).pipe(
      Layer.provide(Layer.succeed(
        IndexedDb.IndexedDb,
        IndexedDb.make({ indexedDB: failingIndexedDb as unknown as IDBFactory, IDBKeyRange })
      ))
    )

    return Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const result = yield* Effect.result(store.set("key", "value"))
      yield* Effect.yieldNow
      assert.isTrue(Result.isFailure(result), "the aborted transaction was reported as successful")
    }).pipe(Effect.provide(layer))
  })
})
