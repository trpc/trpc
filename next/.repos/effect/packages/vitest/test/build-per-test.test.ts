import { afterAll, assert, describe, expect, layer } from "@effect/vitest"
import { Clock, Context, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"

describe("buildPerTest", { concurrent: false }, () => {
  let sharedBuilds = 0
  let nextPerTestId = 0
  const releasedPerTestIds: Array<number> = []

  class Shared extends Context.Service<Shared, "shared">()("BuildPerTestShared") {
    static readonly layer = Layer.effect(Shared)(
      Effect.sync(() => {
        sharedBuilds++
        return "shared" as const
      })
    )
  }

  class PerTest extends Context.Service<PerTest, { readonly id: number }>()("BuildPerTestPerTest") {
    static readonly layer = Layer.effect(PerTest)(
      Effect.flatMap(Shared, () =>
        Effect.acquireRelease(
          Effect.sync(() => ({ id: ++nextPerTestId })),
          ({ id }) =>
            Effect.sync(() => {
              releasedPerTestIds.push(id)
            })
        ))
    )
  }

  layer(Shared.layer)("shared", (it) => {
    it.layer(PerTest.layer, { buildPerTest: true })("per test", (it) => {
      it.effect("builds the layer for the test", () =>
        Effect.gen(function*() {
          const perTest = yield* PerTest

          assert.strictEqual(perTest.id, 1)
          assert.deepStrictEqual(releasedPerTestIds, [])
        }))

      it.effect("rebuilds the layer once the previous test released it", () =>
        Effect.gen(function*() {
          const perTest = yield* PerTest

          assert.strictEqual(perTest.id, 2)
          assert.deepStrictEqual(releasedPerTestIds, [1])
        }))

      it.layer(Layer.empty)((it) => {
        it.effect.each([3, 4])("rebuilds the layer for nested test %s", (id) =>
          Effect.gen(function*() {
            const perTest = yield* PerTest

            assert.strictEqual(perTest.id, id)
          }))
      })
    })

    afterAll(() => {
      expect(sharedBuilds).toEqual(1)
      expect(releasedPerTestIds).toEqual([1, 2, 3, 4])
    })
  })
})

layer(Layer.empty, { buildPerTest: true })("top-level buildPerTest", (it) => {
  it.effect.each([1, 2])("provides new test services for test %s", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* Clock.currentTimeMillis, 0)
      yield* TestClock.adjust("1 second")
    }))
})
