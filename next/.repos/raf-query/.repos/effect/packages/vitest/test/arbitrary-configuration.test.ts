import { afterAll, assert, beforeAll, describe, it, layer } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

describe("global arbitrary defaults", { concurrent: false }, () => {
  let plainRuns = 0
  let effectRuns = 0
  let layerRuns = 0
  let overrideRuns = 0

  beforeAll(() => Arbitrary.configureGlobal({ check: { runs: 7 } }))
  afterAll(() => {
    Arbitrary.configureGlobal({})
    assert.strictEqual(plainRuns, 7)
    assert.strictEqual(effectRuns, 7)
    assert.strictEqual(layerRuns, 7)
    assert.strictEqual(overrideRuns, 2)
  })

  it.prop("uses global defaults in plain properties", [Schema.Boolean], () => {
    plainRuns++
  })

  it.effect.prop("uses global defaults in Effect properties", [Schema.Boolean], () =>
    Effect.sync(() => {
      effectRuns++
    }))

  it.prop("lets a property override the run count", [Schema.Boolean], () => {
    overrideRuns++
  }, { arbitrary: { runs: 2 } })

  layer(Layer.empty)("layer properties", (it) => {
    it.effect.prop("uses global defaults inside a layer", [Schema.Boolean], () =>
      Effect.sync(() => {
        layerRuns++
      }))
  })
})
