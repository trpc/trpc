import { afterEach, describe, it } from "@effect/vitest"
import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Effect, type Layer, Option, Schema } from "effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"
import * as Persistence from "effect/persistence/Persistence"
import { clearPrefixSuite } from "./KeyValueStoreTest.ts"

export const testLayer = <E>(layer: Layer.Layer<KeyValueStore.KeyValueStore, E>) => {
  clearPrefixSuite("shared backend", layer)
  describe("store operations", { concurrent: false }, () => {
    const run = <E, A>(effect: Effect.Effect<A, E, KeyValueStore.KeyValueStore>) =>
      Effect.runPromise(Effect.provide(effect, layer))

    afterEach(() =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        yield* kv.clear
      }))
    )

    it("set", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        yield* (kv.set("/foo/bar", "bar"))

        const value = yield* (kv.get("/foo/bar"))
        const length = yield* (kv.size)

        strictEqual(value, "bar")
        strictEqual(length, 1)
      })))

    it("get/ missing", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        yield* (kv.clear)
        const value = yield* (kv.get("foo"))

        strictEqual(value, undefined)
      })))

    it("remove", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        yield* (kv.set("foo", "bar"))
        yield* (kv.remove("foo"))

        const value = yield* (kv.get("foo"))
        const length = yield* (kv.size)

        strictEqual(value, undefined)
        strictEqual(length, 0)
      })))

    it("clear", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        yield* (kv.set("foo", "bar"))
        yield* (kv.clear)

        const value = yield* (kv.get("foo"))
        const length = yield* (kv.size)

        strictEqual(value, undefined)
        strictEqual(length, 0)
      })))

    it("keys", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        deepStrictEqual(yield* (kv.keys), [])

        yield* (kv.set("/foo/bar", "bar"))
        yield* (kv.set("baz", "qux"))

        deepStrictEqual([...(yield* kv.keys)].sort(), ["/foo/bar", "baz"])
      })))

    it("modify", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)
        yield* (kv.set("foo", "bar"))

        const value = yield* (kv.modify("foo", (v) => v + "bar"))
        const length = yield* (kv.size)

        strictEqual(value, "barbar")
        strictEqual(length, 1)
      })))

    it("modify - none", () =>
      run(Effect.gen(function*() {
        const kv = yield* (KeyValueStore.KeyValueStore)

        const value = yield* (kv.modify("foo", (v) => v + "bar"))
        const length = yield* (kv.size)

        strictEqual(value, undefined)
        strictEqual(length, 0)
      })))

    it("setMany stores entries without a TTL", () =>
      run(
        Effect.gen(function*() {
          const backing = yield* Persistence.BackingPersistence
          const store = yield* backing.make("store")

          yield* store.setMany([["key", { value: 1 }, undefined]])

          deepStrictEqual(yield* store.get("key"), { value: 1 })
        }).pipe(
          Effect.scoped,
          Effect.provide(Persistence.layerBackingKvs)
        )
      ))
  })
}

describe("KeyValueStore / layerMemory", () => testLayer(KeyValueStore.layerMemory))

describe("KeyValueStore / prefix", () => {
  it.effect("prefixes the keys", () =>
    Effect.gen(function*() {
      const store = yield* (KeyValueStore.KeyValueStore)
      const prefixed = KeyValueStore.prefix(store, "prefix/")

      yield* (prefixed.set("foo", "bar"))
      yield* (prefixed.modify("foo", (v) => v + "bar"))

      strictEqual(yield* (prefixed.get("foo")), "barbar")
      assertTrue(yield* (prefixed.has("foo")))

      strictEqual(yield* (store.get("prefix/foo")), "barbar")
      assertTrue(yield* (store.has("prefix/foo")))
    }).pipe(
      Effect.provide(KeyValueStore.layerMemory)
    ))

  it.effect("scopes keys, size, isEmpty and clear to the prefix", () =>
    Effect.gen(function*() {
      const store = yield* (KeyValueStore.KeyValueStore)
      const prefixed = KeyValueStore.prefix(store, "prefix/")

      yield* (store.set("other", "1"))
      assertTrue(yield* (prefixed.isEmpty))

      yield* (prefixed.set("foo", "2"))
      yield* (prefixed.set("bar", "3"))

      deepStrictEqual([...(yield* prefixed.keys)].sort(), ["bar", "foo"])
      strictEqual(yield* (prefixed.size), 2)

      yield* (prefixed.clear)

      assertTrue(yield* (prefixed.isEmpty))
      deepStrictEqual(yield* (store.keys), ["other"])
    }).pipe(
      Effect.provide(KeyValueStore.layerMemory)
    ))
})

describe("KeyValueStore / make", () => {
  it.effect("derives clearPrefix from keys", () =>
    Effect.gen(function*() {
      const map = new Map<string, string>()
      const store = KeyValueStore.makeStringOnly({
        get: (key) => Effect.sync(() => map.get(key)),
        set: (key, value) => Effect.sync(() => void map.set(key, value)),
        remove: (key) => Effect.sync(() => void map.delete(key)),
        clear: Effect.sync(() => map.clear()),
        size: Effect.sync(() => map.size),
        keys: Effect.sync(() => Array.from(map.keys()))
      })

      yield* (store.set("prefix/foo", "1"))
      yield* (store.set("prefix/bar", "2"))
      yield* (store.set("other", "3"))

      yield* (store.clearPrefix("prefix/"))

      deepStrictEqual(yield* (store.keys), ["other"])
    }))
})

describe("toSchemaStore", () => {
  class User extends Schema.Class<User>("User")({
    name: Schema.String,
    age: Schema.Number
  }) {}

  it.effect("encodes & decodes", () =>
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const schemaStore = KeyValueStore.toSchemaStore(store, User)
      yield* (schemaStore.set("foo", new User({ name: "foo", age: 42 })))
      yield* (schemaStore.modify("foo", (user) => new User({ ...user, age: 43 })))
      const value = yield* schemaStore.get("foo")

      assertTrue(Option.isSome(value))
      strictEqual(value.value.name, "foo")
      strictEqual(value.value.age, 43)
      deepStrictEqual(yield* schemaStore.keys, ["foo"])
    }).pipe(
      Effect.provide(KeyValueStore.layerMemory)
    ))

  it.effect("prefix", () =>
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const schemaStore = KeyValueStore.toSchemaStore(store, User)
      yield* (schemaStore.set("prefix/foo", new User({ name: "foo", age: 42 })))
      const value = yield* schemaStore.get("prefix/foo")

      if (Option.isSome(value)) {
        strictEqual(value.value.name, "foo")
        strictEqual(value.value.age, 42)
      }
    }).pipe(
      Effect.provide(KeyValueStore.layerMemory)
    ))

  it.effect("json compliant", () =>
    Effect.gen(function*() {
      const store = yield* KeyValueStore.KeyValueStore
      const schema = Schema.Struct({
        a: Schema.Date
      })
      const schemaStore = KeyValueStore.toSchemaStore(store, schema)
      yield* (schemaStore.set("foo", { a: new Date(0) }))
      const value = yield* schemaStore.get("foo")
      assertTrue(Option.isSome(value))
      deepStrictEqual(value.value.a, new Date(0))
    }).pipe(
      Effect.provide(KeyValueStore.layerMemory)
    ))
})
