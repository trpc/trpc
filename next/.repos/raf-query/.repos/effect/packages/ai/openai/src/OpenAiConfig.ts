/**
 * The `OpenAiConfig` module lets a workflow temporarily customize the HTTP
 * client used by `@effect/ai-openai` request helpers. OpenAI client, language
 * model, and embedding code read this scoped transform when they execute
 * provider calls.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import type { HttpClient } from "effect/http/HttpClient"

/**
 * Context service for scoped OpenAI configuration used by provider operations.
 *
 * **When to use**
 *
 * Use to provide scoped OpenAI client configuration, such as an HTTP client
 * transform, to OpenAI provider operations without passing it through each call.
 *
 * @see {@link withClientTransform} for scoping an HTTP client transformation
 *
 * @category services
 * @since 4.0.0
 */
export class OpenAiConfig extends Context.Service<
  OpenAiConfig,
  OpenAiConfig.Service
>()("@effect/ai-openai/OpenAiConfig") {
  /**
   * Gets the configured OpenAI service from the current context when present.
   *
   * @since 4.0.0
   */
  static readonly getOrUndefined: Effect.Effect<typeof OpenAiConfig.Service | undefined> = Effect.map(
    Effect.context<never>(),
    Context.getOrUndefined(OpenAiConfig)
  )
}

/**
 * Types used by the `OpenAiConfig` context service.
 *
 * @since 4.0.0
 */
export declare namespace OpenAiConfig {
  /**
   * Configuration values read by OpenAI provider operations when executing
   * requests.
   *
   * @category services
   * @since 4.0.0
   */
  export interface Service {
    readonly transformClient?: ((client: HttpClient) => HttpClient) | undefined
  }
}

/**
 * Provides a scoped transform for the OpenAI HTTP client used by provider
 * operations.
 *
 * **When to use**
 *
 * Use when you need temporary OpenAI HTTP client customization for a single
 * effect or workflow without rebuilding the client layer.
 *
 * **Details**
 *
 * Supports both data-first and data-last forms. The transform is stored in the
 * scoped `OpenAiConfig` service and read by OpenAI provider operations while
 * running the supplied effect.
 *
 * **Gotchas**
 *
 * If a transform is already present in the scoped config, this helper replaces
 * it. Compose transforms manually when both should apply.
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
