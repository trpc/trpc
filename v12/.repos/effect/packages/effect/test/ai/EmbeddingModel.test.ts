import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { EmbeddingModel } from "effect/ai"
import * as AiError from "effect/ai/AiError"

const makeLayer = (
  embedMany: (
    options: EmbeddingModel.ProviderOptions
  ) => Effect.Effect<EmbeddingModel.ProviderResponse, AiError.AiError>
) =>
  Layer.effect(
    EmbeddingModel.EmbeddingModel,
    EmbeddingModel.make({
      embedMany
    })
  )

describe("EmbeddingModel", () => {
  it.effect("round trips usage with undefined input tokens through JSON", () =>
    Effect.gen(function*() {
      const usage = new EmbeddingModel.EmbeddingUsage({ inputTokens: undefined })

      const encoded = yield* Schema.encodeEffect(EmbeddingModel.EmbeddingUsage)(usage)
      const json = JSON.parse(JSON.stringify(encoded))
      const decoded = yield* Schema.decodeUnknownEffect(EmbeddingModel.EmbeddingUsage)(json)

      assert.deepStrictEqual(json, {}, "encoded JSON")
      assert.deepStrictEqual(decoded, new EmbeddingModel.EmbeddingUsage({}), "decoded usage")
    }))

  it.effect("embed returns a vector", () => {
    const calls: Array<ReadonlyArray<string>> = []

    return Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const response = yield* model.embed("hello")

      assert.deepStrictEqual(response.vector, [1, 2, 3])
      assert.deepStrictEqual(calls, [["hello"]])
    }).pipe(
      Effect.provide(
        makeLayer(({ inputs }) =>
          Effect.sync(() => {
            calls.push(inputs)
            return {
              results: [[1, 2, 3]],
              usage: { inputTokens: 5 }
            }
          })
        )
      )
    )
  })

  it.effect("embedMany returns ordered vectors with usage", () => {
    const calls: Array<ReadonlyArray<string>> = []

    return Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const response = yield* model.embedMany(["hello", "world"])

      assert.deepStrictEqual(
        response.embeddings.map((embedding) => embedding.vector),
        [[1, 2], [3, 4]]
      )
      assert.strictEqual(response.usage.inputTokens, 9)
      assert.deepStrictEqual(calls, [["hello", "world"]])
    }).pipe(
      Effect.provide(
        makeLayer(({ inputs }) => {
          calls.push(inputs)
          return Effect.succeed({
            results: [[1, 2], [3, 4]],
            usage: { inputTokens: 9 }
          })
        })
      )
    )
  })

  it.effect("concurrent embed calls are batched into one provider embedMany call", () => {
    let calls = 0
    const batches: Array<ReadonlyArray<string>> = []

    return Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const responses = yield* Effect.all([
        model.embed("a"),
        model.embed("b"),
        model.embed("c")
      ], { concurrency: "unbounded" })

      assert.strictEqual(calls, 1)
      assert.deepStrictEqual(batches, [["a", "b", "c"]])
      assert.deepStrictEqual(
        responses.map((response) => response.vector),
        [[97], [98], [99]]
      )
    }).pipe(
      Effect.provide(
        makeLayer(({ inputs }) => {
          calls++
          batches.push(inputs)
          return Effect.succeed({
            results: inputs.map((input) => [input.charCodeAt(0)]),
            usage: { inputTokens: undefined }
          })
        })
      )
    )
  })

  it.effect("provider AiError propagates through embed", () => {
    const error = AiError.make({
      module: "EmbeddingModelTest",
      method: "embedMany",
      reason: new AiError.UnknownError({ description: "boom" })
    })

    return Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const result = yield* model.embed("hello").pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => undefined })
      )

      assert.strictEqual(result, error)
    }).pipe(
      Effect.provide(
        makeLayer(() => Effect.fail(error))
      )
    )
  })

  it.effect("embed fails with InvalidOutputError when provider misses results", () =>
    Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const error = yield* model.embed("hello").pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => undefined })
      )

      assert.notStrictEqual(error, undefined)
      if (error !== undefined) {
        assert.strictEqual(error.reason._tag, "InvalidOutputError")
      }
    }).pipe(
      Effect.provide(
        makeLayer(() =>
          Effect.succeed({
            results: [],
            usage: { inputTokens: 0 }
          })
        )
      )
    ))

  it.effect("embedMany fails with InvalidOutputError when provider misses results", () =>
    Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const error = yield* model.embedMany(["hello", "world"]).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => undefined })
      )

      assert.notStrictEqual(error, undefined)
      if (error !== undefined) {
        assert.strictEqual(error.reason._tag, "InvalidOutputError")
      }
    }).pipe(
      Effect.provide(
        makeLayer(() =>
          Effect.succeed({
            results: [[1, 2, 3]],
            usage: { inputTokens: 3 }
          })
        )
      )
    ))

  it.effect("embedMany([]) bypasses provider", () => {
    let calls = 0

    return Effect.gen(function*() {
      const model = yield* EmbeddingModel.EmbeddingModel
      const response = yield* model.embedMany([])

      assert.strictEqual(calls, 0)
      assert.deepStrictEqual(response.embeddings, [])
      assert.strictEqual(response.usage.inputTokens, undefined)
    }).pipe(
      Effect.provide(
        makeLayer(() => {
          calls++
          return Effect.die("provider should not be called")
        })
      )
    )
  })
})
