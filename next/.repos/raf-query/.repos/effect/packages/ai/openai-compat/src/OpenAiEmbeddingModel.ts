/**
 * The `OpenAiEmbeddingModel` module adapts OpenAI-compatible embeddings
 * endpoints to Effect's embedding model service. It sends embedding requests
 * through {@link OpenAiClient}, exposes constructors for layers and `AiModel`
 * values, supports scoped request configuration overrides, and checks that the
 * provider returns one numeric vector for each requested input.
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
import type { CreateEmbedding200, CreateEmbeddingRequestJson } from "./OpenAiClient.ts"
import { OpenAiClient } from "./OpenAiClient.ts"

/**
 * A model identifier accepted by an OpenAI-compatible embeddings endpoint.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Model = string

type ConfigOptions = Simplify<Partial<Omit<CreateEmbeddingRequestJson, "input">>>
type ModelConfig = Omit<ConfigOptions, "model"> & { readonly [x: string]: unknown }

/**
 * Context service for OpenAI embedding model configuration.
 *
 * **When to use**
 *
 * Use when you need to provide shared default request options for
 * OpenAI-compatible embedding operations through the Effect context, such as
 * `dimensions`, `encoding_format`, or `user`.
 *
 * **Details**
 *
 * The service stores the embedding request payload without `input`. Requests
 * combine the selected model, layer or constructor config, and scoped context
 * config, with scoped context config taking precedence.
 *
 * @see {@link withConfigOverride} for scoping embedding request overrides
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Config extends Context.Service<
  Config,
  ConfigOptions & { readonly [x: string]: unknown }
>()("@effect/ai-openai-compat/OpenAiEmbeddingModel/Config") {}

/**
 * Creates an `AiModel` for an OpenAI-compatible embedding model with its configured vector dimensions.
 *
 * **When to use**
 *
 * Use to provide an OpenAI-compatible `EmbeddingModel` and its `Dimensions`
 * service to an Effect program.
 *
 * @see {@link layer} for providing only the embedding model service
 * @see {@link withConfigOverride} for scoped request configuration overrides
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const model = (
  model: string,
  options: Omit<ConfigOptions, "model" | "dimensions"> & {
    readonly dimensions: number
    readonly [x: string]: unknown
  }
): AiModel.Model<"openai", EmbeddingModel.EmbeddingModel | EmbeddingModel.Dimensions, OpenAiClient> =>
  AiModel.make(
    "openai",
    model,
    Layer.merge(
      layer({
        model,
        config: options
      }),
      Layer.succeed(EmbeddingModel.Dimensions, options.dimensions)
    )
  )

/**
 * Creates an OpenAI-compatible embedding model service backed by `OpenAiClient`.
 *
 * **When to use**
 *
 * Use when you need to build or provide an `EmbeddingModel` service directly
 * from an existing `OpenAiClient`.
 *
 * **Details**
 *
 * The service sends embedding requests through `OpenAiClient.createEmbedding`.
 * Request config is merged as the selected model, constructor config, then
 * scoped `Config`, so scoped overrides take precedence. Provider usage
 * `prompt_tokens` is exposed as `usage.inputTokens`.
 *
 * **Gotchas**
 *
 * Provider responses must contain one numeric vector for every requested input
 * with unique, in-range `index` values; otherwise embedding operations fail with
 * `AiError.InvalidOutputError`.
 *
 * @see {@link model} for the higher-level `AiModel` descriptor that also provides `EmbeddingModel.Dimensions`
 * @see {@link layer} for providing the service as a `Layer`
 * @see {@link withConfigOverride} for scoping embedding request overrides
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*({ model, config: providerConfig }: {
  readonly model: string
  readonly config?: ModelConfig | undefined
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
 * Creates a layer for an OpenAI-compatible embedding model service.
 *
 * **When to use**
 *
 * Use when composing application layers and you want an OpenAI-compatible
 * embeddings endpoint to satisfy `EmbeddingModel.EmbeddingModel` while
 * supplying `OpenAiClient` from another layer.
 *
 * @see {@link make} for constructing the embedding model service effectfully
 * @see {@link model} for creating an `AiModel` with configured dimensions
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options: {
  readonly model: string
  readonly config?: ModelConfig | undefined
}): Layer.Layer<EmbeddingModel.EmbeddingModel, never, OpenAiClient> =>
  Layer.effect(EmbeddingModel.EmbeddingModel, make(options))

/**
 * Provides scoped request config overrides for OpenAI-compatible embedding model operations.
 *
 * **When to use**
 *
 * Use to apply embedding request options to one effect without changing the
 * model's default configuration.
 *
 * **Details**
 *
 * The overrides are merged with any existing `Config` service for the duration
 * of the supplied effect. Fields in `overrides` take precedence over existing
 * config, and the helper supports both `effect.pipe(withConfigOverride(overrides))`
 * and `withConfigOverride(effect, overrides)`.
 *
 * @see {@link Config} for available OpenAI-compatible embedding request configuration fields
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
  response: CreateEmbedding200
): Effect.Effect<EmbeddingModel.ProviderResponse, AiError.AiError> => {
  if (response.data.length !== inputLength) {
    return Effect.fail(
      invalidOutput(`Provider returned ${response.data.length} embeddings but expected ${inputLength}`)
    )
  }

  const results = new Array<Array<number>>(inputLength)
  const seen = new Set<number>()

  for (const entry of response.data) {
    if (!Number.isInteger(entry.index) || entry.index < 0 || entry.index >= inputLength) {
      return Effect.fail(invalidOutput(`Provider returned invalid embedding index: ${entry.index}`))
    }
    if (seen.has(entry.index)) {
      return Effect.fail(invalidOutput(`Provider returned duplicate embedding index: ${entry.index}`))
    }
    if (!Array.isArray(entry.embedding)) {
      return Effect.fail(invalidOutput(`Provider returned non-vector embedding at index ${entry.index}`))
    }

    seen.add(entry.index)
    results[entry.index] = [...entry.embedding]
  }

  if (seen.size !== inputLength) {
    return Effect.fail(
      invalidOutput(`Provider returned embeddings for ${seen.size} inputs but expected ${inputLength}`)
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
