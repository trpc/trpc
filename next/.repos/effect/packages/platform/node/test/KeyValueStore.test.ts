import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { assert, describe, it } from "@effect/vitest"
import { clearPrefixSuite } from "effect-test/persistence/KeyValueStoreTest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

const platformLayer = Layer.merge(NodeFileSystem.layer, NodePath.layer)

describe("KeyValueStore / layerFileSystem", () => {
  clearPrefixSuite(
    "file system",
    Layer.unwrap(Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      return KeyValueStore.layerFileSystem(directory).pipe(Layer.provide(platformLayer))
    })).pipe(Layer.provide(NodeFileSystem.layer))
  )

  it.effect("rejects invalid keys without modifying the file system", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const root = yield* fs.makeTempDirectoryScoped()
      const directory = `${root}/store`
      const sibling = `${root}/sibling.txt`
      yield* fs.makeDirectory(directory)
      yield* fs.writeFileString(sibling, "sibling")

      yield* Effect.gen(function*() {
        const store = yield* KeyValueStore.KeyValueStore

        for (const key of ["", ".", ".."]) {
          const operations = [
            ["get", Effect.asVoid(store.get(key))],
            ["getUint8Array", Effect.asVoid(store.getUint8Array(key))],
            ["set", Effect.asVoid(store.set(key, "value"))],
            ["remove", Effect.asVoid(store.remove(key))],
            ["has", Effect.asVoid(store.has(key))]
          ] as const

          for (const [method, operation] of operations) {
            const error = yield* Effect.flip(operation)
            assert.instanceOf(error, KeyValueStore.KeyValueStoreError)
            assert.strictEqual(error.method, method)
            assert.strictEqual(error.key, key)
          }
        }
      }).pipe(
        Effect.provide(KeyValueStore.layerFileSystem(directory).pipe(Layer.provide(platformLayer)))
      )

      assert.isTrue(yield* fs.exists(directory))
      assert.deepStrictEqual(yield* fs.readDirectory(directory), [])
      assert.strictEqual(yield* fs.readFileString(sibling), "sibling")
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("keys decodes file names", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()

      yield* Effect.gen(function*() {
        const store = yield* KeyValueStore.KeyValueStore
        yield* store.set("/foo/bar", "1")
        yield* store.set("a b%", "2")

        assert.deepStrictEqual([...(yield* store.keys)].sort(), ["/foo/bar", "a b%"])
      }).pipe(
        Effect.provide(KeyValueStore.layerFileSystem(directory).pipe(Layer.provide(platformLayer)))
      )
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))

  it.effect("remove succeeds for a missing key", () =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()

      yield* KeyValueStore.KeyValueStore.use((store) => store.remove("missing")).pipe(
        Effect.provide(KeyValueStore.layerFileSystem(directory).pipe(Layer.provide(platformLayer)))
      )
    }).pipe(
      Effect.provide(NodeFileSystem.layer)
    ))
})
