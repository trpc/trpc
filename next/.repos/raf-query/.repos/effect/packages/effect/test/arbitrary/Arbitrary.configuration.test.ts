import { afterEach, assert, describe, it } from "@effect/vitest"
import { Arbitrary, Effect, Schema } from "effect"

describe("Arbitrary.configureGlobal", { concurrent: false }, () => {
  afterEach(() => Arbitrary.configureGlobal({}))

  it.effect("uses global defaults and lets explicit options override individual fields", () =>
    Effect.gen(function*() {
      Arbitrary.configureGlobal({ check: { runs: 1000 }, sample: { count: 3 } })
      const arbitrary = Arbitrary.Constant(true)
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, () => true), {
        _tag: "Passed",
        runs: 1000,
        discards: 0
      })
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, () => true, { runs: 2 }), {
        _tag: "Passed",
        runs: 2,
        discards: 0
      })
      assert.deepStrictEqual(yield* Arbitrary.sampleEffect(arbitrary), [true, true, true])
      assert.deepStrictEqual(yield* Arbitrary.sampleEffect(arbitrary, { count: 0 }), [])

      Arbitrary.configureGlobal({ check: { runs: 2, maxDiscards: 0, seed: "global" } })
      const discarded = Arbitrary.filter(arbitrary, () => false)
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(discarded, () => true, { runs: 1 }), {
        _tag: "Exhausted",
        runs: 0,
        discards: 1,
        seed: "global"
      })
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, () => true, { runs: undefined }), {
        _tag: "Passed",
        runs: 2,
        discards: 0
      })
    }))

  it.effect("resolves defaults at execution and keeps an active check unchanged", () =>
    Effect.gen(function*() {
      const arbitrary = Arbitrary.Constant(true)
      const check = Arbitrary.checkEffect(arbitrary, () => {
        Arbitrary.configureGlobal({ check: { runs: 1 } })
        return true
      })
      const sample = Arbitrary.sampleEffect(arbitrary)
      Arbitrary.configureGlobal({ check: { runs: 3 }, sample: { count: 2 } })
      assert.deepStrictEqual(yield* sample, [true, true])
      assert.deepStrictEqual(yield* check, { _tag: "Passed", runs: 3, discards: 0 })
      assert.deepStrictEqual(yield* check, { _tag: "Passed", runs: 1, discards: 0 })
    }))

  it.effect("replaces configuration, copies supplied defaults, and restores built-in defaults", () =>
    Effect.gen(function*() {
      const configuration = { check: { runs: 3 }, sample: { count: 2 } }
      Arbitrary.configureGlobal(configuration)
      configuration.check.runs = 8
      configuration.sample.count = 8
      const arbitrary = Arbitrary.Constant(true)
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, () => true), {
        _tag: "Passed",
        runs: 3,
        discards: 0
      })
      assert.strictEqual((yield* Arbitrary.sampleEffect(arbitrary)).length, 2)
      Arbitrary.configureGlobal({ check: { runs: 4 } })
      assert.strictEqual((yield* Arbitrary.sampleEffect(arbitrary)).length, 10)
      Arbitrary.configureGlobal({})
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, () => true), {
        _tag: "Passed",
        runs: 100,
        discards: 0
      })
    }))

  it.effect("applies sample size and seed defaults while preserving undefined fallbacks", () =>
    Effect.gen(function*() {
      const arbitrary = Arbitrary.schema(Schema.Array(Schema.Boolean))
      const options = { count: 5, size: 4, seed: "sample" }
      const expected = yield* Arbitrary.sampleEffect(arbitrary, options)
      Arbitrary.configureGlobal({ sample: options })
      assert.deepStrictEqual(yield* Arbitrary.sampleEffect(arbitrary, { seed: undefined }), expected)
      assert.deepStrictEqual(yield* Arbitrary.sampleEffect(arbitrary, { size: 0 }), [[], [], [], [], []])
      Arbitrary.configureGlobal({ sample: { count: 1, maxDiscards: 0, seed: 0 } })
      const exit = yield* Arbitrary.sampleEffect(Arbitrary.filter(Arbitrary.Constant(true), () => false)).pipe(
        Effect.flip
      )
      assert.deepStrictEqual(exit, { _tag: "SampleError", generated: 0, discards: 1, seed: 0 })
    }))

  it.effect("applies checking defaults without changing replay", () =>
    Effect.gen(function*() {
      const arbitrary = Arbitrary.schema(Schema.Array(Schema.Boolean))
      const options = { runs: 1, size: 10, maxShrinks: 0, seed: "check" }
      const expected = yield* Arbitrary.checkEffect(arbitrary, () => false, options)
      Arbitrary.configureGlobal({ check: options })
      assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, () => false), expected)
      assert.strictEqual(expected._tag, "Falsified")
      if (expected._tag === "Falsified") {
        Arbitrary.configureGlobal({ check: { runs: -1, size: -1, maxDiscards: -1, maxShrinks: -1 } })
        const replayed = yield* Arbitrary.checkEffect(arbitrary, () => false, { replay: expected.replay })
        assert.deepStrictEqual(replayed, expected)
      }
    }))
})
