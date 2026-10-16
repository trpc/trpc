/**
 * The `AnthropicConfig` module lets a workflow temporarily customize the HTTP
 * client used by generated Anthropic requests. It is used by
 * `AnthropicClient` when request helpers run, so code can add middleware,
 * logging, or other client changes without rebuilding the client layer.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import type { HttpClient } from "effect/http/HttpClient"

/**
 * Service tag for Anthropic client configuration overrides, such as transformations applied to the generated HTTP client.
 *
 * **When to use**
 *
 * Use when you need to provide or read Anthropic client configuration through
 * Effect's context from a layer or integration.
 *
 * @see {@link withClientTransform} for scoping an HTTP client transformation
 *
 * @category services
 * @since 4.0.0
 */
export class AnthropicConfig extends Context.Service<
  AnthropicConfig,
  AnthropicConfig.Service
>()("@effect/ai-anthropic/AnthropicConfig") {
  /**
   * Gets the configured Anthropic service from the current context when present.
   *
   * @since 4.0.0
   */
  static readonly getOrUndefined: Effect.Effect<typeof AnthropicConfig.Service | undefined> = Effect.map(
    Effect.context<never>(),
    Context.getOrUndefined(AnthropicConfig)
  )
}

/**
 * Namespace containing types associated with the `AnthropicConfig` service.
 *
 * @since 4.0.0
 */
export declare namespace AnthropicConfig {
  /**
   * Configuration provided through `AnthropicConfig`.
   *
   * **Details**
   *
   * Use `transformClient` to wrap or replace the `HttpClient` used by generated Anthropic API requests.
   *
   * @category services
   * @since 4.0.0
   */
  export interface Service {
    readonly transformClient?: ((client: HttpClient) => HttpClient) | undefined
  }
}

/**
 * Runs an effect with an `AnthropicConfig` override that transforms the underlying `HttpClient` used by generated Anthropic requests.
 *
 * **When to use**
 *
 * Use when you need to apply a temporary `HttpClient` transformation, such as adding middleware or logging, to a
 * specific scope of an effectful program.
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
    AnthropicConfig.getOrUndefined,
    (config) => Effect.provideService(self, AnthropicConfig, { ...config, transformClient })
  ))
