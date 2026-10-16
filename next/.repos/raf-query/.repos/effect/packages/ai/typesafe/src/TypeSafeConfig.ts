/**
 * Scoped HTTP client customization for TypeSafe requests.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import type { HttpClient } from "effect/http/HttpClient"

/**
 * Scoped configuration read when executing TypeSafe requests.
 *
 * @see {@link withClientTransform} for scoping an HTTP client transformation
 *
 * @category services
 * @since 4.0.0
 */
export class TypeSafeConfig extends Context.Service<
  TypeSafeConfig,
  TypeSafeConfig.Service
>()("@effect/ai-typesafe/TypeSafeConfig") {
  /**
   * Reads the current configuration, if present.
   *
   * @since 4.0.0
   */
  static readonly getOrUndefined: Effect.Effect<typeof TypeSafeConfig.Service | undefined> = Effect.map(
    Effect.context<never>(),
    Context.getOrUndefined(TypeSafeConfig)
  )
}

/**
 * Types used by the `TypeSafeConfig` context service.
 *
 * @since 4.0.0
 */
export declare namespace TypeSafeConfig {
  /**
   * Per-request HTTP client configuration.
   *
   * @category services
   * @since 4.0.0
   */
  export interface Service {
    readonly transformClient?: ((client: HttpClient) => HttpClient) | undefined
  }
}

/**
 * Transforms the TypeSafe HTTP client for requests made by the supplied effect.
 * Replaces any existing scoped transform; compose them manually to apply both.
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
    TypeSafeConfig.getOrUndefined,
    (config) => Effect.provideService(self, TypeSafeConfig, { ...config, transformClient })
  ))
