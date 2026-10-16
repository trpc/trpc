/**
 * The `OpenAiEmbeddingModel` module provides the OpenAI implementation of
 * Effect AI's `EmbeddingModel` service. It sends embedding requests through
 * `OpenAiClient`, exposes constructors for layers and `AiModel` values,
 * supports scoped request configuration overrides, and checks that OpenAI
 * returns one numeric vector for each requested input.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import * as EmbeddingModel from "effect/ai/EmbeddingModel"
import * as AiModel from "effect/ai/Model"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import * as Layer from "effect/Layer"
import type { Simplify } from "effect/Types"
import { OpenAiClient } from "./OpenAiClient.ts"
import type * as OpenAiSchema from "./OpenAiSchema.ts"

/**
 * Model identifiers supported by OpenAI's embeddings API.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Model = "text-embedding-ada-002" | "text-embedding-3-small" | "text-embedding-3-large"

/**
 * Context service for OpenAI embedding model configuration.
 *
 * **When to use**
 *
 * Use when you need scoped OpenAI request defaults or overrides for embedding
 * requests from Effect context.
 *
 * **Details**
 *
 * The service stores the OpenAI create-embedding request payload without
 * `input`, carrying options such as `model`, `dimensions`, `encoding_format`,
 * and `user`.
 *
 * @see {@link withConfigOverride} for scoping embedding request overrides
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Config extends Context.Service<
  Config,
  Simplify<
    & Partial<
      Omit<
        typeof OpenAiSchema.CreateEmbeddingRequest.Encoded,
        "input"
      >
    >
    & {
      readonly [x: string]: unknown
    }
  >
>()("@effect/ai-openai/OpenAiEmbeddingModel/Config") {}

/**
 * Creates an `AiModel` for an OpenAI embedding model with its configured vector dimensions.
 *
 * **When to use**
 *
 * Use to provide an OpenAI `EmbeddingModel` and its `Dimensions` service to an
 * Effect program.
 *
 * @see {@link layer} for providing only the embedding model service
 * @see {@link withConfigOverride} for scoped request configuration overrides
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const model = (
  model: (string & {}) | Model,
  options: {
    readonly dimensions: number
    readonly config?: Omit<typeof Config.Service, "model" | "dimensions">
  }
): AiModel.Model<"openai", EmbeddingModel.EmbeddingModel | EmbeddingModel.Dimensions, OpenAiClient> =>
  AiModel.make(
    "openai",
    model,
    Layer.merge(
      layer({
        model,
        config: {
          ...options.config,
          dimensions: options.dimensions
        }
      }),
      Layer.succeed(EmbeddingModel.Dimensions, options.dimensions)
    )
  )

/**
 * Creates an OpenAI embedding model service.
 *
 * **When to use**
 *
 * Use to construct the `EmbeddingModel` effectfully when
 * `OpenAiClient` is already available in the environment.
 *
 * **Details**
 *
 * The `model` option is sent with each embedding request. Constructor `config`
 * supplies create-embedding request fields other than `model` and `input`, and
 * scoped overrides from `withConfigOverride` are merged last for each request.
 *
 * **Gotchas**
 *
 * The service expects numeric embedding vectors. It fails with
 * `InvalidOutputError` when the provider returns base64 embeddings,
 * out-of-range indexes, duplicate indexes, or an unexpected number of
 * embeddings.
 *
 * @see {@link layer} for providing the embedding model service as a layer
 * @see {@link model} for creating an `AiModel` that also provides dimensions
 * @see {@link withConfigOverride} for scoped request configuration overrides
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*({ model, config: providerConfig }: {
  readonly model: (string & {}) | Model
  readonly config?: Omit<typeof Config.Service, "model"> | undefined
}): Effect.fn.Return<EmbeddingModel.EmbeddingModel, never, OpenAiClient> {
  const client = yield* OpenAiClient

  const makeConfig = Effect.contextWith((services: Context.Context<never>) =>
    Effect.succeed({ model, ...providerConfig, ...Context.getOrUndefined(services, Config) })
  )

  return yield* EmbeddingModel.make({
    embedMany: Effect.fnUntraced(function*({ inputs }) {
      const config = yield* makeConfig
      const response = yield* client.createEmbedding({ ...config, input: inputs })
      return yield* mapProviderResponse(inputs.length, response)
    })
  })
})

/**
 * Creates a layer for the OpenAI embedding model.
 *
 * **When to use**
 *
 * Use when composing application layers and you want OpenAI to satisfy
 * `EmbeddingModel.EmbeddingModel` while supplying `OpenAiClient` from another
 * layer.
 *
 * **Gotchas**
 *
 * Use the default floating-point embedding format. The service expects numeric
 * vectors and fails with `InvalidOutputError` if OpenAI returns base64
 * embeddings.
 *
 * @see {@link make} for constructing the embedding model service effectfully
 * @see {@link model} for creating an `AiModel` that also provides embedding dimensions
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  readonly model: (string & {}) | Model
  readonly config?: Omit<typeof Config.Service, "model"> | undefined
}): Layer.Layer<EmbeddingModel.EmbeddingModel, never, OpenAiClient> =>
  Layer.effect(EmbeddingModel.EmbeddingModel, make(options))

/**
 * Provides config overrides for OpenAI embedding model operations.
 *
 * **When to use**
 *
 * Use when you need scoped OpenAI embedding request defaults for a single
 * effect or workflow without rebuilding the embedding model service.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms. Existing scoped config is read
 * first, then the provided overrides are applied so override fields take
 * precedence.
 *
 * @see {@link Config} for the scoped embedding request configuration service
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export const withConfigOverride: {
  (overrides: typeof Config.Service): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Config>>
  <A, E, R>(self: Effect.Effect<A, E, R>, overrides: typeof Config.Service): Effect.Effect<A, E, Exclude<R, Config>>
} = dual<
  (
    overrides: typeof Config.Service
  ) => <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, Config>>,
  <A, E, R>(self: Effect.Effect<A, E, R>, overrides: typeof Config.Service) => Effect.Effect<A, E, Exclude<R, Config>>
>(2, (self, overrides) =>
  Effect.flatMap(
    Effect.serviceOption(Config),
    (config) =>
      Effect.provideService(self, Config, {
        ...(config._tag === "Some" ? config.value : {}),
        ...overrides
      })
  ))

const mapProviderResponse = (
  inputLength: number,
  response: typeof OpenAiSchema.CreateEmbeddingResponse.Type
): Effect.Effect<EmbeddingModel.ProviderResponse, AiError.AiError> => {
  if (response.data.length !== inputLength) {
    return Effect.fail(
      invalidOutput("Provider returned " + response.data.length + " embeddings but expected " + inputLength)
    )
  }

  const results = new Array<Array<number>>(inputLength)
  const seen = new Set<number>()

  for (const entry of response.data) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= inputLength) {
      return Effect.fail(invalidOutput("Provider returned invalid embedding index: " + entry.index))
    }
    if (seen.has(entry.index)) {
      return Effect.fail(invalidOutput("Provider returned duplicate embedding index: " + entry.index))
    }
    if (!Array.isArray(entry.embedding)) {
      return Effect.fail(invalidOutput("Provider returned non-vector embedding at index " + entry.index))
    }

    seen.add(entry.index)
    results[entry.index] = [...entry.embedding]
  }

  if (seen.size !== inputLength) {
    return Effect.fail(
      invalidOutput("Provider returned embeddings for " + seen.size + " inputs but expected " + inputLength)
    )
  }

  return Effect.succeed({
    results,
    usage: {
      inputTokens: response.usage?.prompt_tokens
    }
  })
}

const invalidOutput = (description: string): AiError.AiError =>
  AiError.make({
    module: "OpenAiEmbeddingModel",
    method: "embedMany",
    reason: new AiError.InvalidOutputError({ description })
  })
