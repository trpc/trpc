import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Model } from "effect/ai"

describe("Model", () => {
  it.effect("provides metadata alongside the wrapped layer for the duration of the scope", () =>
    Effect.gen(function*() {
      const providerName = yield* Model.ProviderName
      const modelName = yield* Model.ModelName

      assert.strictEqual(providerName, "openai")
      assert.strictEqual(modelName, "gpt-5")
    }).pipe(
      Effect.provide(Model.make("openai", "gpt-5", Layer.empty))
    ))
})
