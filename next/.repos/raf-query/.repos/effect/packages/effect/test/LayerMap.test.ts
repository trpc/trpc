import { assert, describe, it } from "@effect/vitest"
import { Duration, Effect, Exit, Layer, LayerMap, Option, Scope } from "effect"
import { TestClock } from "effect/testing"

const makeLayer = (key: string, acquired: Array<string>, released: Array<string>): Layer.Layer<any> =>
  Layer.effectDiscard(
    Effect.acquireRelease(
      Effect.sync(() => {
        acquired.push(key)
      }),
      () =>
        Effect.sync(() => {
          released.push(key)
        })
    )
  ) as Layer.Layer<any>

describe("LayerMap", () => {
  it.effect("contextEffectOption does not build missing entries and returns existing entries", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      const layerMap = yield* LayerMap.make(
        (key: string) => Layer.effectDiscard(Effect.sync(() => acquired.push(key))) as Layer.Layer<any>
      )

      assert.deepStrictEqual(yield* layerMap.contextEffectOption("key"), Option.none())
      assert.deepStrictEqual(acquired, [])

      const ownerScope = yield* Scope.make()
      const borrowerScope = yield* Scope.make()
      yield* layerMap.contextEffect("key").pipe(Scope.provide(ownerScope))
      const cached = yield* layerMap.contextEffectOption("key").pipe(Scope.provide(borrowerScope))
      assert.isTrue(Option.isSome(cached))
      assert.deepStrictEqual(acquired, ["key"])

      yield* Scope.close(ownerScope, Exit.void)
      yield* Scope.close(borrowerScope, Exit.void)
    }))

  it.effect("Service contextEffectOption does not build missing entries and returns existing entries", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      class TestMap extends LayerMap.Service<TestMap>()("LayerMapTest/ContextEffectOption", {
        lookup: (key: string) => Layer.effectDiscard(Effect.sync(() => acquired.push(key))) as Layer.Layer<any>
      }) {}

      yield* Effect.gen(function*() {
        assert.deepStrictEqual(yield* TestMap.contextEffectOption("key"), Option.none())
        assert.deepStrictEqual(acquired, [])

        const ownerScope = yield* Scope.make()
        const borrowerScope = yield* Scope.make()
        yield* TestMap.contextEffect("key").pipe(Scope.provide(ownerScope))
        const cached = yield* TestMap.contextEffectOption("key").pipe(Scope.provide(borrowerScope))
        assert.isTrue(Option.isSome(cached))
        assert.deepStrictEqual(acquired, ["key"])

        yield* Scope.close(ownerScope, Exit.void)
        yield* Scope.close(borrowerScope, Exit.void)
      }).pipe(Effect.provide(TestMap.layer))
    }))

  it.effect("make does not preload with the default idle TTL", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      const released: Array<string> = []
      yield* LayerMap.make(
        (key: string) => makeLayer(key, acquired, released),
        { preloadKeys: ["a", "b"] }
      )
      assert.deepStrictEqual(acquired, [])
      assert.deepStrictEqual(released, [])
    }))

  it.effect("make preloads only keys with non-zero idle TTL", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      const released: Array<string> = []
      const layerMap = yield* LayerMap.make(
        (key: string) => makeLayer(key, acquired, released),
        {
          preloadKeys: ["zero", "finite", "infinite"],
          idleTimeToLive: (key: string) => key === "zero" ? 0 : key === "finite" ? 1000 : Duration.infinity
        }
      )
      assert.deepStrictEqual(acquired, ["finite", "infinite"])
      assert.deepStrictEqual(released, [])
      yield* Effect.scoped(layerMap.contextEffect("finite"))
      assert.deepStrictEqual(acquired, ["finite", "infinite"])
      yield* TestClock.adjust(999)
      assert.deepStrictEqual(released, [])
      yield* TestClock.adjust(1)
      assert.deepStrictEqual(released, ["finite"])
      yield* Effect.scoped(layerMap.contextEffect("infinite"))
      assert.deepStrictEqual(acquired, ["finite", "infinite"])
      assert.deepStrictEqual(released, ["finite"])
    }))

  it.effect("make fails construction when a non-zero TTL preload fails", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(LayerMap.make(
        (key: string) => Layer.effectDiscard(Effect.fail(key)) as Layer.Layer<any, string>,
        { preloadKeys: ["broken"], idleTimeToLive: 1000 }
      ))
      assert.isTrue(Exit.isFailure(exit))
    }))

  it.effect("make supports dynamic idleTimeToLive", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      const released: Array<string> = []
      const layerMap = yield* LayerMap.make(
        (key: string) => makeLayer(key, acquired, released),
        { idleTimeToLive: (key: string) => key.startsWith("short:") ? 500 : 2000 }
      )

      yield* Effect.scoped(layerMap.contextEffect("short:a"))
      yield* Effect.scoped(layerMap.contextEffect("long:b"))
      assert.deepStrictEqual(acquired, ["short:a", "long:b"])
      assert.deepStrictEqual(released, [])

      yield* TestClock.adjust(500)
      assert.deepStrictEqual(released, ["short:a"])

      yield* TestClock.adjust(1500)
      assert.deepStrictEqual(released, ["short:a", "long:b"])
    }))

  it.effect("fromRecord supports dynamic idleTimeToLive", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      const released: Array<string> = []
      const layers = {
        short: makeLayer("short", acquired, released),
        long: makeLayer("long", acquired, released)
      } as const
      const layerMap = yield* LayerMap.fromRecord(
        layers,
        {
          idleTimeToLive: (key) => {
            const key_: "short" | "long" = key
            return key_ === "short" ? 500 : 2000
          }
        }
      )

      yield* Effect.scoped(layerMap.contextEffect("short"))
      yield* Effect.scoped(layerMap.contextEffect("long"))
      assert.deepStrictEqual(acquired, ["short", "long"])
      assert.deepStrictEqual(released, [])

      yield* TestClock.adjust(500)
      assert.deepStrictEqual(released, ["short"])

      yield* TestClock.adjust(1500)
      assert.deepStrictEqual(released, ["short", "long"])
    }))

  it.effect("Service supports dynamic idleTimeToLive", () =>
    Effect.gen(function*() {
      const acquired: Array<string> = []
      const released: Array<string> = []

      class LookupMap extends LayerMap.Service<LookupMap>()("LayerMapTest/LookupMap", {
        lookup: (key: string) => makeLayer(key, acquired, released),
        idleTimeToLive: (key: string) => key.startsWith("short:") ? 500 : 2000
      }) {}

      class RecordMap extends LayerMap.Service<RecordMap>()("LayerMapTest/RecordMap", {
        layers: {
          short: makeLayer("short", acquired, released),
          long: makeLayer("long", acquired, released)
        },
        idleTimeToLive: (key) => {
          const key_: "short" | "long" = key
          return key_ === "short" ? 500 : 2000
        }
      }) {}

      yield* Effect.scoped(LookupMap.contextEffect("short:a").pipe(Effect.provide(LookupMap.layer)))
      yield* Effect.scoped(RecordMap.contextEffect("short").pipe(Effect.provide(RecordMap.layer)))
      assert.deepStrictEqual(acquired, ["short:a", "short"])

      yield* TestClock.adjust(500)
      assert.deepStrictEqual(released, ["short:a", "short"])
    }))
})
