import { assert, it } from "@effect/vitest"
import { Effect, type Layer } from "effect"
import { Persistence } from "effect/persistence"

export const suite = (name: string, layer: Layer.Layer<Persistence.BackingPersistence, unknown>) =>
  it.layer(layer, { timeout: "60 seconds" })(`BackingPersistence (${name})`, (it) => {
    it.effect("clear only removes entries from the cleared store", () =>
      Effect.gen(function*() {
        const backing = yield* Persistence.BackingPersistence
        // ids that extend "cache" via concatenation, a colon, or a glob
        const storeIds = ["cache", "cacheusers", "cache:users", "c*"]
        const stores = yield* Effect.forEach(storeIds, (storeId) => backing.make(storeId))
        yield* Effect.forEach(stores, (store, i) => store.set("1", { storeId: storeIds[i] }, undefined))

        yield* stores[0].clear
        assert.deepStrictEqual(
          yield* Effect.forEach(stores, (store) => store.get("1")),
          [undefined, { storeId: "cacheusers" }, { storeId: "cache:users" }, { storeId: "c*" }]
        )

        yield* stores[3].clear
        assert.deepStrictEqual(
          yield* Effect.forEach(stores, (store) => store.get("1")),
          [undefined, { storeId: "cacheusers" }, { storeId: "cache:users" }, undefined]
        )
      }))

    it.effect("distinct store and key pairs do not alias", () =>
      Effect.gen(function*() {
        const backing = yield* Persistence.BackingPersistence
        const pairs: ReadonlyArray<readonly [storeId: string, key: string]> = [
          ["a", "bc"],
          ["ab", "c"],
          ["a", "b:c"],
          ["a:b", "c"],
          ["a%3Ab", "c"]
        ]
        const stores = yield* Effect.forEach(pairs, ([storeId]) => backing.make(storeId))
        yield* Effect.forEach(stores, (store, i) => store.set(pairs[i][1], { pair: pairs[i] }, undefined))

        assert.deepStrictEqual(
          yield* Effect.forEach(stores, (store, i) => store.get(pairs[i][1])),
          pairs.map((pair) => ({ pair }))
        )
      }))
  })
