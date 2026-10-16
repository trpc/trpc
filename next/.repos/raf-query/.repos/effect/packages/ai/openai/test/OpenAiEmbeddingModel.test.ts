import { OpenAiClient, OpenAiEmbeddingModel } from "@effect/ai-openai"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { EmbeddingModel } from "effect/ai"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

describe("OpenAiEmbeddingModel", () => {
  it.effect("model provides dimensions service", () =>
    Effect.gen(function*() {
      const dimensions = yield* EmbeddingModel.Dimensions
      assert.strictEqual(dimensions, 1536)
    }).pipe(
      Effect.provide(OpenAiEmbeddingModel.model("text-embedding-3-small", { dimensions: 1536 })),
      Effect.provideService(OpenAiClient.OpenAiClient, noopOpenAiClient)
    ))

  it.effect("reorders embeddings by provider index", () =>
    Effect.gen(function*() {
      let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

      const clientLayer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
        Layer.provide(Layer.succeed(
          HttpClient.HttpClient,
          makeHttpClient((request) => {
            capturedRequest = request
            return Effect.succeed(jsonResponse(request, {
              data: [
                { index: 1, embedding: [20, 21], object: "embedding" },
                { index: 0, embedding: [10, 11], object: "embedding" }
              ],
              model: "text-embedding-3-small",
              object: "list",
              usage: {
                prompt_tokens: 7,
                total_tokens: 7
              }
            }))
          })
        ))
      )

      const response = yield* Effect.gen(function*() {
        const model = yield* EmbeddingModel.EmbeddingModel
        return yield* model.embedMany(["first", "second"])
      }).pipe(
        Effect.provide(OpenAiEmbeddingModel.layer({ model: "text-embedding-3-small" })),
        Effect.provide(clientLayer)
      )

      assert.deepStrictEqual(response.embeddings.map((embedding) => embedding.vector), [[10, 11], [20, 21]])
      assert.strictEqual(response.usage.inputTokens, 7)

      assert.isDefined(capturedRequest)
      if (capturedRequest === undefined) {
        return
      }

      const requestBody = yield* getRequestBody(capturedRequest)
      assert.strictEqual(requestBody.model, "text-embedding-3-small")
      assert.deepStrictEqual(requestBody.input, ["first", "second"])
    }))

  it.effect("merges config and applies withConfigOverride precedence", () =>
    Effect.gen(function*() {
      let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

      const clientLayer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
        Layer.provide(Layer.succeed(
          HttpClient.HttpClient,
          makeHttpClient((request) => {
            capturedRequest = request
            return Effect.succeed(jsonResponse(request, {
              data: [{ index: 0, embedding: [1, 2, 3], object: "embedding" }],
              model: "override-model",
              object: "list",
              usage: {
                prompt_tokens: 3,
                total_tokens: 3
              }
            }))
          })
        ))
      )

      yield* Effect.gen(function*() {
        const model = yield* EmbeddingModel.EmbeddingModel
        yield* model.embed("hello")
      }).pipe(
        OpenAiEmbeddingModel.withConfigOverride({
          model: "override-model",
          dimensions: 1024,
          user: "request-user"
        }),
        Effect.provide(OpenAiEmbeddingModel.layer({
          model: "base-model",
          config: {
            dimensions: 256,
            user: "provider-user"
          }
        })),
        Effect.provide(clientLayer)
      )

      assert.isDefined(capturedRequest)
      if (capturedRequest === undefined) {
        return
      }

      const requestBody = yield* getRequestBody(capturedRequest)
      assert.strictEqual(requestBody.model, "override-model")
      assert.strictEqual(requestBody.dimensions, 1024)
      assert.strictEqual(requestBody.user, "request-user")
      assert.deepStrictEqual(requestBody.input, ["hello"])
    }))

  it.effect("fails with InvalidOutputError when provider returns duplicate indices", () =>
    Effect.gen(function*() {
      const clientLayer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
        Layer.provide(Layer.succeed(
          HttpClient.HttpClient,
          makeHttpClient((request) =>
            Effect.succeed(jsonResponse(request, {
              data: [
                { index: 0, embedding: [1], object: "embedding" },
                { index: 0, embedding: [2], object: "embedding" }
              ],
              model: "text-embedding-3-small",
              object: "list",
              usage: {
                prompt_tokens: 2,
                total_tokens: 2
              }
            }))
          )
        ))
      )

      const error = yield* Effect.gen(function*() {
        const model = yield* EmbeddingModel.EmbeddingModel
        return yield* model.embedMany(["a", "b"]).pipe(Effect.flip)
      }).pipe(
        Effect.provide(OpenAiEmbeddingModel.layer({ model: "text-embedding-3-small" })),
        Effect.provide(clientLayer)
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with InvalidOutputError when provider returns out-of-range indices", () =>
    Effect.gen(function*() {
      const clientLayer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
        Layer.provide(Layer.succeed(
          HttpClient.HttpClient,
          makeHttpClient((request) =>
            Effect.succeed(jsonResponse(request, {
              data: [
                { index: 0, embedding: [1], object: "embedding" },
                { index: 2, embedding: [2], object: "embedding" }
              ],
              model: "text-embedding-3-small",
              object: "list",
              usage: {
                prompt_tokens: 2,
                total_tokens: 2
              }
            }))
          )
        ))
      )

      const error = yield* Effect.gen(function*() {
        const model = yield* EmbeddingModel.EmbeddingModel
        return yield* model.embedMany(["a", "b"]).pipe(Effect.flip)
      }).pipe(
        Effect.provide(OpenAiEmbeddingModel.layer({ model: "text-embedding-3-small" })),
        Effect.provide(clientLayer)
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with InvalidOutputError when provider returns wrong embedding count", () =>
    Effect.gen(function*() {
      const clientLayer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
        Layer.provide(Layer.succeed(
          HttpClient.HttpClient,
          makeHttpClient((request) =>
            Effect.succeed(jsonResponse(request, {
              data: [{ index: 0, embedding: [1], object: "embedding" }],
              model: "text-embedding-3-small",
              object: "list",
              usage: {
                prompt_tokens: 1,
                total_tokens: 1
              }
            }))
          )
        ))
      )

      const error = yield* Effect.gen(function*() {
        const model = yield* EmbeddingModel.EmbeddingModel
        return yield* model.embedMany(["a", "b"]).pipe(Effect.flip)
      }).pipe(
        Effect.provide(OpenAiEmbeddingModel.layer({ model: "text-embedding-3-small" })),
        Effect.provide(clientLayer)
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with InvalidOutputError when provider returns base64 embeddings", () =>
    Effect.gen(function*() {
      const clientLayer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
        Layer.provide(Layer.succeed(
          HttpClient.HttpClient,
          makeHttpClient((request) =>
            Effect.succeed(jsonResponse(request, {
              data: [{ index: 0, embedding: "AQID", object: "embedding" }],
              model: "text-embedding-3-small",
              object: "list",
              usage: {
                prompt_tokens: 1,
                total_tokens: 1
              }
            }))
          )
        ))
      )

      const error = yield* Effect.gen(function*() {
        const model = yield* EmbeddingModel.EmbeddingModel
        return yield* model.embed("a").pipe(Effect.flip)
      }).pipe(
        Effect.provide(OpenAiEmbeddingModel.layer({ model: "text-embedding-3-small" })),
        Effect.provide(clientLayer)
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))
})

const makeHttpClient = (
  handler: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
) =>
  HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      return yield* handler(request)
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    })
  )

const getRequestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function*() {
    const body = request.body
    if (body._tag === "Uint8Array") {
      const text = new TextDecoder().decode(body.body)
      return JSON.parse(text)
    }
    return yield* Effect.die(new Error("Expected Uint8Array body"))
  })

const noopOpenAiClient: OpenAiClient.Service = {
  client: undefined as unknown as OpenAiClient.Service["client"],
  createResponse: () => Effect.die(new Error("noop")),
  createResponseStream: () => Effect.die(new Error("noop")),
  createEmbedding: () => Effect.die(new Error("noop"))
}
