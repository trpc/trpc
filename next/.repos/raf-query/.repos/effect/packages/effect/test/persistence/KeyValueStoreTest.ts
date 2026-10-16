import { assert, it } from "@effect/vitest"
import type { Layer } from "effect"
import { Effect } from "effect"
import * as Base64 from "effect/encoding/Base64"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

// Tests clear the shared store.
export const suite = (name: string, layer: Layer.Layer<KeyValueStore.KeyValueStore, unknown>) =>
  it.layer(layer, { timeout: { seconds: 30 }, concurrent: false })(`KeyValueStore (${name})`, (it) => {
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
