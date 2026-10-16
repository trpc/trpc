/**
 * The `OpenAiConfig` module lets a workflow temporarily customize the HTTP
 * client used by OpenAI-compatible request helpers. Model, embedding, and
 * tool-calling code can use this scoped configuration to add middleware,
 * instrumentation, or routing without rebuilding the client layer.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import type { HttpClient } from "effect/http/HttpClient"

/**
 * Context service for OpenAI-compatible client configuration in the current
 * Effect scope.
 *
 * **When to use**
 *
 * Use as the context service for scoped OpenAI-compatible client configuration
 * and HTTP client transforms.
 *
 * @see {@link withClientTransform} for scoping an HTTP client transformation
 *
 * @category services
 * @since 4.0.0
 */
export class OpenAiConfig extends Context.Service<
  OpenAiConfig,
  OpenAiConfig.Service
>()("@effect/ai-openai-compat/OpenAiConfig") {
  /**
   * Gets the configured OpenAI-compatible service from the current context when present.
   *
   * @since 4.0.0
   */
  static readonly getOrUndefined: Effect.Effect<typeof OpenAiConfig.Service | undefined> = Effect.map(
    Effect.context<never>(),
    Context.getOrUndefined(OpenAiConfig)
  )
}

/**
 * Types associated with the `OpenAiConfig` context service.
 *
 * @since 4.0.0
 */
export declare namespace OpenAiConfig {
  /**
   * Configuration consumed by OpenAI-compatible clients when they build or
   * resolve the underlying HTTP client.
   *
   * @category services
   * @since 4.0.0
   */
  export interface Service {
    readonly transformClient?: ((client: HttpClient) => HttpClient) | undefined
  }
}

/**
 * Provides an HTTP client transform for the supplied effect.
 *
 * **When to use**
 *
 * Use to add provider-specific OpenAI-compatible HTTP behavior, such as
 * headers, retries, instrumentation, or proxy routing.
 *
 * **Details**
 *
 * OpenAI-compatible provider services read the transform from the
 * `OpenAiConfig` context.
 *
 * @category configuration
 * @since 4.0.0
 */
export const withClientTransform: {
  (transform: (client: HttpClient) => HttpClient): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Effect.Effect<A, E, R>, transform: (client: HttpClient) => HttpClient): Effect.Effect<A, E, R>
} = dual(2, <A, E, R>(
  self: Effect.Effect<A, E, R>,
  transformClient: (client: HttpClient) => HttpClient
) =>
  Effect.flatMap(
    OpenAiConfig.getOrUndefined,
    (config) => Effect.provideService(self, OpenAiConfig, { ...config, transformClient })
  ))
