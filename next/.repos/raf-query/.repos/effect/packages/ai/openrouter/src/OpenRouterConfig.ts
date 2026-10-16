/**
 * Scoped HTTP client customization for OpenRouter requests.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import type { HttpClient } from "effect/http/HttpClient"

/**
 * Scoped configuration read when executing OpenRouter requests.
 *
 * @see {@link withClientTransform} for scoping an HTTP client transformation
 *
 * @category services
 * @since 4.0.0
 */
export class OpenRouterConfig extends Context.Service<
  OpenRouterConfig,
  OpenRouterConfig.Service
>()("@effect/ai-openrouter/OpenRouterConfig") {
  /**
   * Gets the configured OpenRouter service from the current context when present.
   *
   * @since 4.0.0
   */
  static readonly getOrUndefined: Effect.Effect<typeof OpenRouterConfig.Service | undefined> = Effect.map(
    Effect.context<never>(),
    Context.getOrUndefined(OpenRouterConfig)
  )
}

/**
 * Types associated with the `OpenRouterConfig` context service.
 *
 * @since 4.0.0
 */
export declare namespace OpenRouterConfig {
  /**
   * HTTP client configuration for generated methods and alpha Decisions requests.
   *
   * @category services
   * @since 4.0.0
   */
  export interface Service {
    readonly transformClient?: ((client: HttpClient) => HttpClient) | undefined
  }
}

/**
 * Transforms the HTTP client for generated methods and alpha Decisions requests
 * made by the supplied effect. Streaming chat completions ignore this transform.
 * Replaces any existing scoped transform; compose them manually to apply both.
 *
 * @category configuration
 * @since 4.0.0
 */
export const withClientTransform: {
  (transform: (client: HttpClient) => HttpClient): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  <A, E, R>(self: Effect.Effect<A, E, R>, transform: (client: HttpClient) => HttpClient): Effect.Effect<A, E, R>
} = dual<
  (transform: (client: HttpClient) => HttpClient) => <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>,
  <A, E, R>(self: Effect.Effect<A, E, R>, transform: (client: HttpClient) => HttpClient) => Effect.Effect<A, E, R>
>(
  2,
  (self, transformClient) =>
    Effect.flatMap(
      OpenRouterConfig.getOrUndefined,
      (config) => Effect.provideService(self, OpenRouterConfig, { ...config, transformClient })
    )
)
