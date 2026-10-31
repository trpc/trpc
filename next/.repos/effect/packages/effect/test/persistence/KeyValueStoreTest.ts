import { assert, it } from "@effect/vitest"
import type { Layer } from "effect"
import { Effect } from "effect"
import * as Base64 from "effect/encoding/Base64"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

// Tests clear the shared store.
export const suite = (name: string, layer: Layer.Layer<KeyValueStore.KeyValueStore, unknown>) => {
  clearPrefixSuite(name, layer)

  return it.layer(layer, { timeout: { seconds: 30 }, concurrent: false })(`KeyValueStore (${name})`, (it) => {
    it.effect("set + get + size", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear

        yield* kv.set("key", "value")

        assert.strictEqual(yield* kv.get("key"), "value")
        assert.strictEqual(yield* kv.size, 1)

        yield* kv.set("key", "value-2")

        assert.strictEqual(yield* kv.get("key"), "value-2")
        assert.strictEqual(yield* kv.size, 1)
      }))

    it.effect("binary values", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        const bytes = new Uint8Array([0, 42, 255, 128])

        yield* kv.set("binary", bytes)

        assert.strictEqual(yield* kv.get("binary"), Base64.encode(bytes))
        assert.deepStrictEqual(yield* kv.getUint8Array("binary"), bytes)
      }))

    it.effect("string values are not decoded as base64", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        const value = "Zm9v"

        yield* kv.set("string", value)

        assert.strictEqual(yield* kv.get("string"), value)
        assert.deepStrictEqual(yield* kv.getUint8Array("string"), new TextEncoder().encode(value))
      }))

    it.effect("utf8 string values", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        const value = "héllo 👋"

        yield* kv.set("utf8", value)

        assert.strictEqual(yield* kv.get("utf8"), value)
        assert.deepStrictEqual(yield* kv.getUint8Array("utf8"), new TextEncoder().encode(value))
      }))

    it.effect("keys", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        assert.deepStrictEqual(yield* kv.keys, [])

        yield* kv.set("a", "1")
        yield* kv.set("b", new Uint8Array([1]))

        assert.deepStrictEqual([...(yield* kv.keys)].sort(), ["a", "b"])
      }))

    it.effect("remove", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear

        yield* kv.set("a", "1")
        yield* kv.remove("a")

        assert.strictEqual(yield* kv.get("a"), undefined)
        assert.strictEqual(yield* kv.size, 0)
      }))

    it.effect("clear", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear

        yield* kv.set("a", "1")
        yield* kv.set("b", "2")
        yield* kv.clear

        assert.strictEqual(yield* kv.size, 0)
        assert.strictEqual(yield* kv.get("a"), undefined)
        assert.strictEqual(yield* kv.get("b"), undefined)
      }))
  })
}

export const clearPrefixSuite = (name: string, layer: Layer.Layer<KeyValueStore.KeyValueStore, unknown>) =>
  it.layer(layer, { timeout: { seconds: 30 }, concurrent: false })(`KeyValueStore clearPrefix (${name})`, (it) => {
    it.effect("treats SQL wildcard and escape characters literally", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear

        for (const prefix of ["literal%", "literal_", "literal!"]) {
          yield* kv.set(prefix, "exact")
          yield* kv.set(`${prefix}tail`, "match")
          yield* kv.set("literalXtail", "unrelated")
          yield* kv.clearPrefix(prefix)

          assert.strictEqual(yield* kv.get(prefix), undefined)
          assert.strictEqual(yield* kv.get(`${prefix}tail`), undefined)
          assert.strictEqual(yield* kv.get("literalXtail"), "unrelated")
        }
        yield* kv.clear
      }))

    it.effect("matches prefixes case-sensitively", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        yield* kv.set("scope/one", "match")
        yield* kv.set("SCOPE/two", "unrelated")

        yield* kv.clearPrefix("scope/")

        assert.strictEqual(yield* kv.get("scope/one"), undefined)
        assert.strictEqual(yield* kv.get("SCOPE/two"), "unrelated")
        yield* kv.clear
      }))

    it.effect("clears keys beyond a prefix followed by U+FFFF", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        for (const prefix of ["edge", "edge\uffff"]) {
          const keys = [prefix, `${prefix}\uffff`, `${prefix}\ufffftail`]
          for (const key of keys) {
            yield* kv.set(key, "match")
          }
          yield* kv.set("edgf", "unrelated")
          yield* kv.clearPrefix(prefix)

          for (const key of keys) {
            assert.strictEqual(yield* kv.get(key), undefined)
          }
          assert.strictEqual(yield* kv.get("edgf"), "unrelated")
        }
        yield* kv.clear
      }))

    it.effect("clearing a prefixed view preserves keys outside its namespace", () =>
      Effect.gen(function*() {
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.clear
        const parent = KeyValueStore.prefix(kv, "parent/")
        const child = KeyValueStore.prefix(parent, "child/")
        yield* child.set("key", "child")
        yield* parent.set("sibling/key", "sibling")
        yield* kv.set("outside", "unrelated")

        yield* child.clear

        assert.strictEqual(yield* child.get("key"), undefined)
        assert.strictEqual(yield* parent.get("sibling/key"), "sibling")
        assert.strictEqual(yield* kv.get("outside"), "unrelated")
        yield* kv.clear
      }))
  })
